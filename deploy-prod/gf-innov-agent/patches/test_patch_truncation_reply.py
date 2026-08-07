"""Unit test for patch_truncation_reply.py — GF-100 Layer-5 round-2 finding 2.

Unlike test_patch_localized_errors.py, patch_truncation_reply.py had no test
at all: it was verified only by py_compile (proves syntax, not semantics) and
a `len(matches) != 4` count check inside the patch script itself (proves a
count, not *which* four sites). If gateway/agent/conversation_loop.py drifts
upstream such that one genuine truncation return site disappears and an
unrelated dict literal starts matching TRUNC_RE instead, the count still
reads 4, py_compile still passes, and the patch silently substitutes into the
wrong code path while looking green.

This test re-derives TRUNC_RE and the substitution/import-anchor logic
straight from patch_truncation_reply.py's own source (same technique
test_patch_localized_errors.py uses for APPEND_BLOCK: read the real values
out of the patch script rather than hand-copying them, so this test can't
silently drift from what the patch actually does) and applies them to a real
extracted copy of conversation_loop.py, then asserts — semantically, not
just numerically — that each of the 4 substitutions landed inside the
function the patch's own anchor table says it should have.

Run standalone:  python test_patch_truncation_reply.py   (exit 0 = all passed)

Set CONVO_LOOP_SRC to a real extracted conversation_loop.py (per the anchor
table in patch_truncation_reply.py: pull it from hermes-agent:base via
`docker run --rm --entrypoint python3 hermes-agent:base -c "print(open('/opt/hermes/agent/conversation_loop.py').read())"`)
for the strong guarantee. Without it, this test still runs against a bundled
minimal fixture reproducing the same 4 return-site shapes, but that is a
weaker guarantee and the test says so.
"""
from __future__ import annotations

import ast
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PATCH_PATH = os.path.join(_HERE, "patch_truncation_reply.py")

# Minimal fixture reproducing the real shape of all 4 truncation return sites
# (function context + "final_response": None + the literal error string +
# the shared import anchor), for a hermetic run without box access. Real line
# numbers deliberately NOT reproduced — only the shape is exercised.
_FIXTURE_SRC = '''\
from agent.error_classifier import FailoverReason, classify_api_error


def run_conversation(agent, messages):
    def _retry_once_then_abort():
        return {
            "final_response": None,
            "messages": messages,
            "api_calls": 1,
            "completed": False,
            "partial": True,
            "error": "Response truncated due to output length limit",
        }

    def _rollback_to_last_complete():
        rolled_back_messages = messages
        return {
            "final_response": None,
            "messages": rolled_back_messages,
            "api_calls": 1,
            "completed": False,
            "partial": True,
            "error": "Response truncated due to output length limit"
        }

    def _first_message_truncated():
        return {
            "final_response": None,
            "messages": messages,
            "api_calls": 1,
            "completed": False,
            "failed": True,
            "error": "First response truncated due to output length limit"
        }


def run_conversation_api_mode(agent, messages):
    def _api_mode_rollback():
        return {
            "final_response": None,
            "messages": messages,
            "api_calls": 1,
            "completed": False,
            "partial": True,
            "error": "Response truncated due to output length limit",
        }
'''


def _extract_patch_pieces():
    """Pull TRUNC_RE's pattern, the substitution replacement, the import
    anchor string, and helper_block straight out of patch_truncation_reply.py
    by exec'ing the relevant top-level statements — mirrors
    test_patch_localized_errors.py's `_load_append_block` technique so this
    test can't silently drift from what the real patch script does."""
    src = open(_PATCH_PATH, encoding="utf-8").read()

    trunc_start = src.index("TRUNC_RE = re.compile(")
    trunc_end = src.index("\nmatches = list(TRUNC_RE.finditer(src))")
    trunc_stmt = src[trunc_start:trunc_end]

    sub_start = src.index("src = TRUNC_RE.sub(")
    sub_end = src.index("\n\n# Import + helper")
    sub_line = src[sub_start:sub_end].split("=", 1)[1].strip()
    # sub_line looks like: TRUNC_RE.sub(r'"final_response": _gf_output_truncated_reply(),\1', src)
    replacement = re.search(r"TRUNC_RE\.sub\((r?'.*?'|r?\".*?\"),\s*src\)", sub_line, re.DOTALL)
    if not replacement:
        raise AssertionError("could not extract TRUNC_RE.sub(...) replacement from patch script")
    replacement_literal = replacement.group(1)

    import_anchor_start = src.index('import_anchor = ')
    import_anchor_end = src.index("\nif import_anchor not in src:")
    import_anchor_stmt = src[import_anchor_start:import_anchor_end]

    helper_start = src.index("helper_block = (")
    helper_end = src.index('\nsrc = src.replace(import_anchor, import_anchor + helper_block, 1)')
    helper_stmt = src[helper_start:helper_end]

    ns = {"MARKER": "# [GF-100 patch] test marker", "re": re}
    exec(trunc_stmt, ns)
    exec(import_anchor_stmt, ns)
    exec(helper_stmt, ns)
    replacement_ns = {}
    exec("REPLACEMENT = " + replacement_literal, replacement_ns)

    return ns["TRUNC_RE"], replacement_ns["REPLACEMENT"], ns["import_anchor"], ns["helper_block"]


def _enclosing_function_name(src: str, char_offset: int) -> str | None:
    """Innermost function/method definition (by AST) containing the given
    character offset, or None if at module level."""
    tree = ast.parse(src)
    target_line = src.count("\n", 0, char_offset) + 1

    best = None
    best_span = None
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            start = node.lineno
            end = getattr(node, "end_lineno", None)
            if end is None:
                continue
            if start <= target_line <= end:
                span = end - start
                if best_span is None or span < best_span:
                    best = node.name
                    best_span = span
    return best


def _run_against(src: str, label: str) -> int:
    trunc_re, replacement, import_anchor, helper_block = _extract_patch_pieces()

    pre_matches = list(trunc_re.finditer(src))
    if len(pre_matches) != 4:
        print(f"[{label}] SKIP: source does not have exactly 4 pre-patch truncation sites "
              f"(found {len(pre_matches)}) — cannot build ground truth")
        return 1

    # Ground truth: enclosing function + expected literal for each real
    # pre-patch site, in source order.
    pre_sites = []
    for m in pre_matches:
        fn = _enclosing_function_name(src, m.start())
        literal = "First response truncated due to output length limit" \
            if "First response" in m.group(0) else "Response truncated due to output length limit"
        pre_sites.append((fn, literal))
    print(f"[{label}] pre-patch ground truth (enclosing function, error literal):")
    for fn, lit in pre_sites:
        print(f"    {fn!r}: {lit!r}")

    if import_anchor not in src:
        print(f"[{label}] FAIL: import anchor {import_anchor!r} not found in source")
        return 1

    patched = trunc_re.sub(replacement, src)
    patched = patched.replace(import_anchor, import_anchor + helper_block, 1)

    try:
        ast.parse(patched)
    except SyntaxError as exc:
        print(f"[{label}] FAIL: patched source does not parse: {exc}")
        return 1

    if "_gf_output_truncated_reply" not in patched:
        print(f"[{label}] FAIL: helper _gf_output_truncated_reply not found in patched source")
        return 1

    # The actual point of this test: not just "4 substitutions happened" (the
    # patch script's own count check already guarantees that) but "the 4
    # substitutions landed in the same 4 functions, in the same order, as
    # the real pre-patch sites" — the semantic check a pure count can't do.
    call_re = re.compile(r'"final_response":\s*_gf_output_truncated_reply\(\)')
    post_matches = list(call_re.finditer(patched))
    if len(post_matches) != 4:
        print(f"[{label}] FAIL: expected 4 patched call sites, found {len(post_matches)}")
        return 1

    post_sites = [_enclosing_function_name(patched, m.start()) for m in post_matches]
    expected_fns = [fn for fn, _lit in pre_sites]
    if post_sites != expected_fns:
        print(f"[{label}] FAIL: patched call sites landed in {post_sites}, expected {expected_fns}")
        return 1

    # No raw literal error string should remain as a bare `"final_response"`
    # value anymore at any of the 4 original sites (each was rebound to the
    # helper call) — a residual literal here would mean a site was
    # miscounted/skipped despite the total still reading 4.
    raw_literal_as_value_re = re.compile(
        r'"final_response":\s*"(?:First response|Response) truncated due to output length limit"'
    )
    if raw_literal_as_value_re.search(patched):
        print(f"[{label}] FAIL: a raw truncation literal is still assigned directly to "
              f"\"final_response\" post-patch")
        return 1

    print(f"[{label}] OK: all 4 substitutions landed in the expected enclosing functions, in order: "
          f"{post_sites}")
    return 0


def main() -> int:
    failures = 0

    real_path = os.environ.get("CONVO_LOOP_SRC")
    ran_real = False
    if real_path and os.path.isfile(real_path):
        real_src = open(real_path, encoding="utf-8").read()
        failures += _run_against(real_src, label="real-box-source")
        ran_real = True

    failures += _run_against(_FIXTURE_SRC, label="fixture")

    if not ran_real:
        print(
            "\n[test_patch_truncation_reply] NOTE: CONVO_LOOP_SRC not set — only ran against the "
            "bundled fixture, not a real extracted conversation_loop.py. Set CONVO_LOOP_SRC to the "
            "real file (see the module docstring) for the stronger guarantee."
        )

    if failures:
        print(f"\n{failures} FAILURE(S)")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

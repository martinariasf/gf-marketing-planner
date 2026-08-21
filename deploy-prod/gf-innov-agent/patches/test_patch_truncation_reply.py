"""Unit test for patch_truncation_reply.py — GF-100 Layer-5 round-2 finding 2,
extended 2026-08-10 for GF-100's staging-base coverage.

Unlike test_patch_localized_errors.py, patch_truncation_reply.py originally
had no test at all: it was verified only by py_compile (proves syntax, not
semantics) and a `len(matches) != 4` count check inside the patch script
itself (proves a count, not *which* four sites). If gateway/agent/
conversation_loop.py drifts upstream such that one genuine truncation return
site disappears and an unrelated dict literal starts matching instead, the
count still reads 4, py_compile still passes, and the patch silently
substitutes into the wrong code path while looking green.

This test re-derives the patch script's regexes and substitution logic
straight from patch_truncation_reply.py's own source (same technique
test_patch_localized_errors.py uses for APPEND_BLOCK: read the real values
out of the patch script rather than hand-copying them, so this test can't
silently drift from what the patch actually does) and applies them to real
extracted copies of conversation_loop.py from BOTH known hermes-agent bases,
then asserts — semantically, not just numerically — that the substitutions
landed in the right places.

Two shapes are covered:

  * none-form (hermes-agent:base, prod,
    sha256:7912de37a2ad4bca0a10cec0d61060b4a3287ac010ffe1992004cad9c5dac538):
    4 sites, each `"final_response": None` paired with a literal "error" —
    unchanged behaviour from the original test, still exercised via
    TRUNC_RE.

  * literal-form (hermes-agent:base-v2026.7.1, staging,
    sha256:b43257d3de7a8a363431a7fa1ab8d5e5b7b7b910218d65e581f693413ca8f73d):
    4 sites total — 1 ternary (only the truncated branch is localized, the
    stall-message branch must survive untouched) + 3 paired
    "final_response"/"error" literal sites (only "final_response" is
    localized; the sibling "error" literal at each of those 3 sites must
    survive untouched, since it's an internal diagnostic, not user-facing).

Run standalone:  python test_patch_truncation_reply.py   (exit 0 = all passed)

Set CONVO_LOOP_SRC_PROD / CONVO_LOOP_SRC_STAGING to real extracted
conversation_loop.py files (per the anchor tables in
patch_truncation_reply.py) for the strong guarantee. Without them, this test
still runs against bundled minimal fixtures reproducing the same shapes, but
that is a weaker guarantee and the test says so.
"""
from __future__ import annotations

import ast
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PATCH_PATH = os.path.join(_HERE, "patch_truncation_reply.py")

# Minimal fixture reproducing the real shape of all 4 none-form truncation
# return sites (function context + "final_response": None + the literal
# error string + the shared import anchor), for a hermetic run without box
# access. Real line numbers deliberately NOT reproduced — only the shape is
# exercised.
_NONE_FORM_FIXTURE_SRC = '''\
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

# Minimal fixture reproducing the real shape of the literal-form base: the
# stall-vs-truncation ternary (only its truncated branch is a target) plus
# the 3 paired final_response/error literal sites. Real line numbers
# deliberately NOT reproduced — only the shape is exercised.
_LITERAL_FORM_FIXTURE_SRC = '''\
from agent.error_classifier import FailoverReason, classify_api_error


def run_conversation(agent, messages):
    def _stall_or_truncated_retry_exhausted(_is_stub_stall):
        _final_response = (
            "Stream repeatedly dropped mid tool-call (network); "
            "the tool was not executed"
            if _is_stub_stall
            else "Response truncated due to output length limit"
        )
        return {
            "final_response": _final_response,
            "messages": messages,
            "api_calls": 1,
            "completed": False,
            "partial": True,
            "error": _final_response,
        }

    def _rollback_to_last_complete():
        rolled_back_messages = messages
        return {
            "final_response": "Response truncated due to output length limit",
            "messages": rolled_back_messages,
            "api_calls": 1,
            "completed": False,
            "partial": True,
            "error": "Response truncated due to output length limit"
        }

    def _first_message_truncated():
        return {
            "final_response": "First response truncated due to output length limit",
            "messages": messages,
            "api_calls": 1,
            "completed": False,
            "failed": True,
            "error": "First response truncated due to output length limit"
        }


def run_conversation_api_mode(agent, messages):
    def _invalid_json_truncated():
        return {
            "final_response": "Response truncated due to output length limit",
            "messages": messages,
            "api_calls": 1,
            "completed": False,
            "partial": True,
            "error": "Response truncated due to output length limit",
        }
'''


def _extract_patch_pieces():
    """Pull TRUNC_RE, TERNARY_RE, LITERAL_PAIR_RE, the import anchor, and
    helper_block straight out of patch_truncation_reply.py by exec'ing the
    relevant top-level statements — mirrors test_patch_localized_errors.py's
    `_load_append_block` technique so this test can't silently drift from
    what the real patch script does."""
    src = open(_PATCH_PATH, encoding="utf-8").read()

    trunc_start = src.index("TRUNC_RE = re.compile(")
    trunc_end = src.index("\n\n# --- Shape 2")
    trunc_stmt = src[trunc_start:trunc_end]

    ternary_start = src.index("TERNARY_RE = re.compile(")
    ternary_end = src.index("\n\n# 2b. The three paired sites")
    ternary_stmt = src[ternary_start:ternary_end]

    pair_start = src.index("LITERAL_PAIR_RE = re.compile(")
    pair_end = src.index("\n\nnone_matches = list(")
    pair_stmt = src[pair_start:pair_end]

    import_anchor_start = src.index('import_anchor = ')
    import_anchor_end = src.index("\nif import_anchor not in src:")
    import_anchor_stmt = src[import_anchor_start:import_anchor_end]

    helper_start = src.index("helper_block = (")
    helper_end = src.index('\nsrc = src.replace(import_anchor, import_anchor + helper_block, 1)')
    helper_stmt = src[helper_start:helper_end]

    ns = {"MARKER": "# [GF-100 patch] test marker", "re": re}
    exec(trunc_stmt, ns)
    exec(ternary_stmt, ns)
    exec(pair_stmt, ns)
    exec(import_anchor_stmt, ns)
    exec(helper_stmt, ns)

    return (
        ns["TRUNC_RE"],
        ns["TERNARY_RE"],
        ns["LITERAL_PAIR_RE"],
        ns["import_anchor"],
        ns["helper_block"],
    )


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


def _run_against_none_form(src: str, label: str) -> int:
    trunc_re, _ternary_re, _pair_re, import_anchor, helper_block = _extract_patch_pieces()

    pre_matches = list(trunc_re.finditer(src))
    if len(pre_matches) != 4:
        print(f"[{label}] SKIP: source does not have exactly 4 pre-patch none-form "
              f"truncation sites (found {len(pre_matches)}) — cannot build ground truth")
        return 1

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

    patched = trunc_re.sub(r'"final_response": _gf_output_truncated_reply(),\1', src)
    patched = patched.replace(import_anchor, import_anchor + helper_block, 1)

    try:
        ast.parse(patched)
    except SyntaxError as exc:
        print(f"[{label}] FAIL: patched source does not parse: {exc}")
        return 1

    if "_gf_output_truncated_reply" not in patched:
        print(f"[{label}] FAIL: helper _gf_output_truncated_reply not found in patched source")
        return 1

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

    raw_literal_as_value_re = re.compile(
        r'"final_response":\s*"(?:First response|Response) truncated due to output length limit"'
    )
    if raw_literal_as_value_re.search(patched):
        print(f"[{label}] FAIL: a raw truncation literal is still assigned directly to "
              f"\"final_response\" post-patch")
        return 1

    print(f"[{label}] OK (none-form): all 4 substitutions landed in the expected enclosing "
          f"functions, in order: {post_sites}")
    return 0


def _run_against_literal_form(src: str, label: str) -> int:
    _trunc_re, ternary_re, pair_re, import_anchor, helper_block = _extract_patch_pieces()

    ternary_pre = list(ternary_re.finditer(src))
    pair_pre = list(pair_re.finditer(src))
    if len(ternary_pre) != 1 or len(pair_pre) != 3:
        print(f"[{label}] SKIP: source does not have exactly 1 ternary + 3 paired "
              f"literal-form sites (found ternary={len(ternary_pre)}, pair={len(pair_pre)}) "
              "— cannot build ground truth")
        return 1

    # Ground truth: capture the untouched stall-message branch text and the
    # 3 sibling "error" literals, so we can assert afterward they survived
    # verbatim.
    stall_branch_re = re.compile(
        r'"Stream repeatedly dropped mid tool-call \(network\); "\s*\n\s*"the tool was not executed"'
    )
    if not stall_branch_re.search(src):
        print(f"[{label}] FAIL: could not locate the stall-message branch to use as ground truth")
        return 1

    pre_error_literals = []
    for m in pair_pre:
        fn = _enclosing_function_name(src, m.start())
        pre_error_literals.append((fn, m.group(1)))
    print(f"[{label}] pre-patch ground truth (enclosing function, error literal):")
    for fn, lit in pre_error_literals:
        print(f"    {fn!r}: {lit!r}")

    if import_anchor not in src:
        print(f"[{label}] FAIL: import anchor {import_anchor!r} not found in source")
        return 1

    patched = ternary_re.sub('else _gf_output_truncated_reply()', src)
    patched = pair_re.sub(r'"final_response": _gf_output_truncated_reply(),\2', patched)
    patched = patched.replace(import_anchor, import_anchor + helper_block, 1)

    try:
        ast.parse(patched)
    except SyntaxError as exc:
        print(f"[{label}] FAIL: patched source does not parse: {exc}")
        return 1

    if "_gf_output_truncated_reply" not in patched:
        print(f"[{label}] FAIL: helper _gf_output_truncated_reply not found in patched source")
        return 1

    # 1. The stall-message branch of the ternary must be untouched.
    if not stall_branch_re.search(patched):
        print(f"[{label}] FAIL: stall-message ternary branch was modified — it must survive verbatim")
        return 1

    # 2. The ternary's truncated branch must now call the helper, and the
    # bare literal must no longer appear as the else-branch.
    if 'else _gf_output_truncated_reply()' not in patched:
        print(f"[{label}] FAIL: ternary truncated branch was not localized")
        return 1
    if re.search(r'else "Response truncated due to output length limit"', patched):
        print(f"[{label}] FAIL: raw literal still present in ternary's truncated branch")
        return 1

    # 3. All 3 paired final_response sites must now call the helper, in the
    # same enclosing functions as before (order/identity preserved).
    call_re = re.compile(r'"final_response":\s*_gf_output_truncated_reply\(\)')
    post_calls = [m for m in call_re.finditer(patched)]
    # 4 total: 1 from the ternary (inside the "final_response": _final_response
    # dict key is NOT itself replaced — only the assignment feeding it is —
    # so the ternary site is asserted via _final_response usage below, and
    # this call_re count should be exactly 3 (the paired literal sites only).
    if len(post_calls) != 3:
        print(f"[{label}] FAIL: expected 3 patched paired call sites, found {len(post_calls)}")
        return 1
    post_fns = [_enclosing_function_name(patched, m.start()) for m in post_calls]
    expected_fns = [fn for fn, _lit in pre_error_literals]
    if post_fns != expected_fns:
        print(f"[{label}] FAIL: patched paired call sites landed in {post_fns}, expected {expected_fns}")
        return 1

    # 4. No raw literal may remain directly assigned to "final_response" at
    # any of the 3 paired sites.
    raw_literal_as_value_re = re.compile(
        r'"final_response":\s*"(?:First response|Response) truncated due to output length limit"'
    )
    if raw_literal_as_value_re.search(patched):
        print(f"[{label}] FAIL: a raw truncation literal is still assigned directly to "
              f"\"final_response\" post-patch")
        return 1

    # 5. The 3 sibling "error" literals must survive completely untouched —
    # these are internal diagnostics, not user-facing, and must NOT be
    # localized.
    for fn, lit in pre_error_literals:
        error_literal_re = re.compile(r'"error":\s*"' + re.escape(lit) + r'"')
        if not error_literal_re.search(patched):
            print(f"[{label}] FAIL: sibling \"error\" literal {lit!r} in {fn!r} was modified "
                  f"or removed — it must stay untouched")
            return 1

    # 6. The ternary's own "error" key (which shares _final_response with
    # final_response at that one site, not a separate literal) should still
    # resolve through the same variable — i.e. "error": _final_response must
    # still be present verbatim, proving that site's error key was not
    # independently rewritten.
    if '"error": _final_response,' not in patched:
        print(f"[{label}] FAIL: ternary site's \"error\": _final_response wiring was disturbed")
        return 1

    print(f"[{label}] OK (literal-form): ternary truncated branch localized, stall branch "
          f"untouched, 3 paired final_response sites localized in {post_fns}, all 3 sibling "
          f"error literals and the stall branch left byte-for-byte untouched")
    return 0


def main() -> int:
    failures = 0
    ran_real = False

    real_prod_path = os.environ.get("CONVO_LOOP_SRC_PROD") or os.environ.get("CONVO_LOOP_SRC")
    if real_prod_path and os.path.isfile(real_prod_path):
        real_src = open(real_prod_path, encoding="utf-8").read()
        failures += _run_against_none_form(real_src, label="real-prod-base-source")
        ran_real = True

    real_staging_path = os.environ.get("CONVO_LOOP_SRC_STAGING")
    if real_staging_path and os.path.isfile(real_staging_path):
        real_src = open(real_staging_path, encoding="utf-8").read()
        failures += _run_against_literal_form(real_src, label="real-staging-base-source")
        ran_real = True

    failures += _run_against_none_form(_NONE_FORM_FIXTURE_SRC, label="fixture-none-form")
    failures += _run_against_literal_form(_LITERAL_FORM_FIXTURE_SRC, label="fixture-literal-form")

    if not ran_real:
        print(
            "\n[test_patch_truncation_reply] NOTE: neither CONVO_LOOP_SRC_PROD nor "
            "CONVO_LOOP_SRC_STAGING was set — only ran against the bundled fixtures, not real "
            "extracted conversation_loop.py files. Set them to the real files (see the module "
            "docstring) for the stronger guarantee."
        )

    if failures:
        print(f"\n{failures} FAILURE(S)")
        return 1
    print("\nAll checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

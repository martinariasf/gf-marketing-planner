#!/usr/bin/env python3
# [GF-100] Localize the "response truncated" case on the agent (Telegram/TUI)
# side. Separate from patch_localized_errors.py on purpose — different target
# file (agent/conversation_loop.py, not gateway/run.py), different failure
# mode (a truncated model response, not a provider/API error), independently
# revertible.
#
# Anchor table (verified 2026-08-06 against hermes-agent:base,
# sha256:7912de37a2ad4bca0a10cec0d61060b4a3287ac010ffe1992004cad9c5dac538,
# extracted via `docker run --rm --entrypoint python3 hermes-agent:base -c
# "print(open('/opt/hermes/agent/conversation_loop.py').read())"`):
#
#   Site                                              real line   literal error string
#   retry-once-then-abort (truncated tool call)        1490-1499   "Response truncated due to output length limit"
#   rollback to last complete assistant turn           1507-1516   "Response truncated due to output length limit"
#   first message truncated, cannot recover            1519-1528   "First response truncated due to output length limit"
#   api_mode-specific rollback (2nd occurrence)         3205-3214   "Response truncated due to output length limit"
#
# All four sites return `"final_response": None` alongside one of those two
# literal error strings. gateway/run.py's `_normalize_empty_agent_response`
# then has to invent English filler text for the None case (see
# patch_localized_errors.py) — but the truncation case has a much better fix:
# make conversation_loop.py return the localized copy directly as
# final_response, so `_normalize_empty_agent_response`'s `if response: return
# response` short-circuits and the raw English error string is never surfaced
# to the user in the first place.
#
# Mechanism: regex-replace (not literal-string-replace) because the four
# sites share the same two error strings but differ in surrounding
# indentation/dict-key order, which would make exact-string anchors fragile.
# The regex anchors on the stable pair ("final_response": None, ... "error":
# "<one of the two literal strings>") and requires exactly 4 matches — if
# conversation_loop.py changes upstream and the count drifts, this hard-fails
# instead of silently patching the wrong number of sites.
import sys, re, py_compile, shutil

p = "/opt/hermes/agent/conversation_loop.py"
src = open(p, encoding="utf-8").read()

MARKER = "# [GF-100 patch] localized output_truncated reply"
if MARKER in src:
    print("[patch_truncation_reply] already applied — skipping")
    py_compile.compile(p, doraise=True)
    print("[patch_truncation_reply] applied + compiled OK (idempotent no-op)")
    sys.exit(0)

# [^{}]*? (not .*?) between the two keys: a bounded, brace-free gap. An
# unbounded .*? here is unsafe — it will happily span across an unrelated
# dict in between (verified against the real extracted source: an earlier
# draft of this regex merged the generic `"error": str(api_error)` site at
# ~2753 with the genuine truncation site at ~3213, corrupting the former and
# silently skipping the latter). Disallowing braces keeps each match inside
# a single flat dict literal.
TRUNC_RE = re.compile(
    r'"final_response":\s*None,([^{}]*?"error":\s*"'
    r'(?:First response|Response) truncated due to output length limit"\s*,?\s*\n)',
    re.DOTALL,
)

matches = list(TRUNC_RE.finditer(src))
if len(matches) != 4:
    print(
        f"[patch_truncation_reply] ERROR: expected 4 truncation return sites, "
        f"found {len(matches)}; conversation_loop.py changed upstream — refusing to patch",
        file=sys.stderr,
    )
    sys.exit(1)

src = TRUNC_RE.sub(r'"final_response": _gf_output_truncated_reply(),\1', src)

# Import + helper, appended once near the top-level imports so
# _gf_output_truncated_reply is defined before any of the 4 call sites run
# (they're all inside functions, so definition order in the module doesn't
# actually matter at call time — but keep it readable near the top).
import_anchor = "from agent.error_classifier import FailoverReason, classify_api_error"
if import_anchor not in src:
    print(
        "[patch_truncation_reply] ERROR: import anchor not found; conversation_loop.py changed upstream",
        file=sys.stderr,
    )
    sys.exit(1)

helper_block = (
    "\n" + MARKER + "\n"
    "from agent._gf_messages import render as _gf_render, resolve_gf_lang as _gf_resolve_lang\n\n\n"
    "def _gf_output_truncated_reply() -> str:\n"
    "    \"\"\"Localized replacement for the raw 'Response truncated due to output\n"
    "    length limit' error that used to reach Telegram/TUI users verbatim.\"\"\"\n"
    "    return _gf_render(\"output_truncated\", _gf_resolve_lang())\n"
)
src = src.replace(import_anchor, import_anchor + helper_block, 1)

open(p, "w", encoding="utf-8").write(src)
py_compile.compile(p, doraise=True)
print("[patch_truncation_reply] applied + compiled OK (4 sites patched)")

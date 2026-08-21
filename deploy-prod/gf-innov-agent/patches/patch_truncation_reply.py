#!/usr/bin/env python3
# [GF-100] Localize the "response truncated" case on the agent (Telegram/TUI)
# side. Separate from patch_localized_errors.py on purpose — different target
# file (agent/conversation_loop.py, not gateway/run.py), different failure
# mode (a truncated model response, not a provider/API error), independently
# revertible.
#
# TWO BASE SHAPES.
# ================
#
# hermes-agent:base (PROD base), sha256:
# 7912de37a2ad4bca0a10cec0d61060b4a3287ac010ffe1992004cad9c5dac538 — "None-form":
#
#   Site                                              real line   literal error string
#   retry-once-then-abort (truncated tool call)        1490-1499   "Response truncated due to output length limit"
#   rollback to last complete assistant turn           1507-1516   "Response truncated due to output length limit"
#   first message truncated, cannot recover            1519-1528   "First response truncated due to output length limit"
#   api_mode-specific rollback (2nd occurrence)         3205-3214   "Response truncated due to output length limit"
#
#   All four sites return `"final_response": None` alongside one of those two
#   literal error strings — the raw string only reaches the `"error"` key,
#   never the user. gateway/run.py's `_normalize_empty_agent_response` then
#   has to invent English filler text for the None case (see
#   patch_localized_errors.py).
#
# hermes-agent:base-v2026.7.1 (STAGING base), sha256:
# b43257d3de7a8a363431a7fa1ab8d5e5b7b7b910218d65e581f693413ca8f73d — "literal-form":
#
#   Upstream already partially fixed this on the newer base: `"final_response":
#   None` does not occur anywhere in this file (0 sites). Instead, all four
#   equivalent sites put the raw English literal directly into
#   `"final_response"` — the user now gets untranslated English instead of
#   nothing, which is progress, but still not localized. Verified 2026-08-10
#   against the real extracted source (line numbers below are as extracted;
#   they will not match a checked-out copy of this repo):
#
#   Site                                                real line   final_response value               error key present?
#   truncated-tool-call retry loop, stall-vs-truncation  1896-1909   ternary: literal only in the        no separate "error"
#     ternary (only the truncated branch is a literal;               truncated branch — the stall       literal here; "error"
#     the stall-message branch is a DIFFERENT string and              branch stays a different,          key reuses whichever
#     must not be touched)                                            untouched string                   branch fired
#   rollback to last complete assistant turn             1920/1925   "Response truncated..."             yes — literal, sibling
#   first message truncated, cannot recover              1933/1938   "First response truncated..."       yes — literal, sibling
#   invalid-JSON-args truncation (tool_calls path)        4389/4394   "Response truncated..."             yes — literal, sibling
#
#   Only the four `"final_response"` sites are user-facing and get localized.
#   The three sibling `"error": "..."` literals (1925, 1938, 4394) are
#   internal diagnostics surfaced to logs/telemetry, not to the end user —
#   they are deliberately left untouched, as is the untruncated ("stall")
#   branch of the ternary.
#
# Mechanism: regex-replace (not literal-string-replace) because sites share
# error strings but differ in surrounding indentation/dict-key order, which
# would make exact-string anchors fragile. Detection tries the None-form
# anchor first; if that doesn't match exactly 4 times, it tries the
# literal-form anchors (ternary + paired final_response/error literal); if
# neither shape matches its expected count, this hard-fails instead of
# silently doing nothing or patching the wrong number of sites.
import sys, re, py_compile

p = "/opt/hermes/agent/conversation_loop.py"
src = open(p, encoding="utf-8").read()

MARKER = "# [GF-100 patch] localized output_truncated reply"
if MARKER in src:
    print("[patch_truncation_reply] already applied — skipping")
    py_compile.compile(p, doraise=True)
    print("[patch_truncation_reply] applied + compiled OK (idempotent no-op)")
    sys.exit(0)

# --- Shape 1: None-form (prod base) ----------------------------------------
#
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

# --- Shape 2: literal-form (staging base) -----------------------------------
#
# 2a. The ternary's truncated branch: `else "Response truncated due to output
# length limit"`. Anchored on the literal `else "..."` text only — this
# deliberately does NOT touch the `if _is_stub_stall` / stall-message branch,
# which is a different string entirely and must survive untouched.
TERNARY_RE = re.compile(
    r'else "Response truncated due to output length limit"',
)

# 2b. The three paired sites: "final_response": "<literal>", ... "error":
# "<same literal>". Backreference (\1) ties the error string to the SAME
# variant (Response vs First response) as the final_response string in that
# same dict, so this can't cross-match a final_response of one variant with
# an unrelated error literal of the other. Group 2 (including the untouched
# "error" line) is preserved verbatim in the substitution — only the
# final_response value itself is replaced with the helper call.
LITERAL_PAIR_RE = re.compile(
    r'"final_response":\s*"((?:First response|Response) truncated due to output length limit)",'
    r'([^{}]*?"error":\s*"\1"\s*,?\s*\n)',
    re.DOTALL,
)

none_matches = list(TRUNC_RE.finditer(src))
ternary_matches = list(TERNARY_RE.finditer(src))
pair_matches = list(LITERAL_PAIR_RE.finditer(src))

if len(none_matches) == 4:
    shape = "none-form"
elif len(ternary_matches) == 1 and len(pair_matches) == 3:
    shape = "literal-form"
else:
    print(
        "[patch_truncation_reply] ERROR: conversation_loop.py matches neither known shape — "
        f"none-form sites={len(none_matches)} (want 4), "
        f"literal-form ternary sites={len(ternary_matches)} (want 1), "
        f"literal-form paired sites={len(pair_matches)} (want 3); "
        "conversation_loop.py changed upstream — refusing to patch",
        file=sys.stderr,
    )
    sys.exit(1)

if shape == "none-form":
    src = TRUNC_RE.sub(r'"final_response": _gf_output_truncated_reply(),\1', src)
    applied_note = "applied + compiled OK (none-form, 4 sites patched)"
else:
    # Localize the ternary's truncated branch only.
    src = TERNARY_RE.sub('else _gf_output_truncated_reply()', src)
    # Localize the 3 paired final_response literals; their sibling "error"
    # literals (captured in \2) pass through unchanged.
    src = LITERAL_PAIR_RE.sub(r'"final_response": _gf_output_truncated_reply(),\2', src)
    applied_note = "applied + compiled OK (literal-form, 4 sites patched: 1 ternary + 3 paired)"

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
print(f"[patch_truncation_reply] {applied_note}")

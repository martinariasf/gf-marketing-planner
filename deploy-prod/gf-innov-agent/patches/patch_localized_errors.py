#!/usr/bin/env python3
# [GF-100] Localize the two Telegram-facing "non-LLM message" functions in
# gateway/run.py so a hit limit (rate limit, OpenRouter billing/quota, auth
# failure, or a run that produced no text) surfaces friendly ES/DE/EN copy
# instead of raw English filler / provider text — the gateway-side half of
# GF-100 (the dashboard/quota half already ships via
# deploy-staging/api/src/agentMessages.ts; this patch is the Telegram half).
#
# Anchor table (verified 2026-08-06 against hermes-agent:base,
# sha256:7912de37a2ad4bca0a10cec0d61060b4a3287ac010ffe1992004cad9c5dac538,
# extracted via `docker run --rm --entrypoint python3 hermes-agent:base -c
# "print(open('/opt/hermes/gateway/run.py').read())"`):
#
#   Function                          real line   notes
#   _gateway_provider_error_reply     149         4 buckets: auth (401/"provider
#                                                  authentication failed") ->
#                                                  policy ("blocked"/"violation"/
#                                                  moderation) -> rate-limit
#                                                  (429/"rate limit"/"quota"/
#                                                  "usage limit" -- this bucket
#                                                  currently also catches
#                                                  billing/quota text, which is
#                                                  the actual GF-100 bug: a
#                                                  daily-cap hit reads as a
#                                                  transient "wait a moment"
#                                                  instead of "come back
#                                                  tomorrow") -> generic
#                                                  provider-failed fallback.
#   _normalize_empty_agent_response   1302        failed/context-overflow branch,
#                                                  "request failed" branch,
#                                                  partial/"processing stopped"
#                                                  branch, no-text-generated
#                                                  catch-all. The truncation-
#                                                  specific text this function
#                                                  used to have to invent is
#                                                  now moot: patch_truncation_reply.py
#                                                  makes conversation_loop.py
#                                                  return a non-empty
#                                                  final_response for all 4
#                                                  truncation sites, so
#                                                  `if response: return response`
#                                                  (line ~1314) short-circuits
#                                                  before any of this runs.
#
# Mechanism: APPEND a marker-guarded block at the END of the file that
# rebinds the two module-level names to localized wrappers. Python resolves
# a module-global name at call time, not at def time, so an append-at-end
# rebind wins over the original definitions for every future call — no need
# to touch or pattern-match the original function bodies (which is exactly
# the kind of fragile edit patch_api_server.py's docstring warns against).
import sys, py_compile

p = "/opt/hermes/gateway/run.py"
src = open(p, encoding="utf-8").read()

MARKER = "# [GF-100 patch] localized gateway error replies (appended, rebinds globals)"
if MARKER in src:
    print("[patch_localized_errors] already applied — skipping")
    py_compile.compile(p, doraise=True)
    print("[patch_localized_errors] applied + compiled OK (idempotent no-op)")
    sys.exit(0)

for anchor in ("def _gateway_provider_error_reply(", "def _normalize_empty_agent_response("):
    if anchor not in src:
        print(
            f"[patch_localized_errors] ERROR: anchor {anchor!r} not found; "
            "gateway/run.py changed upstream — refusing to patch",
            file=sys.stderr,
        )
        sys.exit(1)

# Built as a plain (non-raw) Python string constant HERE, in this script's own
# top-level source — i.e. exactly one layer of string literal, so `\s`/`\b`
# mean what they look like. It is then embedded into APPEND_BLOCK below via
# repr(), which round-trips it into valid Python/regex source no matter how
# many backslashes it takes to represent — no hand-doubled escapes to get
# wrong. (An earlier draft hand-escaped this same pattern inside the
# APPEND_BLOCK triple-quoted string itself; verified correct by exec'ing it,
# but repr() removes the whole class of "count the backslashes" risk instead
# of relying on that verification staying true forever.)
#
# [GF-100 Layer-5 round-2] Every alternative below is now \b-bounded on
# whichever side it lacked one — the original had only `\bquota\b` and
# `\b402\b` bounded, and re.search happily matches an unbounded alternative
# as a substring of an unrelated, longer word. Audited each alternative
# against a plausible unrelated string (see review2-gf-100.md finding 1 and
# test_patch_localized_errors.py's near-miss cases for the full table):
#   key\s+limit          -> "monkey limit" / "turkey limit" both contain the
#                            substring "key limit" with no leading boundary.
#                            Fixed: \bkey\s+limit\b
#   daily\s+limit         -> no plausible English word ends in "...daily", so
#                            this one wasn't actually reachable, but bounded
#                            anyway for consistency: \bdaily\s+limit\b
#   insufficient\s+credit -> reviewer's claimed repro ("insufficient
#                            credentials") does NOT actually match — "credit"
#                            is not a substring of "credentials" (they diverge
#                            at the 5th character: cred-I-t vs cred-E-ntials).
#                            Verified with re.search; see report. The general
#                            class of bug is still real though: a bare
#                            unbounded "credit" would swallow "accreditation"-
#                            style words if "insufficient" ever prefixed one,
#                            and a *trailing* \b was needed to stop it bleeding
#                            into an unrelated longer word. A naive `\b` after
#                            "credit" would break the intentional "insufficient
#                            credits" (plural) match (\b doesn't fire between
#                            two \w chars), so the fix is an explicit optional
#                            plural instead: \binsufficient\s+credits?\b
#   insufficient_quota     -> no leading \b; matches inside
#                            "insufficient_quotation" (unrelated string, e.g. a
#                            log line about quoting marks). Fixed with a
#                            trailing \b too (underscore is a \w char, so \b
#                            works correctly on both sides here, unlike the
#                            plural case above): \binsufficient_quota\b
#   insufficient\s+balance -> analogous to "credit": "insufficient balancer
#                            readings" would match "insufficient balance" as a
#                            substring with no trailing boundary. Same fix
#                            shape as credit(s): \binsufficient\s+balances?\b
#   payment\s+required     -> no leading \b; matches inside "overpayment
#                            required notice" (an unrelated string — e.g. an
#                            invoice-system message, not a provider quota
#                            error). Fixed: \bpayment\s+required\b
#   \bquota\b              -> already correctly bounded both sides. No change.
#   \b402\b                -> already correctly bounded both sides. No change.
#   billing                -> no boundary at all; matches inside "overbilling"
#                            (arguably still on-topic) but also inside a
#                            company/product name like "Billington" (a false
#                            positive with no billing relationship at all).
#                            Fixed: \bbilling\b
#
# [GF-100 Layer-5 round-3] Two-way diff against the dashboard's QUOTA_PATTERNS
# (deploy-staging/api/src/agentMessages.ts) turned up a real divergence
# (review3-gf-100.md finding 1) plus a real word-boundary gap (review3-gf-100.md
# question). Full reconciliation table — every alternative on either side,
# checked against the other:
#
#   Alternative                              | TS (agentMessages.ts) | Python (this file, before round 3)
#   \b402\b                                  | yes                   | yes
#   \bpayment\s+required\b                   | yes                   | yes
#   \binsufficient\s+credits?\b              | yes                   | yes
#   \binsufficient_quota\b                   | yes                   | yes
#   \binsufficient\s+balances?\b             | yes                   | yes
#   \bdaily\s+limit\b                        | yes                   | yes
#   \bexceeded\s+your\s+current\s+quota\b    | yes                   | MISSING -> added below
#   \bcredits?\s+have\s+been\s+exhausted\b   | yes                   | MISSING -> added below
#   \bbilling\b                              | yes                   | yes
#   \bquota\b                                | yes                   | yes
#   \bkey\s+limit\b                          | yes                   | yes
#   \bquota_exceeded\b (underscore/code form) | MISSING -> added below | MISSING -> added below
#
# "exceeded your current quota" and "credits have been exhausted" are real
# OpenAI/OpenRouter-flavoured phrases the dashboard side already listed but
# this file never picked up — that is finding 1: a provider error containing
# either phrase classified as quota_exhausted on the dashboard but fell
# through to provider_failed on Telegram. Added here so both paths agree.
#
# `quota_exceeded` (underscore form): `\bquota\b` does NOT match inside
# "quota_exceeded" because `\b` never fires between two \w characters (`a`
# and `_` are both \w) — same mechanism as the `insufficient_quota` fix
# above, just never applied to the "exceeded" spelling. This is not
# theoretical: verified 2026-08-07 via read-only SSH against
# hermes-agent:base —
#   - /opt/hermes/agent/auxiliary_client.py:2261's `_is_payment_error` keyword
#     list includes the literal substring "quota_exceeded" (alongside
#     "quota exceeded") specifically to catch Vertex AI/Bedrock daily-quota
#     error text, proving the underscore form is a real provider string, not
#     a hypothetical.
#   - /opt/hermes/agent/error_classifier.py's `_classify_by_error_code`
#     matches structured error-code fields via exact-string set membership
#     (`code_lower in {"insufficient_quota", ...}`), not regex, so it was
#     never exposed to this \b gap in the first place — but it confirms
#     underscore-separated codes ("insufficient_quota", "billing_not_active",
#     "payment_required") are the normal shape for this provider family.
#   - No occurrence of "quota_exhausted" (our own MessageKey name) was found
#     anywhere in /opt/hermes — it is not a real provider string, so no
#     pattern was added for it; adding one would be speculative, not
#     evidence-based.
#   Fixed with an explicit alternative: \bquota_exceeded\b (both boundaries
#   land on non-\w chars — start/end of string, whitespace, or punctuation —
#   so this is exact with no near-miss risk).
_GF_QUOTA_ERROR_PATTERN = (
    r"(\bkey\s+limit\b|\bdaily\s+limit\b|\binsufficient\s+credits?\b|"
    r"\binsufficient_quota\b|\binsufficient\s+balances?\b|"
    r"\bpayment\s+required\b|\bexceeded\s+your\s+current\s+quota\b|"
    r"\bcredits?\s+have\s+been\s+exhausted\b|\bquota_exceeded\b|"
    r"\bquota\b|\b402\b|\bbilling\b)"
)

APPEND_BLOCK = '''

''' + MARKER + '''
#
# Rebinds _gateway_provider_error_reply and _normalize_empty_agent_response
# (defined above in this same module) to localized versions. Both wrappers
# fall back to the original English-producing logic on any unexpected shape,
# so a bug here degrades to the pre-GF-100 behaviour rather than crashing the
# gateway.
import logging as _logging
from agent._gf_messages import render as _gf_render, resolve_gf_lang as _gf_resolve_lang

_gf_original_gateway_provider_error_reply = _gateway_provider_error_reply
_gf_original_normalize_empty_agent_response = _normalize_empty_agent_response

_GF_QUOTA_ERROR_RE = re.compile(
''' + repr(_GF_QUOTA_ERROR_PATTERN) + ''',
    re.IGNORECASE,
)


def _gateway_provider_error_reply(text: str) -> str:  # noqa: F811 (deliberate rebind)
    """Localized replacement for the original _gateway_provider_error_reply.

    Checked in this order: quota/billing (GF-100 — must win over the generic
    rate-limit bucket below, which also matches "quota"/"usage limit" text
    and would otherwise tell a billing-capped user to "wait a moment" instead
    of "come back tomorrow") -> auth -> policy -> rate-limit -> generic.
    """
    try:
        lang = _gf_resolve_lang()
        if _GF_QUOTA_ERROR_RE.search(text or ""):
            return _gf_render("quota_exhausted", lang)
        if _GATEWAY_AUTH_ERROR_RE.search(text or ""):
            return _gf_render("auth_failed", lang)
        if _GATEWAY_PROVIDER_POLICY_RE.search(text or ""):
            return _gf_render("policy_rejected", lang)
        if _GATEWAY_RATE_LIMIT_RE.search(text or ""):
            return _gf_render("rate_limited", lang)
        return _gf_render("provider_failed", lang)
    except Exception:
        return _gf_original_gateway_provider_error_reply(text)


def _normalize_empty_agent_response(agent_result: dict, response: str, *, history_len: int = 0) -> str:  # noqa: F811
    """Localized replacement for the original _normalize_empty_agent_response.

    Mirrors the original branch structure exactly (see anchor table above);
    only the human-authored copy is localized. Unlike the original, raw
    error/diagnostic text (error_detail, err) is NOT appended to the
    user-facing string anymore — a provider error body, stack trace, or API
    key prefix could be sitting in there, and that would leak straight to
    Telegram/TUI (GF-100 acceptance criterion 3). It is still logged
    server-side so the debugging signal isn't lost, just not shipped to the
    user.
    """
    if response:
        return response

    _gf_logger = _logging.getLogger("gf100.localized_errors")

    try:
        lang = _gf_resolve_lang()

        if agent_result.get("failed"):
            error_detail = agent_result.get("error", "unknown error")
            error_str = str(error_detail).lower()
            is_context_failure = any(
                p in error_str
                for p in ("context", "token", "too large", "too long", "exceed", "payload")
            ) or ("400" in error_str and history_len > 50)
            if is_context_failure:
                return _gf_render("context_too_large", lang)
            _gf_logger.warning("GF-100 request_failed detail (not shown to user): %s", str(error_detail)[:300])
            return (
                f"{_gf_render('request_failed_prefix', lang)}\\n"
                f"{_gf_render('request_failed_suffix', lang)}"
            )

        api_calls = int(agent_result.get("api_calls", 0) or 0)
        if api_calls > 0 and not agent_result.get("interrupted"):
            if agent_result.get("partial"):
                err = agent_result.get("error", "processing incomplete")
                _gf_logger.warning("GF-100 processing_stopped detail (not shown to user): %s", str(err)[:200])
                return f"⚠️ {_gf_render('processing_stopped_prefix', lang)}. {_gf_render('processing_stopped_suffix', lang)}"
            return _gf_render("no_response_generated", lang)

        return response
    except Exception:
        return _gf_original_normalize_empty_agent_response(agent_result, response, history_len=history_len)
'''

src = src + APPEND_BLOCK

open(p, "w", encoding="utf-8").write(src)
py_compile.compile(p, doraise=True)
print("[patch_localized_errors] applied + compiled OK")

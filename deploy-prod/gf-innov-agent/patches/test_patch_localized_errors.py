"""Unit test for patch_localized_errors.py's APPEND_BLOCK — GF-100.

py_compile only proves the appended code is syntactically valid Python; it
does NOT prove the regex classification is correct (that was exactly the bug
in the Layer-5 review: `_GF_QUOTA_ERROR_RE` compiled fine but a hand-escaped
`\b` inside a non-raw triple-quoted string silently became a backspace
character, so "insufficient quota for today" fell through to the rate-limit
bucket instead of the quota bucket).

This test extracts the real APPEND_BLOCK the patch script would write, execs
it against a fake gateway/run.py namespace (stubbing the pieces
_gateway_provider_error_reply depends on: the other three classifier regexes
and the agent._gf_messages module), and asserts representative error strings
land in the correct bucket.

Run standalone:  python test_patch_localized_errors.py   (exit 0 = all passed)
"""
from __future__ import annotations

import re
import sys
import types

_HERE_PATCH = "patch_localized_errors.py"
import os

_PATCH_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), _HERE_PATCH)


def _load_append_block() -> str:
    """Re-derive APPEND_BLOCK exactly as patch_localized_errors.py builds it,
    without running the file-mutation part (no /opt/hermes on this machine)."""
    src = open(_PATCH_PATH, encoding="utf-8").read()
    start = src.index("_GF_QUOTA_ERROR_PATTERN = (")
    end = src.index("\nsrc = src + APPEND_BLOCK")
    stmt = src[start:end]
    ns = {"MARKER": "# [GF-100 patch] test marker"}
    exec(stmt, ns)  # noqa: S102 — trusted local file, test-only
    return ns["APPEND_BLOCK"]


def _build_fake_run_module():
    """Fake gateway/run.py namespace with the 3 pre-existing classifier
    regexes and the two original functions this patch rebinds."""
    ns = {
        "re": re,
        "_gateway_provider_error_reply": lambda text: f"ORIGINAL:{text}",
        "_normalize_empty_agent_response": lambda *a, **k: "ORIGINAL_EMPTY",
        # Deliberately non-overlapping with the quota strings under test.
        "_GATEWAY_AUTH_ERROR_RE": re.compile(r"401|provider authentication failed", re.I),
        "_GATEWAY_PROVIDER_POLICY_RE": re.compile(r"blocked|violation|moderation", re.I),
        "_GATEWAY_RATE_LIMIT_RE": re.compile(r"429|rate limit|quota|usage limit", re.I),
    }
    return ns


def _install_fake_gf_messages():
    """Install fake `agent` / `agent._gf_messages` modules and return the prior
    sys.modules entries (or _SENTINEL if absent) so the caller can restore
    them — this test must not leak fake modules into sys.modules for any
    other in-process test that later imports the real `agent` package
    (finding 3, round-2 review)."""
    prior = {
        "agent": sys.modules.get("agent", _SENTINEL),
        "agent._gf_messages": sys.modules.get("agent._gf_messages", _SENTINEL),
    }
    agent_pkg = types.ModuleType("agent")
    gf_messages = types.ModuleType("agent._gf_messages")
    gf_messages.render = lambda key, lang: f"[{key}]"
    gf_messages.resolve_gf_lang = lambda: "en"
    sys.modules["agent"] = agent_pkg
    sys.modules["agent._gf_messages"] = gf_messages
    return prior


_SENTINEL = object()


def _restore_sys_modules(prior: dict) -> None:
    for name, value in prior.items():
        if value is _SENTINEL:
            sys.modules.pop(name, None)
        else:
            sys.modules[name] = value


def main() -> int:
    prior_modules = _install_fake_gf_messages()
    try:
        return _run_cases()
    finally:
        _restore_sys_modules(prior_modules)


def _run_cases() -> int:
    block = _load_append_block()
    ns = _build_fake_run_module()
    exec(block, ns)  # noqa: S102 — trusted local file, test-only

    reply = ns["_gateway_provider_error_reply"]
    normalize = ns["_normalize_empty_agent_response"]

    cases = [
        ("insufficient quota for today", "quota_exhausted"),
        ("403 Key limit exceeded", "quota_exhausted"),
        ("daily limit exceeded", "quota_exhausted"),
        ("Payment required (402)", "quota_exhausted"),
        ("insufficient credits remaining", "quota_exhausted"),
        ("insufficient credit", "quota_exhausted"),
        ("insufficient balance transfer failed", "quota_exhausted"),
        ("insufficient_quota", "quota_exhausted"),
        ("billing address invalid — please update your plan", "quota_exhausted"),
        # [GF-100 Layer-5 round-3] finding 1: these two alternatives existed
        # on the dashboard side (agentMessages.ts QUOTA_PATTERNS) but were
        # missing here, so the same provider string classified differently
        # on Telegram vs. the dashboard. Added to _GF_QUOTA_ERROR_PATTERN.
        ("You exceeded your current quota, please check your plan", "quota_exhausted"),
        ("Your credits have been exhausted for today", "quota_exhausted"),
        # [GF-100 Layer-5 round-3] question: underscore/code form of "quota
        # exceeded". `\bquota\b` alone does not match this (no \b between `a`
        # and `_`) — confirmed real via SSH: auxiliary_client.py's
        # _is_payment_error keyword list includes the literal substring
        # "quota_exceeded" to catch Vertex AI/Bedrock daily-quota text.
        ("quota_exceeded", "quota_exhausted"),
        ("Error: quota_exceeded — daily cap reached", "quota_exhausted"),
        ("429 rate limit exceeded, please slow down", "rate_limited"),
        ("some generic failure with no known keyword", "provider_failed"),
        ("401 provider authentication failed", "auth_failed"),
        ("request blocked due to policy violation", "policy_rejected"),
        # --- near-miss cases per alternative audited in patch_localized_errors.py:
        # each of these contains an unrelated word that merely *contains* one
        # of the quota alternatives as a substring, and must NOT classify as
        # quota_exhausted.
        ("insufficient credentials for authentication", "provider_failed"),
        ("monkey limit reached on the zoo API", "provider_failed"),
        ("turkey limit exceeded for this recipe endpoint", "provider_failed"),
        # DELIBERATE, DOCUMENTED DIVERGENCE (review2 + review3 finding 2,
        # accepted by Martin — do NOT "fix" by touching _GATEWAY_RATE_LIMIT_RE
        # or by editing gateway/run.py): these two land in rate_limited, not
        # provider_failed. The fake _GATEWAY_RATE_LIMIT_RE here mirrors the
        # REAL upstream regex in gateway/run.py, which matches a bare
        # unbounded "quota" too (see the anchor table at the top of
        # patch_localized_errors.py: "this bucket currently also catches
        # billing/quota text"). That upstream regex is pre-existing,
        # out-of-scope for GF-100, and this patch's whole mechanism
        # (append-and-rebind, see the file header) is designed to avoid
        # touching original gateway/run.py code — including this regex. So
        # the dashboard (agentMessages.ts) classifies these same near-miss
        # strings as run_failed while Telegram classifies them as
        # rate_limited: a real, known, permanently-accepted divergence for
        # inputs that are not real provider errors (nobody's provider
        # actually returns "insufficient_quotation marks used"). Asserting
        # the actual (rate_limited) outcome here rather than the ideal one,
        # so this test doesn't silently start asserting something untrue
        # about the fake harness.
        ("insufficient_quotation marks used in the request body", "rate_limited"),
        ("insufficient balancer readings off nominal", "provider_failed"),
        ("overpayment required notice from the invoicing system", "provider_failed"),
        ("quotation needed before we can proceed", "rate_limited"),
        ("overbilling dispute raised by customer", "provider_failed"),
        ("Billington Corp returned an unexpected error", "provider_failed"),
    ]

    failures = []
    for text, expected_key in cases:
        got = reply(text)
        expected = f"[{expected_key}]"
        status = "OK" if got == expected else "FAIL"
        print(f"[{status}] {text!r} -> {got!r} (expected {expected!r})")
        if got != expected:
            failures.append((text, expected, got))

    # Sanity: the regex itself must not have degenerated into matching
    # nothing (e.g. via a silently-corrupted \b -> backspace, which would
    # make "quota" fail to match as a whole word inside a longer string and
    # fall through to provider_failed instead of quota_exhausted).
    quota_re = ns["_GF_QUOTA_ERROR_RE"]
    assert quota_re.search("insufficient quota for today"), (
        "_GF_QUOTA_ERROR_RE failed to match a real quota-exhaustion string — "
        "regex likely corrupted (check for a mis-escaped \\b/\\s in the source)"
    )

    # _normalize_empty_agent_response: user-facing text must never contain
    # the raw error detail (finding 3 — leak check).
    secret = "sk-live-SUPER_SECRET_KEY_PREFIX_do_not_leak"
    out = normalize({"failed": True, "error": secret}, "", history_len=0)
    if secret in out:
        failures.append(("leak-check", "no secret in output", out))
        print(f"[FAIL] leak-check: raw error detail leaked into user-facing text: {out!r}")
    else:
        print(f"[OK] leak-check: raw error detail not present in user-facing text: {out!r}")

    if failures:
        print(f"\n{len(failures)} FAILURE(S)")
        return 1
    print(f"\nAll {len(cases)} classification cases + leak-check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

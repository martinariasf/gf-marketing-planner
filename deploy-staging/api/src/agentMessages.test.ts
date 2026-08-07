import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classify,
  message,
  friendlyError,
  normalizeLang,
  SUPPORTED_LANGS,
  type MessageKey,
} from './agentMessages.js'

// --- classify: real provider/Hermes error strings bucket correctly ----------
test('classify: OpenRouter daily-limit / billing → quota_exhausted', () => {
  for (const raw of [
    'Hermes /v1/runs 402: {"error":"daily limit exceeded"}',
    'Provider returned insufficient credits',
    'insufficient_quota',
    'You exceeded your current quota, please check your plan',
    'Your credits have been exhausted',
    'Payment Required',
    // bare "quota" is a daily-limit signal per the contract, not a transient
    // throttle — must not degrade to rate_limited "try again shortly".
    'quota exceeded',
    'You have reached your quota',
  ]) {
    assert.equal(classify(raw), 'quota_exhausted', raw)
  }
})

// [GF-100 Layer-5 round-3] question: `\bquota\b` alone does not match the
// underscore/code form "quota_exceeded" (\b never fires between two \w
// chars, and `_` is \w). Confirmed real via read-only SSH against
// hermes-agent:base: /opt/hermes/agent/auxiliary_client.py's
// `_is_payment_error` keyword list includes the literal substring
// "quota_exceeded" (next to "quota exceeded") specifically to catch Vertex
// AI/Bedrock daily-quota error text — not a hypothetical. Mirrors the
// equivalent fix in patch_localized_errors.py's _GF_QUOTA_ERROR_PATTERN.
test('classify: underscore/code form "quota_exceeded" → quota_exhausted (GF-100 round 3)', () => {
  assert.equal(classify('quota_exceeded'), 'quota_exhausted')
  assert.equal(classify('Error: quota_exceeded — daily cap reached'), 'quota_exhausted')
})

test('classify: OpenRouter 403 "Key limit exceeded" → quota_exhausted (GF-100)', () => {
  assert.equal(classify('403 Key limit exceeded'), 'quota_exhausted')
  assert.equal(classify('OpenRouter error: Key limit exceeded for this key'), 'quota_exhausted')
  assert.equal(classify('402: daily limit exceeded'), 'quota_exhausted')
})

test('classify: a bare 403 with no billing marker does not leak into quota_exhausted', () => {
  // Regression guard: '403' alone must not be a quota pattern — it would
  // swallow unrelated auth failures (e.g. "403 Forbidden: invalid token").
  assert.equal(classify('403 Forbidden: invalid token'), 'run_failed')
})

// [GF-100 Layer-5 round-2] QUOTA_PATTERNS moved from unbounded `.includes()`
// substrings to \b-bounded regexes. Each near-miss below contains one of the
// quota alternatives as a mere substring of an unrelated word and must NOT
// classify as quota_exhausted — mirrors the near-miss table audited in
// deploy-prod/gf-innov-agent/patches/patch_localized_errors.py /
// test_patch_localized_errors.py so both classifiers agree on the same
// inputs (acceptance criterion 4).
test('classify: near-miss strings that merely contain a quota substring do not classify as quota_exhausted', () => {
  const nearMisses = [
    'insufficient credentials for authentication', // "credit" is not actually a substring of "credentials" — kept as a documented non-repro case
    'monkey limit reached on the zoo API', // contains "key limit"
    'turkey limit exceeded for this recipe endpoint', // contains "key limit"
    'overpayment required notice from the invoicing system', // contains "payment required"
    'Billington Corp returned an unexpected error', // contains "billing"
    'overbilling dispute raised by customer', // contains "billing"
  ]
  for (const raw of nearMisses) {
    assert.notEqual(classify(raw), 'quota_exhausted', raw)
  }
})

test('classify: "quotation" strings (contain "quota" as a substring) do not classify as quota_exhausted', () => {
  // These two contain "quota" as a substring of "quotation" but no other
  // quota or rate-limit marker, so with the \b-bounded QUOTA_PATTERNS they
  // correctly fall through to the safe default (run_failed) instead of
  // quota_exhausted. NB: the Python-side test for the equivalent Telegram
  // classifier asserts 'rate_limited' for the same near-miss strings,
  // because gateway/run.py's pre-existing (out-of-scope) rate-limit regex
  // also matches a bare "quota" — a divergence documented there, not fixed
  // here since it lives in an upstream regex this task doesn't touch.
  assert.equal(classify('insufficient_quotation marks used in the request body'), 'run_failed')
  assert.equal(classify('quotation needed before we can proceed'), 'run_failed')
})

test('classify: throttles → rate_limited', () => {
  for (const raw of ['429 Too Many Requests', 'rate limit reached', 'RESOURCE_EXHAUSTED', 'request was throttled']) {
    assert.equal(classify(raw), 'rate_limited', raw)
  }
})

test('classify: quota before rate-limit (a 402 mentioning rate stays billing)', () => {
  assert.equal(classify('402 daily limit — rate limit hit'), 'quota_exhausted')
})

test('classify: unknown / empty → run_failed (safe default)', () => {
  assert.equal(classify('some unexpected boom'), 'run_failed')
  assert.equal(classify(''), 'run_failed')
  assert.equal(classify(null), 'run_failed')
  assert.equal(classify(undefined), 'run_failed')
})

// --- message: every key has all three languages, non-empty -------------------
test('message: every key resolves a non-empty string in every language', () => {
  const keys: MessageKey[] = [
    'quota_exhausted',
    'rate_limited',
    'timed_out',
    'run_failed',
    'no_final_text',
    'completed_with_writes',
    'stream_ended',
    'output_truncated',
  ]
  for (const key of keys) {
    for (const lang of SUPPORTED_LANGS) {
      const out = message(key, lang)
      assert.equal(typeof out, 'string')
      assert.ok(out.length > 0, `${key}/${lang} empty`)
    }
  }
})

test('message: languages actually differ (not accidentally all English)', () => {
  const es = message('quota_exhausted', 'es')
  const de = message('quota_exhausted', 'de')
  const en = message('quota_exhausted', 'en')
  assert.notEqual(es, en)
  assert.notEqual(de, en)
  assert.match(es, /créditos/i)
  assert.match(de, /Guthaben/i)
})

test('message: copy carries no technical jargon (GF-39 spirit)', () => {
  const banned = /traceback|stack|http|curl|tool|iteration|verifier|402|429|null|undefined|exception/i
  const keys: MessageKey[] = ['quota_exhausted', 'rate_limited', 'timed_out', 'run_failed', 'no_final_text', 'completed_with_writes', 'stream_ended', 'output_truncated']
  for (const key of keys) {
    for (const lang of SUPPORTED_LANGS) {
      assert.doesNotMatch(message(key, lang), banned, `${key}/${lang} leaks jargon`)
    }
  }
})

// --- normalizeLang -----------------------------------------------------------
test('normalizeLang: maps codes/aliases, defaults to en', () => {
  assert.equal(normalizeLang('es'), 'es')
  assert.equal(normalizeLang('ES'), 'es')
  assert.equal(normalizeLang('es-AR'), 'es')
  assert.equal(normalizeLang('spanish'), 'es')
  assert.equal(normalizeLang('de-DE'), 'de')
  assert.equal(normalizeLang('german'), 'de')
  assert.equal(normalizeLang('fr'), 'en')
  assert.equal(normalizeLang(''), 'en')
  assert.equal(normalizeLang(null), 'en')
})

// --- friendlyError: end-to-end ----------------------------------------------
test('friendlyError: raw 402 → Spanish quota copy', () => {
  const out = friendlyError('Hermes /v1/runs 402: daily limit exceeded', 'es')
  assert.equal(out, message('quota_exhausted', 'es'))
})

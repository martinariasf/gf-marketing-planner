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
  const keys: MessageKey[] = ['quota_exhausted', 'rate_limited', 'timed_out', 'run_failed', 'no_final_text', 'completed_with_writes', 'stream_ended']
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

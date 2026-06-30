import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fallbackFor } from './agentJobs.js'
import { message, friendlyError } from './agentMessages.js'

// fallbackFor maps a settled job (status + whether the agent wrote to the
// dashboard + the raw error) onto friendly, localized assistant copy. The model
// never produced this text, so the localization must happen here.

test('fallbackFor: completed with platform writes → completed_with_writes (localized)', () => {
  assert.equal(fallbackFor('completed', true, undefined, 'es'), message('completed_with_writes', 'es'))
  assert.equal(fallbackFor('recovered', true, undefined, 'de'), message('completed_with_writes', 'de'))
})

test('fallbackFor: completed with no writes → no_final_text (localized)', () => {
  assert.equal(fallbackFor('completed', false, undefined, 'es'), message('no_final_text', 'es'))
  assert.equal(fallbackFor('recovered', false, undefined, 'en'), message('no_final_text', 'en'))
})

test('fallbackFor: timed_out → timed_out copy', () => {
  assert.equal(fallbackFor('timed_out', false, undefined, 'es'), message('timed_out', 'es'))
})

test('fallbackFor: failed with a quota detail → Spanish quota message', () => {
  const out = fallbackFor('failed', false, 'Hermes /v1/runs 402: daily limit exceeded', 'es')
  assert.equal(out, message('quota_exhausted', 'es'))
})

test('fallbackFor: failed with an opaque detail → generic run_failed copy', () => {
  const out = fallbackFor('failed', false, 'Hermes stream ended without a completed run.', 'es')
  assert.equal(out, friendlyError('Hermes stream ended without a completed run.', 'es'))
  assert.equal(out, message('run_failed', 'es'))
})

test('fallbackFor: never leaks the raw English detail to the user', () => {
  const raw = 'TypeError: cannot read properties of undefined (reading "foo")'
  const out = fallbackFor('failed', false, raw, 'es')
  assert.doesNotMatch(out, /TypeError|undefined|properties/)
})

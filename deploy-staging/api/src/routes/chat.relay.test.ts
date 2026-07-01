import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Wiring / regression guard for TASK-004. The SSE relay can't be unit-invoked
// without a live Hermes + PocketBase, so instead of asserting runtime behavior
// we assert — at the source level — that every NON-LLM terminal branch routes
// through the localized catalog and that the raw-English regressions stay gone.
// If someone reintroduces `String(ev.error)` or a hardcoded English fallback,
// this test fails even though the catalog's own unit tests still pass.

const src = readFileSync(fileURLToPath(new URL('./chat.ts', import.meta.url)), 'utf8')

test('chat relay imports the localized catalog helpers', () => {
  assert.match(src, /from '\.\.\/agentMessages\.js'/)
  assert.match(src, /friendlyError/)
  assert.match(src, /resolveClientLang/)
})

test('chat relay no longer emits raw provider error text', () => {
  // The exact regression the reviewer flagged: run.failed used to surface
  // String(ev.error) verbatim (raw English) to the user.
  assert.doesNotMatch(src, /String\(ev\.error/)
  // And the old hardcoded English fallbacks must be gone.
  assert.doesNotMatch(src, /did not send a final text reply/i)
  assert.doesNotMatch(src, /event stream ended before a final reply/i)
})

test('chat relay localizes each terminal branch via the catalog', () => {
  // run.failed → classify+message via friendlyError(rawError, lang)
  assert.match(src, /friendlyError\(raw, lang\)/)
  // run.cancelled → run_failed copy
  assert.match(src, /localized\('run_failed', lang\)/)
  // no-final-text after run.completed → completed_with_writes
  assert.match(src, /localized\('completed_with_writes', lang\)/)
  // stream-ended recovery → stream_ended
  assert.match(src, /localized\('stream_ended', lang\)/)
  // hard-timeout abort → timed_out
  assert.match(src, /localized\('timed_out', lang\)/)
})

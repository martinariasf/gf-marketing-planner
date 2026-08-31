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

// GF-100: the generic completed_with_writes/no_final_text fallback copy must
// never overwrite a non-empty agent reply. chat.ts guards this by only
// substituting the catalog copy when the trimmed output is empty; agentJobs.ts
// (finalizeAgentJob) applies the same guard via `args.output?.trim() || fallbackFor(...)`.
// This is a source-level regression guard, not a runtime one — see the file
// header for why this route can't be unit-invoked directly.
test('chat relay only substitutes fallback copy when the agent output is empty', () => {
  assert.match(src, /if \(!assistantFinalText\.trim\(\)[\s\S]{0,40}\)\s*\{\s*\n\s*assistantFinalText = localized\('completed_with_writes', lang\)/)
})

// GF-122: without an explicit `session_id`, Hermes' /v1/runs falls back to
// `session_id = run_id` — a fresh UUID every turn (confirmed by reading
// gateway/platforms/api_server.py's _handle_runs on the box). That breaks
// agent/conversation_loop.py's system-prompt persistence
// (_restore_or_build_system_prompt looks up `agent._session_db.get_session
// (agent.session_id)`, which is never populated for a session_id nobody has
// ever sent before), forcing a from-scratch rebuild — and a lost prefix
// cache — on every non-first turn of every dashboard conversation. Confirmed
// on prod: `docker logs viktor-black-venture-farm` showed "Stored system
// prompt for session run_* is null; rebuilding from scratch this turn" once
// per dashboard turn on 2026-08-26, each with a distinct run_* id, exactly
// matching a fresh session_id every time. The fix threads a stable,
// thread-scoped session_id through so the gateway can find its own cached
// system prompt across turns — the same continuity Telegram already gets
// from its own stable per-chat session_id.
test('chat relay sends a stable, thread-scoped session_id to Hermes /v1/runs', () => {
  // The SAME identifier used for X-Hermes-Session-Key (long-term memory
  // scope) is reused as session_id (short-term transcript/system-prompt
  // scope) — a single source of truth, not two independently-derived values
  // that could drift apart.
  assert.match(src, /const hermesSessionId = `mp-\$\{slug\}-\$\{thread\}`/)
  assert.match(src, /'X-Hermes-Session-Key':\s*hermesSessionId/)
  assert.match(src, /session_id:\s*hermesSessionId/)
})

// GF-122: Hermes' own conversation_loop.py persists the literal string
// "(empty)" as `final_response` when the model exhausts empty-response
// retries and fallback with no visible content (the
// `_empty_terminal_sentinel` block) — a real moonshotai/kimi-k3 flake,
// reproduced on prod in the BVF dashboard thread dash-black-venture-farm at
// 2026-08-26T16:03:09Z. Treated as ordinary text, that non-blank sentinel
// bypassed BOTH this route's own empty-output fallback AND
// finalizeAgentJob's `output?.trim() || fallbackFor(...)` guard, so the
// client saw a chat bubble containing the literal word "(empty)".
test('chat relay normalizes the Hermes "(empty)" sentinel to a blank reply', () => {
  assert.match(src, /rawOutput\.trim\(\) === '\(empty\)' \? '' : rawOutput/)
})

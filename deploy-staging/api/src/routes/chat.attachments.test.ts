import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkAttachmentTenant, chatAttachmentAgentUrl } from './chat.js'

// GF-68 cross-tenant guard: a chat_attachments record referenced by id in a
// chat POST body must belong to the SAME client slug as the route being
// called, or the request must be rejected. This exercises the real,
// exported `checkAttachmentTenant()` used by the route handler — not a
// source-text regex — so it fails if the guard logic itself regresses, even
// if the 403 status or the field name it checks moves around.
test('cross-tenant guard: an attachment belonging to client A is rejected on client B\'s route', () => {
  const attachmentFromClientA = { id: 'att_123', slug: 'client-a' }
  const result = checkAttachmentTenant(attachmentFromClientA, 'client-b')
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.status, 403)
    assert.match(result.detail, /att_123/)
    assert.match(result.detail, /client-b/)
  }
})

test('cross-tenant guard: an attachment belonging to the same client as the route is accepted', () => {
  const attachmentFromClientA = { id: 'att_123', slug: 'client-a' }
  const result = checkAttachmentTenant(attachmentFromClientA, 'client-a')
  assert.deepEqual(result, { ok: true })
})

// GF-68 review fix: the agent-facing attachment URL must contain exactly one
// "/api/v1/" segment. Doubling it (env.publicApiBase already ending in
// "/api/v1" + chatAttachmentUrl() also starting with "/api/v1/...") produces
// a path that matches no route and that the agent's own `_internal_api_url()`
// rewrite (which splits on the first literal "/api/v1/") also mis-resolves.
// This asserts the actual generated URL, not the source text of chat.ts.
test('chatAttachmentAgentUrl produces exactly one "/api/v1/" segment', () => {
  const url = chatAttachmentAgentUrl('acme', 'att_abc')
  const occurrences = url.split('/api/v1/').length - 1
  assert.equal(occurrences, 1, `expected exactly one "/api/v1/" in ${url}`)
  assert.match(url, /^https?:\/\//, 'must be an absolute URL for the agent container to fetch')
  assert.match(url, /\/api\/v1\/clients\/acme\/chat\/attachments\/att_abc\/file$/)
})

// Source-level guards for the remaining, still-worth-keeping invariants that
// don't yet have a cheap behavioural equivalent given this harness (no live
// Hermes/PocketBase in unit tests — see chat.relay.test.ts for the same
// constraint on the relay itself).
const src = readFileSync(fileURLToPath(new URL('./chat.ts', import.meta.url)), 'utf8')

test('chat relay caps attachments processed per turn', () => {
  assert.match(src, /MAX_CHAT_ATTACHMENTS/)
})

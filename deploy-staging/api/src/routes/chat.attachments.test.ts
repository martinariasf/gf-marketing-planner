import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Source-level guard for GF-68's cross-tenant check: a chat_attachments
// record referenced by id in a chat POST body must belong to the SAME
// client slug as the route being called, or the request must be rejected.
// Mirrors chat.relay.test.ts's readFileSync-based style — the relay can't be
// unit-invoked without a live Hermes + PocketBase.

const src = readFileSync(fileURLToPath(new URL('./chat.ts', import.meta.url)), 'utf8')

test('chat relay validates attachment.slug against the route slug', () => {
  assert.match(src, /rec\.slug !== slug/)
})

test('chat relay rejects mismatched-tenant attachments rather than dropping them', () => {
  assert.match(src, /status:\s*403/)
})

test('chat relay caps attachments processed per turn', () => {
  assert.match(src, /MAX_CHAT_ATTACHMENTS/)
})

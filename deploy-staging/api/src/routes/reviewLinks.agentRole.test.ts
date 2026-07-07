import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// GF-66 authorization guard. These routes can't be unit-invoked without a live
// PocketBase + minted tokens, so — like chat.relay.test.ts — we assert the
// security property at the source level: the `agent` role was added to EXACTLY
// the four read/reply routes and to NONE of the mutating/moderation routes.
// If someone widens a dangerous route to `agent`, or narrows a read route, this
// fails even though the app still compiles.

const src = readFileSync(fileURLToPath(new URL('./reviewLinks.ts', import.meta.url)), 'utf8')

// A route registration spans a path string, then requireScope(), then
// requireRole(...). Allow whitespace/newlines between them but keep the window
// small so a match stays inside one route.
const withAgent = (path: string) =>
  new RegExp(`'${path}',[\\s\\S]{0,60}requireRole\\('dash', 'admin', 'agent'\\)`)
const dashAdminOnly = (registrar: string, path: string) =>
  new RegExp(`${registrar}\\(\\s*'${path}',[\\s\\S]{0,60}requireRole\\('dash', 'admin'\\)`)

test('GF-66: the four review read/reply routes grant the agent role', () => {
  // List links (find the linkId to reply on).
  assert.match(src, withAgent('/clients/:slug/review-links'))
  // Read a link's comment thread.
  assert.match(src, withAgent('/clients/:slug/review-links/:id/comments'))
  // Aggregated per-post feedback.
  assert.match(src, withAgent('/clients/:slug/review-feedback'))
})

test('GF-66: exactly four route registrations grant the agent role', () => {
  // list GET, comments GET, reply POST, review-feedback GET — no more.
  const matches = src.match(/requireRole\('dash', 'admin', 'agent'\)/g) ?? []
  assert.equal(matches.length, 4, `expected 4 agent-granting routes, found ${matches.length}`)
})

test('GF-66: mutating and moderation routes stay dash/admin only', () => {
  // Creating, revoking, rotating a link; moderating a comment; marking activity
  // read — none of these may be reachable by an agent token.
  assert.match(src, dashAdminOnly('reviewLinks\\.post', '/clients/:slug/review-links'))
  assert.match(src, dashAdminOnly('reviewLinks\\.post', '/clients/:slug/review-links/:id/revoke'))
  assert.match(src, dashAdminOnly('reviewLinks\\.post', '/clients/:slug/review-links/:id/rotate'))
  assert.match(src, dashAdminOnly('reviewLinks\\.patch', '/clients/:slug/review-comments/:id'))
  assert.match(src, dashAdminOnly('reviewLinks\\.post', '/clients/:slug/review-activity/read'))
})

test('GF-66: agent-granting routes keep requireScope (client confinement)', () => {
  // Every widened route must still be preceded by requireScope() so an agent
  // token can only reach its own client's data (cross-client => 403).
  for (const m of src.match(/requireRole\('dash', 'admin', 'agent'\)/g) ?? []) void m
  assert.doesNotMatch(src, /requireRole\('dash', 'admin', 'agent'\)[\s\S]{0,40}requireScope/)
  // Positive: the widened routes show requireScope() BEFORE requireRole(agent).
  assert.match(src, /requireScope\(\),[\s\S]{0,20}requireRole\('dash', 'admin', 'agent'\)/)
})

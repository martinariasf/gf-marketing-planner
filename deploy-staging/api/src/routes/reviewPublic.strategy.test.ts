import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// GF-105 — route WIRING guards for the strategy link.
//
// reviewLib.strategy.test.ts proves stripVisuals() and parseLinkView() behave.
// It cannot prove they are actually CALLED: these routes need a live PocketBase
// plus a minted access code to invoke, so — following the same approach as
// reviewLinks.agentRole.test.ts and chat.relay.test.ts — the wiring is asserted
// at the source level.
//
// What this protects: acceptance criterion 3 says the public API response for a
// strategy link carries no image URL. That guarantee is one `.map()` away from
// being silently deleted in a future refactor of buildReviewPayload, and every
// unit test would still pass while unpublished artwork leaked to an
// unauthenticated reviewer.

const publicSrc = readFileSync(fileURLToPath(new URL('./reviewPublic.ts', import.meta.url)), 'utf8')
const linksSrc = readFileSync(fileURLToPath(new URL('./reviewLinks.ts', import.meta.url)), 'utf8')

test('GF-105: the public payload builder still strips visuals for a strategy link', () => {
  assert.match(publicSrc, /import\s*\{[\s\S]*stripVisuals[\s\S]*\}\s*from\s*'\.\.\/reviewLib\.js'/)
  // The strip must be conditional on the view, and must be applied to the posts.
  assert.match(
    publicSrc,
    /view === 'strategy' \? stripVisuals\(/,
    'buildReviewPayload no longer pipes posts through stripVisuals for a strategy link',
  )
})

test('GF-105: the view is resolved through parseLinkView, not read raw', () => {
  // Reading `link.view` directly would treat an absent/garbage value as truthy
  // or undefined rather than collapsing it to the safe 'content' default.
  assert.match(publicSrc, /const view = parseLinkView\(link\.view\)/)
})

test('GF-105: both public entry points share one payload builder', () => {
  // `open` (code exchange) and the refresh GET must not diverge — a strategy
  // link that stripped on open but not on refresh would leak on the second call.
  const builderCalls = publicSrc.match(/buildReviewPayload\(/g) ?? []
  assert.ok(
    builderCalls.length >= 3,
    `expected the definition plus both entry points to use buildReviewPayload, found ${builderCalls.length}`,
  )
  assert.equal(
    (publicSrc.match(/async function buildReviewPayload\(/g) ?? []).length,
    1,
    'there must be exactly one payload builder',
  )
})

test('GF-105: the public payload advertises the view to the SPA', () => {
  // The SPA branches on link.view to pick the shell; if the API stops sending
  // it, a strategy link silently renders the creative shell.
  assert.match(publicSrc, /months: parseMonthSelection\(link\.months\),\s*\n\s*view,/)
})

test('GF-105: creating a link persists the view', () => {
  assert.match(linksSrc, /view: z\.enum\(\['content', 'strategy'\]\)\.optional\(\)/)
  assert.match(linksSrc, /view: parseLinkView\(body\.view\)/)
})

test('GF-105: listing a link returns its view', () => {
  // publicLink() is the projection the dashboard reads; without `view` the
  // share dialog cannot label existing links.
  assert.match(linksSrc, /view: parseLinkView\(rec\.view\)/)
})

test('GF-105: the codeHash is still never projected to the dashboard', () => {
  // Guard against the `view` addition being pasted into publicLink alongside
  // the whole record.
  const projection = /function publicLink\(rec: ReviewLinkRecord\) \{[\s\S]*?\n\}/.exec(linksSrc)
  assert.ok(projection, 'publicLink projection not found')
  assert.ok(!projection[0].includes('codeHash'), 'publicLink must never expose codeHash')
})

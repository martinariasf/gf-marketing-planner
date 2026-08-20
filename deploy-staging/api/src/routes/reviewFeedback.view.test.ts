import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { linkViewResolver } from '../reviewLib.js'

// GF-106 TASK-001 — every decision and comment returned by
// GET /clients/:slug/review-feedback must be stamped with the view of the link
// it came from, so the dashboard can split "what the client said about the
// posts" from "what the client said about the strategy".

test('GF-106: a linkId that resolves to a strategy link is stamped strategy', () => {
  const viewOf = linkViewResolver([
    { id: 'lnk_a', view: 'strategy' },
    { id: 'lnk_b', view: 'content' },
  ])
  assert.equal(viewOf('lnk_a'), 'strategy')
  assert.equal(viewOf('lnk_b'), 'content')
})

test('GF-106: a link with no view field (pre-GF-105) yields content', () => {
  const viewOf = linkViewResolver([{ id: 'lnk_old' }])
  assert.equal(viewOf('lnk_old'), 'content')
})

test('GF-106: an unresolvable or missing linkId yields content rather than throwing', () => {
  const viewOf = linkViewResolver([{ id: 'lnk_a', view: 'strategy' }])
  assert.equal(viewOf('lnk_deleted'), 'content')
  assert.equal(viewOf(undefined), 'content')
  assert.equal(viewOf(''), 'content')
})

test('GF-106: a garbage stored view collapses to content', () => {
  const viewOf = linkViewResolver([{ id: 'lnk_x', view: 'nonsense' as unknown as undefined }])
  assert.equal(viewOf('lnk_x'), 'content')
})

// ── Wiring guards (same approach as reviewPublic.strategy.test.ts) ───────────
// The pure resolver above cannot prove the aggregation handler actually calls
// it; that handler needs a live PocketBase to invoke. Assert the wiring at the
// source level so a refactor cannot silently drop the stamp.

const linksSrc = readFileSync(fileURLToPath(new URL('./reviewLinks.ts', import.meta.url)), 'utf8')

// From the route registration to the end of the file — review-feedback is the
// last handler in reviewLinks.ts.
const handlerStart = linksSrc.indexOf("'/clients/:slug/review-feedback'")
const handler = handlerStart === -1 ? '' : linksSrc.slice(handlerStart)

test('GF-106: the review-feedback handler resolves views through linkViewResolver', () => {
  assert.ok(handler, 'review-feedback handler not found')
  assert.match(handler, /linkViewResolver\(/)
})

test('GF-106: the handler delegates the stamping fold to buildReviewFeedback', () => {
  // The fold itself (decisions keyed on reviewer AND view, latest-wins within a
  // view, orphan rows retained) is a pure function in reviewLib and is covered
  // BEHAVIOURALLY in reviewLib.feedbackFold.test.ts. All this guard has to prove
  // is that the handler still routes its rows through it, passing the resolver.
  assert.match(
    handler,
    /buildReviewFeedback\(\s*events,\s*comments,\s*viewOf\s*\)/,
    'the handler must fold events and comments through buildReviewFeedback with the resolver',
  )
})

test('GF-106: review_links is fetched once, not per row', () => {
  const fetches = handler.match(/collection\('review_links'\)/g) ?? []
  assert.equal(fetches.length, 1, 'review_links must be fetched exactly once for the whole aggregation')
})

test('GF-106: the aggregation still sorts by the text createdAt field', () => {
  // These PB collections have no autodate `created` field.
  assert.ok(!/sort: 'created'/.test(handler), 'must not sort by the non-existent autodate `created`')
  assert.ok((handler.match(/sort: 'createdAt'/g) ?? []).length >= 2, 'both reads must sort by createdAt')
})

test('GF-106: the handler does not filter rows by view', () => {
  // The dashboard needs both kinds; filtering server-side would blank a panel.
  assert.ok(!/view === 'strategy'/.test(handler), 'the aggregation must not drop rows by view')
})

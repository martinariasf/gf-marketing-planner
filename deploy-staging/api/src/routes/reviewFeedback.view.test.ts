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

test('GF-106: decisions and comments are both stamped with a view', () => {
  // Two resolution sites: one for the decision rows, one for the comment rows.
  const stamps = handler.match(/viewOf\(/g) ?? []
  assert.ok(stamps.length >= 2, `expected decisions and comments to be stamped, found ${stamps.length}`)
  assert.match(handler, /\n\s*view,\r?\n/, 'the decision entry must carry a view field')
  assert.match(handler, /view: viewOf\(cm\.linkId\)/, 'the comment entry must carry a view field')
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

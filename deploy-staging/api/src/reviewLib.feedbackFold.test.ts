import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildReviewFeedback, linkViewResolver } from './reviewLib.js'

// GF-106 TASK-001 (review round 1, finding 2) — the merge behind
// GET /clients/:slug/review-feedback used to live inline in the route handler,
// covered only by source-regex wiring guards. Those guards assert that certain
// strings exist; they assert nothing about MERGE SEMANTICS, so a refactor that
// keyed the map on the reviewer alone would silently drop one of a reviewer's
// two decisions and violate acceptance criterion 6 without failing a test.
//
// These tests pin the behaviour itself.

const LINKS = [
  { id: 'lnk_content', view: 'content' as const },
  { id: 'lnk_strategy', view: 'strategy' as const },
  { id: 'lnk_legacy' }, // pre-GF-105: no view field at all
]
const viewOf = linkViewResolver(LINKS)

test('GF-106: one reviewer deciding on BOTH links for one post yields two entries', () => {
  const { byPost } = buildReviewFeedback(
    [
      {
        postId: 'p1',
        linkId: 'lnk_content',
        kind: 'approved',
        reviewerName: 'Ana',
        createdAt: '2026-08-20T10:00:00.000Z',
      },
      {
        postId: 'p1',
        linkId: 'lnk_strategy',
        kind: 'changes_requested',
        reviewerName: 'Ana',
        createdAt: '2026-08-20T11:00:00.000Z',
      },
    ],
    [],
    viewOf,
  )

  const decisions = byPost['p1']!.decisions
  assert.equal(decisions.length, 2, 'the same reviewer on two views must produce two entries')

  const byView = Object.fromEntries(decisions.map((d) => [d.view, d.decision]))
  assert.deepEqual(byView, { content: 'approved', strategy: 'changes_requested' })
})

test('GF-106: within ONE view, the latest decision still wins', () => {
  const { byPost } = buildReviewFeedback(
    [
      {
        postId: 'p1',
        linkId: 'lnk_content',
        kind: 'changes_requested',
        reviewerName: 'Ana',
        createdAt: '2026-08-20T10:00:00.000Z',
      },
      {
        postId: 'p1',
        linkId: 'lnk_content',
        kind: 'approved',
        reviewerName: 'Ana',
        createdAt: '2026-08-20T12:00:00.000Z',
      },
    ],
    [],
    viewOf,
  )

  const decisions = byPost['p1']!.decisions
  assert.equal(decisions.length, 1, 'same reviewer + same view must collapse to one entry')
  assert.equal(decisions[0]!.decision, 'approved')
  assert.equal(decisions[0]!.createdAt, '2026-08-20T12:00:00.000Z')
})

test('GF-106: two DIFFERENT reviewers on the same view stay separate', () => {
  const { byPost } = buildReviewFeedback(
    [
      { postId: 'p1', linkId: 'lnk_content', kind: 'approved', reviewerName: 'Ana', createdAt: '1' },
      { postId: 'p1', linkId: 'lnk_content', kind: 'changes_requested', reviewerName: 'Bo', createdAt: '2' },
    ],
    [],
    viewOf,
  )
  assert.equal(byPost['p1']!.decisions.length, 2)
})

test('GF-106: a reviewer name that looks like "<name> <view>" cannot collide', () => {
  // The composite key uses U+0000, which cannot occur in a reviewer name. With a
  // printable separator, "Ana content" + strategy would collide with "Ana" +
  // content and one decision would vanish.
  const { byPost } = buildReviewFeedback(
    [
      { postId: 'p1', linkId: 'lnk_content', kind: 'approved', reviewerName: 'Ana', createdAt: '1' },
      {
        postId: 'p1',
        linkId: 'lnk_strategy',
        kind: 'changes_requested',
        reviewerName: 'Ana content',
        createdAt: '2',
      },
    ],
    [],
    viewOf,
  )
  assert.equal(byPost['p1']!.decisions.length, 2, 'a name containing a view word must not collide')
})

test('GF-106: rows with an unresolvable or missing linkId are stamped content, never dropped', () => {
  const { byPost, general } = buildReviewFeedback(
    [
      { postId: 'p1', linkId: 'lnk_deleted', kind: 'approved', reviewerName: 'Ana', createdAt: '1' },
      { postId: 'p2', kind: 'approved', reviewerName: 'Bo', createdAt: '2' },
    ],
    [
      { id: 'c1', postId: 'p1', linkId: 'lnk_deleted', body: 'orphan comment' },
      { id: 'c2', postId: '', linkId: undefined, body: 'orphan general' },
    ],
    viewOf,
  )

  assert.equal(byPost['p1']!.decisions[0]!.view, 'content', 'deleted link => content')
  assert.equal(byPost['p2']!.decisions[0]!.view, 'content', 'missing linkId => content')
  assert.equal(byPost['p1']!.comments.length, 1, 'an orphan comment must not be dropped')
  assert.equal(byPost['p1']!.comments[0]!.view, 'content')
  assert.equal(general.comments.length, 1, 'a comment with no postId lands in general')
  assert.equal(general.comments[0]!.view, 'content')
})

test('GF-106: a legacy link with no view field yields content, and nothing is filtered by view', () => {
  const { byPost } = buildReviewFeedback(
    [
      { postId: 'p1', linkId: 'lnk_legacy', kind: 'approved', reviewerName: 'Ana', createdAt: '1' },
      { postId: 'p1', linkId: 'lnk_strategy', kind: 'approved', reviewerName: 'Bo', createdAt: '2' },
    ],
    [],
    viewOf,
  )
  const views = byPost['p1']!.decisions.map((d) => d.view).sort()
  assert.deepEqual(views, ['content', 'strategy'], 'both views are returned; nothing is filtered')
})

test('GF-106: an event with no postId is skipped rather than bucketed under ""', () => {
  const { byPost } = buildReviewFeedback(
    [{ linkId: 'lnk_content', kind: 'approved', reviewerName: 'Ana', createdAt: '1' }],
    [],
    viewOf,
  )
  assert.deepEqual(Object.keys(byPost), [], 'a decision with no postId has nowhere to go')
})

test('GF-106: an anonymous reviewer falls back to Guest', () => {
  const { byPost } = buildReviewFeedback(
    [{ postId: 'p1', linkId: 'lnk_content', kind: 'approved', createdAt: '1' }],
    [],
    viewOf,
  )
  assert.equal(byPost['p1']!.decisions[0]!.reviewerName, 'Guest')
})

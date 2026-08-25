import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcilePosts } from './analyticsSync.js'
import type { RemotePost } from './analytics/provider.js'

// GF-113 / TASK-007 — joining what Postiz reports back to our own posts.
//
// The join key is `publishing.providerJobId` (GF-26 already stores it). The
// interesting cases are all the ones where the join FAILS, because while GF-26's
// payload bug is unfixed most posts never reach Postiz at all — and the tab has to
// degrade honestly rather than look broken or under-report.

const remote = (over: Partial<RemotePost> & { id: string }): RemotePost => ({
  integrationId: 'cmp2usehl00nvly0yy16yp0vc',
  channel: 'instagram-standalone',
  state: 'PUBLISHED',
  publishDate: '2026-08-05T10:00:00Z',
  releaseURL: 'https://www.instagram.com/p/DZ-Q8yzmuMl/',
  ...over,
})

test('a post that reached Postiz is joined to our post id', () => {
  const { posts, unlinked } = reconcilePosts(
    [remote({ id: 'cm-post-1' })],
    [{ id: 'p_local_1', publishing: { providerJobId: 'cm-post-1' } }],
  )
  assert.equal(posts[0]?.postId, 'p_local_1')
  assert.equal(posts[0]?.state, 'published')
  assert.equal(posts[0]?.releaseURL, 'https://www.instagram.com/p/DZ-Q8yzmuMl/')
  assert.equal(unlinked, 0)
})

test('the legacy postizJobId alias still joins', () => {
  const { posts } = reconcilePosts(
    [remote({ id: 'cm-post-1' })],
    [{ id: 'p_legacy', publishing: { postizJobId: 'cm-post-1' } }],
  )
  assert.equal(posts[0]?.postId, 'p_legacy')
})

test('our posts with no providerJobId are COUNTED as unlinked, never dropped silently', () => {
  // This is the number that lets the tab say "3 posts were never scheduled
  // through Postiz" instead of quietly showing fewer posts than exist.
  const { posts, unlinked } = reconcilePosts(
    [remote({ id: 'cm-post-1' })],
    [
      { id: 'p_local_1', publishing: { providerJobId: 'cm-post-1' } },
      { id: 'p_never_scheduled' },
      { id: 'p_also_never', publishing: {} },
      { id: 'p_third', publishing: { providerJobId: 123 as unknown as string } },
    ],
  )
  assert.equal(unlinked, 3)
  assert.equal(posts.length, 1)
})

test('a Postiz post we cannot match still appears, with a null postId', () => {
  // Posted directly in Postiz, outside the dashboard. It is real and published, so
  // hiding it would under-report the client's actual activity.
  const { posts } = reconcilePosts([remote({ id: 'cm-orphan' })], [])
  assert.equal(posts.length, 1)
  assert.equal(posts[0]?.postId, null)
})

test('an ERROR post surfaces its state instead of sitting as Programmed forever', () => {
  const { posts } = reconcilePosts(
    [remote({ id: 'cm-bad', state: 'ERROR', releaseURL: null })],
    [{ id: 'p_bad', publishing: { providerJobId: 'cm-bad' } }],
  )
  assert.equal(posts[0]?.state, 'error')
  assert.equal(posts[0]?.releaseURL, null)
})

test('no reconciled post carries metrics — per-post metrics are out of scope', () => {
  // TASK-018. An empty array means "unknown". A zero would be a fabricated number,
  // which is the entire failure mode GF-113 exists to remove.
  const { posts } = reconcilePosts(
    [remote({ id: 'cm-post-1' })],
    [{ id: 'p_local_1', publishing: { providerJobId: 'cm-post-1' } }],
  )
  assert.deepEqual(posts[0]?.metrics, [])
})

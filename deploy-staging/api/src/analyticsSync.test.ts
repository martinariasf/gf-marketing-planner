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

// ── Review round 1, findings 2 and 3 ────────────────────────────────────────
// The two most safety-critical branches in the worker had no coverage: what
// happens when a refresh is REFUSED, and what happens when ONE channel fails.
// Both were extracted from syncClientAnalytics specifically so they can be
// tested without PocketBase.

import { collectChannelSeries, payloadAfterFailure } from './analyticsSync.js'
import { AnalyticsError } from './analytics/provider.js'
import { emptyAnalytics, type AnalyticsChannel, type ClientAnalytics } from './schemas/analytics.js'

const channel = (id: string, over: Partial<AnalyticsChannel> = {}): AnalyticsChannel => ({
  id,
  identifier: 'instagram-standalone',
  name: id,
  profile: null,
  picture: null,
  disabled: false,
  series: [],
  error: null,
  ...over,
})

const goodPayload = (): ClientAnalytics => ({
  provider: 'postiz',
  status: 'ok',
  syncedAt: '2026-08-24T06:00:00.000Z',
  error: null,
  channels: [channel('cm-ig', { series: [{ label: 'Reach', kind: 'series', points: [{ date: '2026-08-24', total: 120 }] }] })],
  posts: [],
  unlinked: 0,
})

test('one channel failing leaves the other channels intact', async () => {
  const provider = {
    channelSeries: async (id: string) => {
      if (id === 'cm-bad') throw new AnalyticsError('postiz', 'Postiz returned 500.', { status: 500 })
      return [{ label: 'Reach', kind: 'series' as const, points: [{ date: '2026-08-24', total: 99 }] }]
    },
  }
  const channels = [channel('cm-good'), channel('cm-bad'), channel('cm-good-2')]
  await collectChannelSeries(provider, channels, 30)

  assert.equal(channels[0]?.series.length, 1, 'the first good channel keeps its data')
  assert.equal(channels[2]?.series.length, 1, 'a good channel AFTER the failure still runs')
  assert.deepEqual(channels[1]?.series, [], 'the failed channel is empty, not fabricated')
  assert.ok(channels[1]?.error, 'the failed channel records why')
  assert.equal(channels[0]?.error, null, 'a healthy channel carries no error')
})

test('a disabled channel costs no request and is still reported', async () => {
  let calls = 0
  const provider = {
    channelSeries: async () => {
      calls += 1
      return []
    },
  }
  const channels = [channel('cm-off', { disabled: true }), channel('cm-on')]
  await collectChannelSeries(provider, channels, 30)
  assert.equal(calls, 1, 'only the enabled channel was fetched')
  assert.equal(channels.length, 2, 'the disabled channel is still in the payload')
})

test('a 429 escapes the channel loop instead of being swallowed per-channel', async () => {
  // A rate-limit refusal is not a per-channel problem: the whole sync must stop
  // so the previous payload is kept.
  const provider = {
    channelSeries: async () => {
      throw new AnalyticsError('postiz', 'Too many requests', { status: 429 })
    },
  }
  await assert.rejects(
    () => collectChannelSeries(provider, [channel('cm-ig')], 30),
    (err: unknown) => err instanceof AnalyticsError && err.status === 429,
  )
})

test('a 429 keeps the previous numbers and marks them stale', async () => {
  const previous = goodPayload()
  const out = payloadAfterFailure(previous, 'postiz', new AnalyticsError('postiz', 'Too many requests', { status: 429 }))
  assert.equal(out.status, 'stale')
  assert.equal(out.channels.length, 1, 'the working tab is NOT blanked')
  assert.equal(out.channels[0]?.series.length, 1)
  assert.equal(out.syncedAt, previous.syncedAt, 'the stamp still reflects when the data was real')
  assert.match(out.error ?? '', /Too many requests/)
})

test('a non-429 failure also keeps previous good data rather than blanking it', async () => {
  const out = payloadAfterFailure(goodPayload(), 'postiz', new Error('network down'))
  assert.equal(out.status, 'stale')
  assert.equal(out.channels.length, 1)
})

test('a failure with no previous good data reports error, not stale', async () => {
  // Nothing to fall back on, so "stale" would imply data we do not have.
  const out = payloadAfterFailure(emptyAnalytics('no_key'), 'postiz', new Error('401 unauthorized'))
  assert.equal(out.status, 'error')
  assert.deepEqual(out.channels, [])
  assert.match(out.error ?? '', /401/)
})

test('a previously-stale payload with data still degrades to stale, not error', async () => {
  const prev = { ...goodPayload(), status: 'stale' as const }
  const out = payloadAfterFailure(prev, 'postiz', new AnalyticsError('postiz', 'Too many requests', { status: 429 }))
  assert.equal(out.status, 'stale')
  assert.equal(out.channels.length, 1)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PostizAnalyticsProvider, toMetricSeries, toRemoteState } from './postiz.js'
import { AnalyticsError } from './provider.js'

// GF-113 / TASK-003.
//
// GROUND RULE FOR THIS FILE: every fixture below is a shape MEASURED against live
// Postiz Cloud in the TASK-001 probe (2026-08-24). Nothing here asserts a shape
// that only docs.postiz.com claims — that is exactly the mistake that shipped
// GF-26's broken payload. Where the docs and the probe disagree, the test encodes
// the probe and says so.

// --- toMetricSeries -------------------------------------------------------

test('a multi-point label is classified as a series (probe: Reach, 29 daily points)', () => {
  const entry = {
    label: 'Reach',
    percentageChange: 5,
    data: [
      { total: 120, date: '2026-07-27' },
      { total: 143, date: '2026-07-28' },
      { total: 98, date: '2026-07-29' },
    ],
  }
  const out = toMetricSeries(entry)
  assert.equal(out?.label, 'Reach')
  assert.equal(out?.kind, 'series')
  assert.equal(out?.points.length, 3)
})

test('a single-point label is classified as a snapshot, not a trend (probe: Likes)', () => {
  // The probe returned Likes/Views/Comments/Shares/Saves/Replies as ONE point
  // dated today. Plotting that as a line would draw a meaningless flat chart.
  const out = toMetricSeries({ label: 'Likes', percentageChange: 5, data: [{ total: 42, date: '2026-08-24' }] })
  assert.equal(out?.kind, 'snapshot')
  assert.equal(out?.points.length, 1)
})

test('percentageChange is never carried into our contract', () => {
  // It was exactly 5 on all seven Instagram labels — a placeholder, not a delta.
  const out = toMetricSeries({ label: 'Reach', percentageChange: 5, data: [{ total: 1, date: '2026-08-24' }] })
  assert.equal('percentageChange' in (out as object), false)
})

test('total arriving as a string is coerced to a number (docs claim string, probe said number)', () => {
  const out = toMetricSeries({ label: 'Views', data: [{ total: '317', date: '2026-08-24' }] })
  assert.deepEqual(out?.points, [{ date: '2026-08-24', total: 317 }])
})

test('an unparseable point is dropped, never zeroed', () => {
  // A NaN silently becoming 0 would put a fabricated number on the tab, which is
  // the precise failure GF-113 exists to remove.
  const out = toMetricSeries({
    label: 'Reach',
    data: [
      { total: 'not-a-number', date: '2026-08-24' },
      { total: 5, date: '2026-08-25' },
    ],
  })
  assert.deepEqual(out?.points, [{ date: '2026-08-25', total: 5 }])
})

test('an entry with no label is rejected outright', () => {
  assert.equal(toMetricSeries({ data: [{ total: 1, date: '2026-08-24' }] }), null)
  assert.equal(toMetricSeries(null), null)
})

// --- toRemoteState --------------------------------------------------------

test('Postiz post states map onto our enum', () => {
  assert.equal(toRemoteState('PUBLISHED'), 'published')
  assert.equal(toRemoteState('QUEUE'), 'queued')
  assert.equal(toRemoteState('ERROR'), 'error')
  assert.equal(toRemoteState('DRAFT'), 'draft')
  assert.equal(toRemoteState('something-new'), 'unknown')
})

// --- adapter over a stubbed fetch -----------------------------------------

function withFetch<T>(handler: (url: string) => { status?: number; body: unknown }, run: () => Promise<T>) {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const { status = 200, body } = handler(String(input))
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return run().finally(() => {
    globalThis.fetch = original
  })
}

test('listChannels reads the probe integration shape, including a disabled channel', async () => {
  // Real ids from the probe. Note they are cuid-style, NOT the UUIDs the docs
  // claim, and Instagram's identifier is `instagram-standalone`.
  const fixture = [
    {
      id: 'cmp2usehl00nvly0yy16yp0vc',
      identifier: 'instagram-standalone',
      name: 'GF Innovative Solutions',
      profile: 'gfinnovative',
      picture: 'https://example.test/a.png',
      disabled: false,
    },
    {
      id: 'cmrme231601lzn60yt4un8udo',
      identifier: 'linkedin',
      name: 'Pilar Arias',
      profile: 'pilar-arias',
      disabled: true,
    },
  ]
  await withFetch(
    () => ({ body: fixture }),
    async () => {
      const channels = await new PostizAnalyticsProvider('k').listChannels()
      assert.equal(channels.length, 2)
      assert.equal(channels[0]?.identifier, 'instagram-standalone')
      assert.equal(channels[0]?.profile, 'gfinnovative')
      assert.equal(channels[1]?.disabled, true)
      // series is filled by channelSeries, never by listChannels
      assert.deepEqual(channels[0]?.series, [])
    },
  )
})

test('channelSeries returns [] for a connected channel with no coverage (probe: LinkedIn)', async () => {
  // 200 with an empty array. This is a normal outcome, not an error, and it must
  // not be turned into zeros.
  await withFetch(
    () => ({ body: [] }),
    async () => {
      const series = await new PostizAnalyticsProvider('k').channelSeries('cmrme231601lzn60yt4un8udo', 30)
      assert.deepEqual(series, [])
    },
  )
})

test('a 4xx surfaces as AnalyticsError carrying the status code', async () => {
  // The worker branches on `status` (429 -> stale + keep payload, 401 -> error),
  // so the code must survive the throw rather than be buried in the message.
  await withFetch(
    () => ({ status: 429, body: { message: 'Too many requests' } }),
    async () => {
      await assert.rejects(
        () => new PostizAnalyticsProvider('k').channelSeries('cmp2usehl00nvly0yy16yp0vc', 30),
        (err: unknown) => err instanceof AnalyticsError && err.status === 429,
      )
    },
  )
})

test('listRemotePosts unwraps the { posts: [...] } envelope at the adapter boundary', async () => {
  // PROBE CORRECTION: the docs show a bare array. It is wrapped. Unwrapping here
  // means no envelope ever reaches the SPA.
  const fixture = {
    posts: [
      {
        id: 'cm-post-1',
        content: 'hello',
        publishDate: '2026-08-05T10:00:00Z',
        state: 'PUBLISHED',
        releaseURL: 'https://www.instagram.com/p/DZ-Q8yzmuMl/',
        releaseId: '18414871717179534',
        integration: {
          id: 'cmp2usehl00nvly0yy16yp0vc',
          providerIdentifier: 'instagram-standalone',
          name: 'GF Innovative Solutions',
        },
      },
    ],
  }
  await withFetch(
    () => ({ body: fixture }),
    async () => {
      const posts = await new PostizAnalyticsProvider('k').listRemotePosts('2026-05-27', '2026-08-25')
      assert.equal(posts.length, 1)
      assert.equal(posts[0]?.id, 'cm-post-1')
      assert.equal(posts[0]?.releaseURL, 'https://www.instagram.com/p/DZ-Q8yzmuMl/')
      assert.equal(posts[0]?.channel, 'instagram-standalone')
      assert.equal(posts[0]?.integrationId, 'cmp2usehl00nvly0yy16yp0vc')
    },
  )
})

test('postSeries returns [] — the measured Postiz reality that removed per-post metrics', async () => {
  // TASK-018: `200 []` for every published post at every window. This test exists
  // to pin the finding, so that if Postiz ever starts returning data a failing
  // test tells us GF-21's assumption changed.
  await withFetch(
    () => ({ body: [] }),
    async () => {
      assert.deepEqual(await new PostizAnalyticsProvider('k').postSeries('cm-post-1', 90), [])
    },
  )
})

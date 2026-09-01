// GF-113 — background analytics sync worker (TASK-005) + post reconciliation
// (TASK-007).
//
// WHO OWNS THE SYNC: the API server, not Viktor (TASK-016, decided 2026-08-24).
// Two spec-only Viktor skills described this loop against a guessed endpoint that
// does not exist; installing either would have created a second, conflicting
// writer. Exactly one component writes analytics data, and it is this file.
//
// WHY A WORKER AT ALL: the Postiz public API is rate limited and — measured in
// the TASK-001 probe — returns NO rate-limit headers whatsoever. There is nothing
// to self-regulate against at runtime, so the budget has to be conservative BY
// CONSTRUCTION and page loads must never touch Postiz. A page load reads the
// cache row this worker writes, and nothing else.
//
// THE PER-CLIENT REQUEST BUDGET IS FIXED AND SMALL:
//   1  x GET /integrations
//   N  x GET /analytics/{channelId}     (N = enabled channels; 2 for GF today)
//   1  x GET /posts?startDate=&endDate=
//   = 4 requests for a two-channel client.
//
// NOT IN THAT BUDGET: GET /analytics/post/{id}. The probe proved it returns
// `200 []` for every published post at both 30- and 90-day windows, so one
// request per post would buy literally nothing against a quota we cannot measure.
// TASK-018 folded real per-post metrics into GF-21 (Meta Graph API). Do not add
// it back here without re-running the probe first.

import { withPb } from './pb.js'
import { getAnalyticsProvider } from './analytics/index.js'
import { AnalyticsError, type AnalyticsProvider, type RemotePost } from './analytics/provider.js'
import { toRemoteState } from './analytics/postiz.js'
import {
  emptyAnalytics,
  type AnalyticsChannel,
  type AnalyticsPost,
  type ClientAnalytics,
} from './schemas/analytics.js'
import { listPosts } from './posts.js'

/** Days of history requested per channel. 30 matches the probe window that
 *  produced the 29-point Reach series. */
const WINDOW_DAYS = 30

/** How far back to ask Postiz for posts. Wider than the metric window so a post
 *  published last quarter still resolves its live URL in the ledger. */
const POSTS_WINDOW_DAYS = 90

type CacheRec = {
  id: string
  slug: string
  provider?: string
  status?: string
  syncedAt?: string
  error?: string
  channels?: unknown
  posts?: unknown
  unlinked?: number
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

/** Read the cached payload for a client, or a well-formed empty one. Never `{}`
 *  and never a throw — the read route depends on this always producing something
 *  the SPA can branch on. */
export async function readAnalyticsCache(slug: string): Promise<ClientAnalytics> {
  let rec: CacheRec | null = null
  try {
    rec = await withPb((pb) =>
      pb.collection('analytics_cache').getFirstListItem<CacheRec>(`slug="${slug}"`),
    )
  } catch {
    // No row yet. "no_key" is the honest default: nothing has ever synced, which
    // for every real client so far means no Postiz key is configured.
    return emptyAnalytics('no_key')
  }
  const status = (rec.status ?? 'error') as ClientAnalytics['status']
  return {
    provider: rec.provider || 'postiz',
    status,
    syncedAt: rec.syncedAt || null,
    error: rec.error || null,
    channels: Array.isArray(rec.channels) ? (rec.channels as AnalyticsChannel[]) : [],
    posts: Array.isArray(rec.posts) ? (rec.posts as AnalyticsPost[]) : [],
    unlinked: typeof rec.unlinked === 'number' ? rec.unlinked : 0,
  }
}

async function writeAnalyticsCache(slug: string, payload: ClientAnalytics): Promise<void> {
  const body = {
    slug,
    provider: payload.provider,
    status: payload.status,
    // Written explicitly: PocketBase does not auto-populate `created` here, and
    // the tab's "last updated" stamp reads this field directly.
    syncedAt: payload.syncedAt ?? new Date().toISOString(),
    error: payload.error ?? '',
    channels: payload.channels,
    // See ensureCollections: the contract nests series per channel. This column
    // stays empty on purpose.
    series: [],
    posts: payload.posts,
    unlinked: payload.unlinked,
  }
  await withPb(async (pb) => {
    try {
      const existing = await pb
        .collection('analytics_cache')
        .getFirstListItem<CacheRec>(`slug="${slug}"`)
      await pb.collection('analytics_cache').update(existing.id, body)
    } catch {
      await pb.collection('analytics_cache').create(body)
    }
  })
}

/** The only part of a post this module cares about: the provider join key. */
export interface OurPublishing {
  providerJobId?: unknown
  /** Legacy alias kept by the post schema. */
  postizJobId?: unknown
}

/**
 * Join what Postiz reports back to our own posts (TASK-007).
 *
 * The join key is `publishing.providerJobId`, which the GF-26 scheduling port
 * already stores on every post it successfully scheduled. Nothing new is needed
 * on the post schema.
 *
 * CAVEAT worth stating plainly: while GF-26's payload bug is unfixed, few posts
 * ever reach Postiz, so few carry a `providerJobId`. Those are counted as
 * `unlinked` rather than dropped, so the tab can say "3 posts were never
 * scheduled through Postiz" instead of quietly under-reporting.
 */
export function reconcilePosts(
  remote: RemotePost[],
  ours: { id: string; publishing?: OurPublishing }[],
): { posts: AnalyticsPost[]; unlinked: number } {
  const byJobId = new Map<string, string>()
  let unlinked = 0
  for (const p of ours) {
    const jobId =
      (typeof p.publishing?.providerJobId === 'string' && p.publishing.providerJobId) ||
      // Legacy alias kept by the post schema.
      (typeof p.publishing?.postizJobId === 'string' && p.publishing.postizJobId) ||
      null
    if (!jobId) {
      unlinked += 1
      continue
    }
    byJobId.set(jobId, p.id)
  }

  const posts: AnalyticsPost[] = remote.map((r) => ({
    postId: byJobId.get(r.id) ?? null,
    remoteId: r.id,
    integrationId: r.integrationId,
    channel: r.channel,
    state: toRemoteState(r.state),
    publishDate: r.publishDate,
    releaseURL: r.releaseURL,
    // Always empty — see the contract. An absent metric means "unknown"; a zero
    // would be a fabricated number.
    metrics: [],
  }))

  return { posts, unlinked }
}

/**
 * Fill each ENABLED channel's series, in place, one request per channel.
 *
 * Extracted from the sync so the partial-failure contract is directly testable
 * against a stub provider, with no PocketBase in the way. That contract is the
 * whole reason this is a loop with a try inside rather than a `Promise.all`:
 * ONE channel failing must not blank the others. Instagram working while
 * LinkedIn 500s has to leave Instagram's numbers on the page.
 *
 * A disabled channel is skipped entirely — it is still reported to the tab (so
 * the client can see it needs reconnecting) but costs no request.
 *
 * The ONE error that is rethrown is a 429. A rate-limit refusal is not a
 * per-channel problem: it means the whole sync must stop and the previous
 * payload must be kept, so it has to escape this loop.
 */
export async function collectChannelSeries(
  provider: Pick<AnalyticsProvider, 'channelSeries'>,
  channels: AnalyticsChannel[],
  days: number,
): Promise<AnalyticsChannel[]> {
  for (const ch of channels) {
    if (ch.disabled) continue
    try {
      ch.series = await provider.channelSeries(ch.id, days)
    } catch (err) {
      if (err instanceof AnalyticsError && err.status === 429) throw err
      ch.error = err instanceof Error ? err.message : 'Channel analytics failed.'
      ch.series = []
    }
  }
  return channels
}

/**
 * Decide what to store when a sync fails.
 *
 * Extracted because this is the most safety-critical branch in the worker and it
 * is pure: given the previous payload and the error, it decides between "keep
 * what we had, mark it stale" and "we have nothing, report the error".
 *
 * A 429, or ANY failure when we already hold good data, keeps the PREVIOUS
 * payload. Blanking a working tab because one refresh was refused would be
 * strictly worse than showing slightly older real numbers — and since Postiz
 * publishes no rate-limit headers, refusals are something we discover by being
 * refused, not something we can avoid.
 */
export function payloadAfterFailure(
  previous: ClientAnalytics,
  providerName: string,
  err: unknown,
): ClientAnalytics {
  const message = err instanceof Error ? err.message : 'Analytics sync failed.'

  // The ONLY question that matters: do we still hold real numbers worth showing?
  //
  // This is deliberately keyed on the DATA, not on the previous status. Keying it
  // on `status === 'ok'` was a bug: after ok -> 429 (stale, data retained) -> 500,
  // the third failure saw status 'stale', concluded there was nothing to keep, and
  // blanked a tab that was still holding real numbers from the first sync. Once a
  // payload goes stale it must be able to STAY stale.
  const hasData = previous.channels.length > 0 || previous.posts.length > 0

  if (hasData) {
    return { ...previous, status: 'stale', error: message }
  }

  // Nothing to retain. `stale` would be a lie here - it promises the reader that
  // the numbers on screen were real once, and there are no numbers on screen.
  return {
    ...emptyAnalytics('error', { provider: providerName }),
    error: message,
    syncedAt: new Date().toISOString(),
  }
}

/** Run one client's sync. Returns the payload it wrote. */
export async function syncClientAnalytics(slug: string): Promise<ClientAnalytics> {
  const previous = await readAnalyticsCache(slug)

  let provider: AnalyticsProvider | null
  try {
    provider = await getAnalyticsProvider(slug)
  } catch (err) {
    const payload: ClientAnalytics = {
      ...emptyAnalytics('error'),
      error: err instanceof Error ? err.message : 'Unknown analytics provider.',
      syncedAt: new Date().toISOString(),
    }
    await writeAnalyticsCache(slug, payload)
    return payload
  }

  // A revoked or never-configured key: mark and move on. The worker must survive
  // this without failing the whole roster.
  if (!provider) {
    const payload = { ...emptyAnalytics('no_key'), syncedAt: new Date().toISOString() }
    await writeAnalyticsCache(slug, payload)
    return payload
  }

  try {
    const channels = await provider.listChannels()
    if (channels.length === 0) {
      const payload = {
        ...emptyAnalytics('no_channels', { provider: provider.name }),
        syncedAt: new Date().toISOString(),
      }
      await writeAnalyticsCache(slug, payload)
      return payload
    }

    await collectChannelSeries(provider, channels, WINDOW_DAYS)

    const remote = await provider.listRemotePosts(
      isoDaysAgo(POSTS_WINDOW_DAYS),
      new Date().toISOString().slice(0, 10),
    )
    // `listPosts` returns PostBase[]; `publishing` is an untyped bag on it, so
    // narrow explicitly rather than double-casting. A double cast here would hide
    // a shape change and silently mark every post `unlinked`.
    const ours = await listPosts(slug)
    const { posts, unlinked } = reconcilePosts(
      remote,
      (ours ?? []).map((p) => ({
        id: p.id,
        publishing: (p as { publishing?: OurPublishing }).publishing,
      })),
    )

    const payload: ClientAnalytics = {
      provider: provider.name,
      status: 'ok',
      syncedAt: new Date().toISOString(),
      error: null,
      channels,
      posts,
      unlinked,
    }
    await writeAnalyticsCache(slug, payload)
    return payload
  } catch (err) {
    const payload = payloadAfterFailure(previous, provider.name, err)
    await writeAnalyticsCache(slug, payload)
    return payload
  }
}

/**
 * Append an audit row for one sync.
 *
 * Written straight to the collection rather than through `audit(principal, …)`:
 * that helper derives actor/role from a `TokenPrincipal`, and the worker has no
 * principal — it runs on a timer, not on behalf of a request. Manufacturing a
 * fake principal to satisfy the signature would put a bogus token/role in the
 * trail, which is worse than a slightly duplicated write. Best-effort by design:
 * a failed audit must never fail a sync.
 */
async function auditSync(slug: string, payload: ClientAnalytics): Promise<void> {
  try {
    await withPb((pb) =>
      pb.collection('audit').create({
        actor: 'analytics-sync',
        role: 'system',
        action: 'analytics.sync',
        slug,
        resource: 'analytics_cache',
        note: `status=${payload.status} channels=${payload.channels.length} posts=${payload.posts.length} unlinked=${payload.unlinked}`,
        ts: new Date().toISOString(),
      }),
    )
  } catch {
    /* best-effort */
  }
}

/** Slugs that have a Postiz key configured. Only these cost any requests. */
async function slugsWithKeys(): Promise<string[]> {
  try {
    const recs = await withPb((pb) =>
      pb.collection('integration_secrets').getFullList<{ slug: string; postizApiKeyEnc?: string }>(),
    )
    return recs.filter((r) => !!r.postizApiKeyEnc && !!r.slug).map((r) => r.slug)
  } catch {
    return []
  }
}

async function syncAllOnce(): Promise<void> {
  for (const slug of await slugsWithKeys()) {
    try {
      const payload = await syncClientAnalytics(slug)
      await auditSync(slug, payload)
    } catch (err) {
      console.warn('[analyticsSync] sync failed for', slug, err)
    }
  }
}

/**
 * Start the periodic sync. Cadence is env-configurable and defaults to 6 hours,
 * which keeps a full client roster comfortably inside even the most pessimistic
 * reading of Postiz's undocumented hourly limit (the docs contradict themselves
 * at 30 vs 90 requests/hour, and the probe could not settle it without
 * deliberately tripping a 429 on the production account).
 */
export function startAnalyticsSync(): void {
  const minutes = Number(process.env.ANALYTICS_SYNC_INTERVAL_MIN ?? '360')
  const intervalMs = (Number.isFinite(minutes) && minutes > 0 ? minutes : 360) * 60_000
  const run = () => {
    syncAllOnce().catch((err) => console.warn('[analyticsSync] run failed', err))
  }
  // Deliberately late first run: boot is the worst time to spend external quota,
  // and a redeploy loop would otherwise hammer Postiz.
  setTimeout(run, 60_000).unref()
  setInterval(run, intervalMs).unref()
}

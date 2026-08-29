// GF-113 — provider-agnostic analytics port.
//
// WHY THIS EXISTS: same reasoning as `scheduling/provider.ts`. The Performance
// tab must not know that Postiz is where numbers come from. GF-21 is the concrete
// second caller waiting on this — it owns the whole Meta track (ads AND per-post
// insights via the Meta Graph API, folded in on 2026-08-24), and when it lands it
// adds an adapter here rather than editing routes.
//
// The port is READ-ONLY on purpose. Reconciling our post records with what Postiz
// reports is the sync worker's job (TASK-007), routed through the existing
// `scheduling/sync.ts` writer — an analytics adapter must never mutate a post.

import type { AnalyticsChannel, AnalyticsPost, MetricSeries } from '../schemas/analytics.js'

/** A post as the remote provider sees it, before we join it to our own records. */
export interface RemotePost {
  /** The provider's post id — our `publishing.providerJobId`. */
  id: string
  integrationId: string | null
  /** Platform identifier as the provider spells it (`instagram-standalone`, …). */
  channel: string | null
  /** Raw provider state, lowercased. Mapped to our enum by the caller. */
  state: string
  publishDate: string | null
  releaseURL: string | null
}

export interface AnalyticsProvider {
  /** Stable provider name, stored on the cache row (e.g. "postiz"). */
  readonly name: string

  /**
   * Every channel connected to this client's account, enabled or not.
   * The returned `series` is always empty — `channelSeries` fills it. Splitting
   * the two keeps the request budget explicit at the call site: one request here,
   * then exactly one more PER CHANNEL, which is what makes the worker's cost
   * predictable against an API that publishes no rate-limit headers at all.
   */
  listChannels(): Promise<AnalyticsChannel[]>

  /** Metric series for one channel over the last `days`. An enabled channel that
   *  the platform has no data for returns `[]` — that is a normal outcome, not an
   *  error (LinkedIn did exactly this in the probe). */
  channelSeries(channelId: string, days: number): Promise<MetricSeries[]>

  /**
   * Metric series for ONE published post.
   *
   * NOT CALLED ANYWHERE as of GF-113. The TASK-001 probe proved Postiz returns
   * `200 []` for every published post at both 30- and 90-day windows, so paying
   * one request per post buys literally nothing. TASK-018 folded the real per-post
   * work into GF-21 (Meta Graph API, keyed on the `releaseId` Postiz already gives
   * us). The method stays on the port so GF-21's adapter has a shape to implement;
   * the Postiz adapter documents the empty result rather than pretending.
   */
  postSeries(postId: string, days: number): Promise<MetricSeries[]>

  /** Posts the provider knows about in a window — the source of published state
   *  and the real public permalink. */
  listRemotePosts(startDate: string, endDate: string): Promise<RemotePost[]>
}

/** Thrown by analytics adapters when the backend rejects or is unreachable.
 *  `status` carries the HTTP code when there was one, so the worker can tell a
 *  429 (back off, keep the previous payload, mark `stale`) from a 401 (the key
 *  is dead, mark `error`) without string-matching the message. */
export class AnalyticsError extends Error {
  readonly provider: string
  readonly status: number | null
  override readonly cause?: unknown
  constructor(provider: string, message: string, opts: { status?: number | null; cause?: unknown } = {}) {
    super(message)
    this.name = 'AnalyticsError'
    this.provider = provider
    this.status = opts.status ?? null
    this.cause = opts.cause
  }
}

export type { AnalyticsChannel, AnalyticsPost, MetricSeries }

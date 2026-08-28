// GF-113 — SPA mirror of the API's analytics contract.
//
// Kept in lockstep with `deploy-staging/api/src/schemas/analytics.ts` (the zod
// source of truth). Deliberately hand-mirrored rather than generated: the SPA is
// built independently of the API package, and a generation step would be a build
// dependency nothing else here needs.
//
// THE CORE IDEA: metrics are LABEL-DRIVEN, not a fixed list. Postiz returns a
// different set of labels per platform, decided at runtime (Instagram gave seven,
// LinkedIn gave none). The old `PostMetrics` type hard-coded nine metrics no real
// source can fill — that is exactly what made the tab fiction.

/** Why the payload looks the way it does. The tab branches on this rather than
 *  inferring from empty arrays: "no key configured" and "connected but this
 *  platform reports nothing" need completely different messages. */
export type AnalyticsStatus = 'ok' | 'no_key' | 'no_channels' | 'stale' | 'error'

export interface MetricPoint {
  date: string
  total: number
}

export interface MetricSeries {
  /** The provider's own label ("Reach", "Impressions"). Rendered via a
   *  translation map with a fallback to the raw label — never an empty cell. */
  label: string
  /**
   * `series` = a real trend over time, safe to chart.
   * `snapshot` = ONE window total (Postiz returns Likes/Views/Comments/Shares/
   * Saves/Replies this way). Charting a snapshot draws a meaningless flat line,
   * so the UI renders it as a single figure instead.
   */
  kind: 'series' | 'snapshot'
  points: MetricPoint[]
}

export interface AnalyticsChannel {
  id: string
  /** Platform as the provider spells it — note `instagram-standalone`. */
  identifier: string
  name: string
  profile: string | null
  picture: string | null
  disabled: boolean
  /** Empty for a connected channel the platform gives us nothing for. Empty
   *  means UNKNOWN, never zero. */
  series: MetricSeries[]
  error: string | null
}

export type RemotePostState = 'published' | 'queued' | 'error' | 'draft' | 'unknown'

export interface AnalyticsPost {
  /** Our post id, when the join on providerJobId succeeded. */
  postId: string | null
  remoteId: string
  integrationId: string | null
  channel: string | null
  state: RemotePostState
  publishDate: string | null
  /** The real public permalink. The link-out is the ledger's main payoff. */
  releaseURL: string | null
  /**
   * ALWAYS EMPTY as of GF-113 (TASK-018) — Postiz cannot supply per-post metrics
   * and the Meta Graph route is folded into GF-21. The field exists so the ledger
   * row gains columns without a rebuild when GF-21 lands a source. Do not render
   * a zero for a missing metric: absent means unknown.
   */
  metrics: MetricSeries[]
}

export interface ClientAnalytics {
  provider: string
  status: AnalyticsStatus
  syncedAt: string | null
  error: string | null
  channels: AnalyticsChannel[]
  posts: AnalyticsPost[]
  /** How many of OUR posts never reached Postiz (no providerJobId). Shown so the
   *  tab under-reports nothing and explains the gap. */
  unlinked: number
}

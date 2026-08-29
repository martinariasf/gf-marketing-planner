// GF-113 — the normalized analytics contract between the API and the SPA.
//
// WHY THIS EXISTS: the Performance tab used to read a hand-authored
// `performance.json` with a FIXED nine-metric shape (reach, impressions, saves,
// shares, comments, likes, profile visits, clicks, DMs). No real provider can
// fill all nine, and Postiz returns a DIFFERENT set of labels per platform, as
// strings, decided at runtime. A fixed metric enum cannot model that, so this
// contract is label-driven: we render whatever the provider names, and we never
// invent a metric it did not send.
//
// Every field below is grounded in the TASK-001 probe against live Postiz Cloud
// (2026-08-24), NOT in docs.postiz.com — the docs were wrong in four separate
// places and each correction is called out where it bites.

import { z } from 'zod'

/** Why the payload looks the way it does. The SPA branches on this instead of
 *  guessing from empty arrays — "no key configured" and "connected but the
 *  platform returned nothing" are completely different messages to a client. */
export const ANALYTICS_STATUSES = [
  /** A sync succeeded and the payload is fresh. */
  'ok',
  /** No Postiz API key is configured for this client. */
  'no_key',
  /** A key works, but no enabled channels are connected to it. */
  'no_channels',
  /** A refresh was refused (429) or failed; the PREVIOUS good payload is kept. */
  'stale',
  /** The sync failed and there is no previous payload to fall back on. */
  'error',
] as const
export type AnalyticsStatus = (typeof ANALYTICS_STATUSES)[number]

/**
 * PROBE FINDING that forces this discriminator: on Instagram, `Reach` came back
 * as 29 daily points (a real time series) while `Likes`, `Views`, `Comments`,
 * `Shares`, `Saves` and `Replies` each came back as ONE point dated today (a
 * window total). Both arrive in the identical JSON shape from Postiz, so only
 * the point count tells them apart. Plotting a one-point snapshot as a trend
 * line would draw a flat, meaningless chart, so the adapter classifies each
 * label here and the UI picks its mark from `kind`.
 */
export const metricPointSchema = z
  .object({
    /** ISO date the value is attributed to. */
    date: z.string(),
    /** PROBE CORRECTION: the docs show `total` as a string. It is a number. */
    total: z.number(),
  })
  .strict()

export const metricSeriesSchema = z
  .object({
    /** The provider's own label, verbatim ("Reach", "Impressions", "Followers").
     *  NOT an enum — it varies per platform and new ones appear without notice. */
    label: z.string(),
    kind: z.enum(['series', 'snapshot']),
    points: z.array(metricPointSchema),
  })
  .strict()
export type MetricSeries = z.infer<typeof metricSeriesSchema>

// DELIBERATELY ABSENT: `percentageChange`. Postiz returned exactly `5` for all
// seven Instagram labels in the probe — that is a placeholder or a bug, not a
// computed delta. Carrying it would put a fabricated number back on the very tab
// this item exists to de-fake. If a delta is ever shown, we compute it from
// `points`, which we can defend.

/** A connected social channel, as Postiz reports it. */
export const analyticsChannelSchema = z
  .object({
    /** PROBE CORRECTION: ids are cuid-style (`cmp2usehl00nvly0yy16yp0vc`), NOT
     *  the UUIDs the docs claim. Never parse or validate them as UUIDs. */
    id: z.string(),
    /** Platform identifier. PROBE CORRECTION: Instagram reports
     *  `instagram-standalone`, not `instagram` — see the GF-26 note. */
    identifier: z.string(),
    /** Display name of the connected account ("GF Innovative Solutions"). */
    name: z.string(),
    /** Public handle, when the platform exposes one. */
    profile: z.string().nullable().default(null),
    picture: z.string().nullable().default(null),
    disabled: z.boolean().default(false),
    /** Per-channel series. An enabled channel that returns nothing gets an EMPTY
     *  array and `disabled: false` — LinkedIn did exactly this in the probe
     *  (200, `[]`). Empty means "this platform gives us nothing", not "zero". */
    series: z.array(metricSeriesSchema).default([]),
    /** Set when THIS channel failed while others succeeded. Partial success is
     *  a first-class outcome: one bad channel must not blank the rest. */
    error: z.string().nullable().default(null),
  })
  .strict()
export type AnalyticsChannel = z.infer<typeof analyticsChannelSchema>

/** Lifecycle state Postiz reports for a post, lowercased at the boundary. */
export const REMOTE_POST_STATES = ['published', 'queued', 'error', 'draft', 'unknown'] as const

/**
 * One post as Postiz sees it, joined back to our post where we can.
 *
 * `metrics` is present, optional, and in practice ALWAYS EMPTY as of GF-113.
 * TASK-018 (decided 2026-08-24): `GET /analytics/post/{id}` returns `200 []` for
 * every published post at every window, so per-post metrics are not buildable
 * from Postiz and the Meta Graph route is folded into GF-21. The field stays so
 * that when GF-21 lands a source the ledger gains columns without a rebuild —
 * it is a prop with a default, NOT a dormant pipeline. Do not populate it with
 * zeros: an absent metric means "unknown", and rendering 0 would re-introduce
 * exactly the fabricated numbers this item removes.
 */
export const analyticsPostSchema = z
  .object({
    /** Our canonical post id, when the join succeeded. */
    postId: z.string().nullable().default(null),
    /** Postiz's own post id (our `publishing.providerJobId`). */
    remoteId: z.string(),
    integrationId: z.string().nullable().default(null),
    /** Platform this went out on, as Postiz reports it. */
    channel: z.string().nullable().default(null),
    state: z.enum(REMOTE_POST_STATES),
    publishDate: z.string().nullable().default(null),
    /** The REAL public permalink (e.g. instagram.com/p/DZ-Q8yzmuMl). Verified
     *  working in the probe — this link-out is the main payoff of the ledger. */
    releaseURL: z.string().nullable().default(null),
    metrics: z.array(metricSeriesSchema).default([]),
  })
  .strict()
export type AnalyticsPost = z.infer<typeof analyticsPostSchema>

export const clientAnalyticsSchema = z
  .object({
    /** Which adapter produced this ("postiz"). GF-21 may add a second. */
    provider: z.string(),
    status: z.enum(ANALYTICS_STATUSES),
    /** ISO timestamp written EXPLICITLY by the sync worker. PocketBase does not
     *  auto-populate `created` in this deployment — see the platform gotchas. */
    syncedAt: z.string().nullable().default(null),
    /** Human-readable failure detail for `stale` / `error`. Never a secret. */
    error: z.string().nullable().default(null),
    channels: z.array(analyticsChannelSchema).default([]),
    posts: z.array(analyticsPostSchema).default([]),
    /** Posts of OURS that carry no `providerJobId`, i.e. never actually reached
     *  Postiz. Counted so the tab can say "3 posts were never scheduled through
     *  Postiz" instead of quietly under-reporting. Expect this to be large while
     *  GF-26's payload bug is unfixed. */
    unlinked: z.number().default(0),
  })
  .strict()
export type ClientAnalytics = z.infer<typeof clientAnalyticsSchema>

/** A well-formed empty payload. The read route returns THIS, never `{}` and
 *  never a 404 — the legacy `/performance` route's `?? {}` is precisely why the
 *  SPA cannot today tell "not configured" from "no data". */
export function emptyAnalytics(
  status: AnalyticsStatus,
  opts: { provider?: string; error?: string | null } = {},
): ClientAnalytics {
  return {
    provider: opts.provider ?? 'postiz',
    status,
    syncedAt: null,
    error: opts.error ?? null,
    channels: [],
    posts: [],
    unlinked: 0,
  }
}

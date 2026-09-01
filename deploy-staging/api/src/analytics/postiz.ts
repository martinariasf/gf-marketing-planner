// GF-113 — Postiz adapter for the analytics port (read side).
//
// Sibling of `scheduling/postiz.ts` (the write side). The API key is decrypted by
// `loadPostizApiKey()` from that module — NOT re-implemented here — so there is
// exactly one decryption path to audit.
//
// EVERY parsing decision below is grounded in the TASK-001 probe against live
// Postiz Cloud (2026-08-24). Where the probe and docs.postiz.com disagree, the
// probe wins and the disagreement is marked. GF-26 shipped a broken payload by
// trusting these docs; this module does not repeat that.

import {
  AnalyticsError,
  type AnalyticsProvider,
  type RemotePost,
} from './provider.js'
import type { AnalyticsChannel, MetricSeries } from '../schemas/analytics.js'

const PROVIDER = 'postiz'

/** Same resolution as the scheduling adapter, deliberately duplicated as a
 *  one-liner rather than exported across modules: both read the same env var and
 *  a shared mutable export would let one side's trailing-slash fix surprise the
 *  other. */
const POSTIZ_API_BASE = (process.env.POSTIZ_API_BASE ?? 'https://api.postiz.com/public/v1').replace(
  /\/+$/,
  '',
)

/** GET against the Postiz public API. Mirrors `scheduling/postiz.ts`'s error
 *  handling, including the body slice in the message — that slice is what made
 *  the probe's 500-vs-400 discrepancy visible instead of opaque. */
async function postizGet(apiKey: string, path: string): Promise<unknown> {
  const url = `${POSTIZ_API_BASE}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      // Postiz public API authenticates with the RAW key in Authorization —
      // no `Bearer` prefix. Verified in the probe.
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    throw new AnalyticsError(PROVIDER, `Could not reach Postiz (${url}).`, { cause: err })
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      /* ignore */
    }
    throw new AnalyticsError(
      PROVIDER,
      `Postiz returned ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}.`,
      { status: res.status },
    )
  }
  return res.json().catch(() => null)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/**
 * Turn one Postiz analytics entry into our `MetricSeries`.
 *
 * PROBE CORRECTION: `total` is a NUMBER, not the string the docs show. We accept
 * both and coerce, because a provider that already lied about this type once may
 * change it back, and a NaN silently becoming 0 would be a fabricated number.
 * Unparseable points are DROPPED rather than zeroed.
 *
 * The `kind` split is measured, not guessed: Reach arrived with 29 daily points,
 * while Likes/Views/Comments/Shares/Saves/Replies each arrived as a single point
 * dated today. One point means a window total, and the UI must not plot it as a
 * trend.
 */
export function toMetricSeries(entry: unknown): MetricSeries | null {
  if (!entry || typeof entry !== 'object') return null
  const rec = entry as Record<string, unknown>
  const label = str(rec.label)
  if (!label) return null

  const rawPoints = Array.isArray(rec.data) ? rec.data : []
  const points: { date: string; total: number }[] = []
  for (const p of rawPoints) {
    if (!p || typeof p !== 'object') continue
    const pr = p as Record<string, unknown>
    const date = str(pr.date)
    const total = typeof pr.total === 'number' ? pr.total : Number(pr.total)
    if (!date || !Number.isFinite(total)) continue
    points.push({ date, total })
  }

  // NOTE: `percentageChange` is read and discarded on purpose. It was exactly `5`
  // on all seven Instagram labels in the probe — a placeholder, not a delta.
  return { label, kind: points.length > 1 ? 'series' : 'snapshot', points }
}

/** Map Postiz's post state to our enum. Postiz uses QUEUE/PUBLISHED/ERROR/DRAFT. */
export function toRemoteState(raw: string): 'published' | 'queued' | 'error' | 'draft' | 'unknown' {
  switch (raw.trim().toLowerCase()) {
    case 'published':
    case 'released':
      return 'published'
    case 'queue':
    case 'queued':
    case 'scheduled':
      return 'queued'
    case 'error':
    case 'failed':
      return 'error'
    case 'draft':
      return 'draft'
    default:
      return 'unknown'
  }
}

export class PostizAnalyticsProvider implements AnalyticsProvider {
  readonly name = PROVIDER
  readonly #apiKey: string

  constructor(apiKey: string) {
    this.#apiKey = apiKey
  }

  async listChannels(): Promise<AnalyticsChannel[]> {
    const data = await postizGet(this.#apiKey, '/integrations')
    // The probe returned a bare array here (unlike /posts, which is wrapped).
    // Accept the wrapped form too rather than betting on one shape.
    const list = Array.isArray(data)
      ? data
      : Array.isArray((data as Record<string, unknown> | null)?.integrations)
        ? ((data as Record<string, unknown>).integrations as unknown[])
        : []
    const channels: AnalyticsChannel[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const id = str(rec.id)
      if (!id) continue
      channels.push({
        id,
        // PROBE: Instagram reports `instagram-standalone`, NOT `instagram`.
        // Stored verbatim — normalising it here would hide the GF-26 mismatch.
        identifier: str(rec.identifier) ?? 'unknown',
        name: str(rec.name) ?? id,
        profile: str(rec.profile),
        picture: str(rec.picture),
        disabled: rec.disabled === true,
        series: [],
        error: null,
      })
    }
    return channels
  }

  async channelSeries(channelId: string, days: number): Promise<MetricSeries[]> {
    const data = await postizGet(
      this.#apiKey,
      `/analytics/${encodeURIComponent(channelId)}?date=${encodeURIComponent(String(days))}`,
    )
    // An enabled channel with no platform coverage returns `200 []` (LinkedIn did).
    if (!Array.isArray(data)) return []
    return data.map(toMetricSeries).filter((s): s is MetricSeries => s !== null)
  }

  async postSeries(postId: string, days: number): Promise<MetricSeries[]> {
    // DELIBERATELY UNUSED as of GF-113 — see the port docs and TASK-018. Kept
    // callable so a future spike can re-test cheaply without rewriting the
    // adapter, but the sync worker must not call it: the probe proved it returns
    // an empty array for every published post, so each call is a wasted request
    // against a quota we cannot measure.
    const data = await postizGet(
      this.#apiKey,
      `/analytics/post/${encodeURIComponent(postId)}?date=${encodeURIComponent(String(days))}`,
    )
    if (!Array.isArray(data)) return []
    return data.map(toMetricSeries).filter((s): s is MetricSeries => s !== null)
  }

  async listRemotePosts(startDate: string, endDate: string): Promise<RemotePost[]> {
    const data = await postizGet(
      this.#apiKey,
      `/posts?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    )
    // PROBE CORRECTION: the response is `{ posts: [...] }`, NOT a bare array as
    // the docs show. Unwrapped HERE, at the adapter boundary, so no envelope ever
    // reaches the SPA.
    const list = Array.isArray((data as Record<string, unknown> | null)?.posts)
      ? ((data as Record<string, unknown>).posts as unknown[])
      : Array.isArray(data)
        ? data
        : []
    const posts: RemotePost[] = []
    for (const item of list) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const id = str(rec.id)
      if (!id) continue
      const integration =
        rec.integration && typeof rec.integration === 'object'
          ? (rec.integration as Record<string, unknown>)
          : null
      posts.push({
        id,
        integrationId: integration ? str(integration.id) : null,
        channel: integration ? str(integration.providerIdentifier) : null,
        state: String(rec.state ?? '').toLowerCase(),
        publishDate: str(rec.publishDate),
        releaseURL: str(rec.releaseURL),
      })
    }
    return posts
  }
}

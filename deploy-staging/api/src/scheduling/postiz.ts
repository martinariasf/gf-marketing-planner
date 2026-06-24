// GF-26 / GF-14 — Postiz adapter for the scheduling port.
//
// Implements SchedulingProvider against the Postiz PUBLIC API
// (https://docs.postiz.com — `/public/v1/posts`). The per-client API key is the
// SAME secret the dashboard saves under Integrations (GF-11): it is stored
// encrypted in PocketBase and decrypted server-side here. The model never sees
// it; only this server-side adapter does.
//
// IMPORTANT (TASK-014): on any failure this throws SchedulingError. The caller
// must NOT mark the post Programmed when that happens — a scheduled post means a
// real Postiz job exists.

import { withPb } from '../pb.js'
import { decryptSecret } from '../secrets.js'
import {
  SchedulingError,
  type JobStatus,
  type SchedulablePost,
  type ScheduleResult,
  type SchedulingProvider,
} from './provider.js'

const PROVIDER = 'postiz'

// Postiz Cloud default. A self-hosted Postiz can override via env without any
// code change. The public API is mounted under /public/v1.
const POSTIZ_API_BASE = (process.env.POSTIZ_API_BASE ?? 'https://api.postiz.com/public/v1').replace(
  /\/+$/,
  '',
)

type IntegrationSecretRec = { id: string; postizApiKeyEnc?: string }

/** Decrypt the per-client Postiz API key, or null if none is configured. */
export async function loadPostizApiKey(slug: string): Promise<string | null> {
  let rec: IntegrationSecretRec | null = null
  try {
    rec = await withPb((pb) =>
      pb
        .collection('integration_secrets')
        .getFirstListItem<IntegrationSecretRec>(`slug="${slug}"`),
    )
  } catch {
    return null
  }
  if (!rec?.postizApiKeyEnc) return null
  return decryptSecret(rec.postizApiKeyEnc)
}

async function postizFetch(
  apiKey: string,
  path: string,
  init: { method: string; body?: unknown },
): Promise<Response> {
  const url = `${POSTIZ_API_BASE}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        // Postiz public API authenticates with the raw key in Authorization.
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
  } catch (err) {
    throw new SchedulingError(PROVIDER, `Could not reach Postiz (${url}).`, err)
  }
  if (!res.ok) {
    let detail = ''
    try {
      detail = await res.text()
    } catch {
      /* ignore */
    }
    throw new SchedulingError(
      PROVIDER,
      `Postiz returned ${res.status} ${res.statusText}${detail ? `: ${detail.slice(0, 300)}` : ''}.`,
    )
  }
  return res
}

/** Build the Postiz post payload from our canonical post + a publish time. */
function toPostizPayload(post: SchedulablePost, when: string): Record<string, unknown> {
  const content = [post.title, post.copy].filter(Boolean).join('\n\n').trim()
  const media = (post.mediaUrls ?? (post.image ? [post.image] : [])).filter(
    (u): u is string => typeof u === 'string' && u.length > 0,
  )
  return {
    type: 'scheduled',
    // Postiz expects an ISO date for the publish time.
    date: new Date(when).toISOString(),
    // The dashboard/agent has already chosen channels; pass them through so the
    // operator's connected Postiz integrations fan out correctly.
    channels: post.channels ?? (post.channel ? [post.channel] : []),
    content,
    media,
  }
}

export class PostizProvider implements SchedulingProvider {
  readonly name = PROVIDER
  readonly #apiKey: string

  constructor(apiKey: string) {
    this.#apiKey = apiKey
  }

  async schedule(post: SchedulablePost, when: string): Promise<ScheduleResult> {
    const res = await postizFetch(this.#apiKey, '/posts', {
      method: 'POST',
      body: toPostizPayload(post, when),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    const jobId = extractJobId(data)
    if (!jobId) {
      throw new SchedulingError(PROVIDER, 'Postiz accepted the post but returned no job id.')
    }
    return { jobId, scheduledFor: new Date(when).toISOString() }
  }

  async reschedule(jobId: string, when: string, post: SchedulablePost): Promise<ScheduleResult> {
    // Postiz updates a scheduled post by id with the new date/payload.
    await postizFetch(this.#apiKey, `/posts/${encodeURIComponent(jobId)}`, {
      method: 'PUT',
      body: toPostizPayload(post, when),
    })
    return { jobId, scheduledFor: new Date(when).toISOString() }
  }

  async cancel(jobId: string): Promise<void> {
    try {
      await postizFetch(this.#apiKey, `/posts/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
    } catch (err) {
      // A 404 means the job is already gone — that's the desired end state, so
      // cancel stays idempotent. Re-throw anything else.
      if (err instanceof SchedulingError && /\b404\b/.test(err.message)) return
      throw err
    }
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const res = await postizFetch(this.#apiKey, `/posts/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return normalizeStatus(data)
  }
}

/** Pull the post id out of Postiz's create/list response (id | postId | _id). */
function extractJobId(data: Record<string, unknown>): string | null {
  for (const key of ['id', 'postId', '_id']) {
    const v = data[key]
    if (typeof v === 'string' && v) return v
    if (typeof v === 'number') return String(v)
  }
  // Some Postiz responses wrap the created post(s) in an array.
  const list = (data.posts ?? data.data) as unknown
  if (Array.isArray(list) && list[0] && typeof list[0] === 'object') {
    return extractJobId(list[0] as Record<string, unknown>)
  }
  return null
}

/** Map a Postiz post record to our normalized JobStatus. */
function normalizeStatus(data: Record<string, unknown>): JobStatus {
  const state = String(data.state ?? data.status ?? '').toLowerCase()
  const publicUrl =
    (typeof data.releaseURL === 'string' && data.releaseURL) ||
    (typeof data.publicUrl === 'string' && data.publicUrl) ||
    (typeof data.url === 'string' && data.url) ||
    null
  const publishedAt =
    (typeof data.publishedAt === 'string' && data.publishedAt) ||
    (typeof data.releasedAt === 'string' && data.releasedAt) ||
    null
  if (state === 'published' || state === 'released' || publishedAt || publicUrl) {
    return { state: 'published', publishedAt: publishedAt ?? new Date().toISOString(), publicUrl }
  }
  if (state === 'error' || state === 'failed') return { state: 'failed', detail: 'Postiz reported the post failed.' }
  if (state === 'queue' || state === 'scheduled' || state === 'draft') return { state: 'scheduled' }
  return { state: 'unknown' }
}

// GF-26 / GF-36 / GF-37 — bridge between a post status change and the
// scheduling port. The route handlers call these; the SDK is never touched
// directly from a route.
//
// Two responsibilities:
//   1. applyStatusToSchedule() — when a post moves to/away from "scheduled",
//      create / move / cancel a REAL provider job and return the `publishing`
//      patch to persist. Throws on failure so the caller does NOT mark the post
//      Programmed (TASK-014). Blocks past-dated scheduling (TASK-016).
//   2. refreshPublishStatus() — poll the provider for a scheduled post and, when
//      it reports the post live, return the published transition (TASK-015).

import {
  getSchedulingProvider,
  SchedulingError,
  type SchedulablePost,
} from './index.js'

const SCHEDULED = 'scheduled'
const PUBLISHED = 'published'

/** Result the route applies: a `publishing` sub-object + an optional status
 *  override (e.g. force `published` once the provider reports it live). */
export interface ScheduleSyncResult {
  publishing: Record<string, unknown>
  status?: string
}

/** Raised when a status change is rejected for a business reason (maps to 4xx).
 *  Distinct from SchedulingError (backend failure) so the route can pick the
 *  right HTTP status, but both carry a clear, agent-readable message. */
export class ScheduleRejected extends Error {
  readonly status: 422 | 409
  constructor(message: string, status: 422 | 409 = 422) {
    super(message)
    this.name = 'ScheduleRejected'
    this.status = status
  }
}

function toSchedulable(slug: string, post: Record<string, unknown>): SchedulablePost {
  const channels = Array.isArray(post.channels)
    ? (post.channels as unknown[]).filter((c): c is string => typeof c === 'string')
    : undefined
  const mediaUrls: string[] = []
  if (typeof post.image === 'string' && post.image) mediaUrls.push(post.image)
  if (Array.isArray(post.media)) {
    for (const m of post.media as Array<Record<string, unknown>>) {
      if (m && typeof m.url === 'string' && m.url) mediaUrls.push(m.url)
    }
  }
  return {
    id: String(post.id ?? ''),
    slug,
    title: typeof post.title === 'string' ? post.title : undefined,
    copy: typeof post.copy === 'string' ? post.copy : undefined,
    channel: typeof post.channel === 'string' ? post.channel : undefined,
    channels,
    image: typeof post.image === 'string' ? post.image : undefined,
    mediaUrls,
  }
}

function existingPublishing(post: Record<string, unknown>): Record<string, unknown> {
  const pub = post.publishing
  return pub && typeof pub === 'object' ? { ...(pub as Record<string, unknown>) } : {}
}

function existingJobId(post: Record<string, unknown>): string | null {
  const pub = existingPublishing(post)
  const generic = typeof pub.providerJobId === 'string' ? pub.providerJobId : null
  const legacy = typeof pub.postizJobId === 'string' ? pub.postizJobId : null
  return generic ?? legacy
}

/**
 * React to a status transition by driving the scheduling provider.
 *
 * @param slug        client slug
 * @param current     the post AS IT IS NOW (canonical, coalesced)
 * @param nextStatus  the status the caller is trying to set, if any
 * @returns           a `publishing` patch to merge, or null if no scheduling
 *                    side-effect applies to this transition.
 * @throws ScheduleRejected on a business rule (past date, no provider)
 * @throws SchedulingError  on a backend failure (Postiz unreachable / rejected)
 */
export async function applyStatusToSchedule(
  slug: string,
  current: Record<string, unknown>,
  nextStatus: string | undefined,
): Promise<ScheduleSyncResult | null> {
  const prevStatus = String(current.status ?? '')
  // A post is "going to be scheduled" if it's being moved into the lane, or it's
  // already in the lane and we're re-driving it (e.g. a date change = reschedule).
  const willBeScheduled = nextStatus === SCHEDULED || (nextStatus === undefined && prevStatus === SCHEDULED)
  const movingIn = willBeScheduled
  const movingOut = prevStatus === SCHEDULED && nextStatus !== undefined && nextStatus !== SCHEDULED

  if (movingIn) {
    // TASK-016 — never schedule a post whose date is in the past.
    const when = typeof current.date === 'string' ? current.date : ''
    const ts = when ? new Date(when).getTime() : NaN
    if (!when || Number.isNaN(ts)) {
      throw new ScheduleRejected(
        'Cannot schedule a post without a valid `date`. Set an ISO date in the future, then try again.',
      )
    }
    if (ts <= Date.now()) {
      throw new ScheduleRejected(
        `Cannot schedule a post dated in the past (${when}). Reschedule it to a future date, then move it to Programmed.`,
      )
    }

    const provider = await getSchedulingProvider(slug)
    if (!provider) {
      throw new ScheduleRejected(
        'No scheduling provider is configured for this client. Add a Postiz API key under Integrations, then try again.',
      )
    }

    const schedulable = toSchedulable(slug, current)
    const priorJob = existingJobId(current)
    // Re-schedule an existing job in place rather than creating a duplicate.
    const result = priorJob
      ? await provider.reschedule(priorJob, when, schedulable)
      : await provider.schedule(schedulable, when)

    return {
      // TASK-015: a successful send IS the Approved -> scheduled transition.
      status: SCHEDULED,
      publishing: {
        ...existingPublishing(current),
        provider: provider.name,
        providerJobId: result.jobId,
        postizJobId: result.jobId, // backward-compatible alias
        scheduledFor: result.scheduledFor,
        lastError: null,
      },
    }
  }

  if (movingOut) {
    // Leaving the scheduled lane cancels the live job so we never publish a post
    // the operator has pulled back. A missing job is not an error.
    const priorJob = existingJobId(current)
    if (priorJob) {
      const provider = await getSchedulingProvider(slug)
      if (provider) await provider.cancel(priorJob)
    }
    return {
      publishing: {
        ...existingPublishing(current),
        providerJobId: null,
        postizJobId: null,
        scheduledFor: null,
      },
    }
  }

  return null
}

/**
 * TASK-015 — for a scheduled post with a live job, ask the provider whether it
 * has gone live and, if so, return the `published` transition (filling
 * publishedAt + publicUrl, which drive the Published lane and the post link).
 * Returns null when there is nothing to update. Never throws: a status check
 * failure must not break a read — it just leaves the post Programmed.
 */
export async function refreshPublishStatus(
  slug: string,
  post: Record<string, unknown>,
): Promise<ScheduleSyncResult | null> {
  if (String(post.status ?? '') !== SCHEDULED) return null
  const jobId = existingJobId(post)
  if (!jobId) return null
  try {
    const provider = await getSchedulingProvider(slug)
    if (!provider) return null
    const status = await provider.getStatus(jobId)
    if (status.state === 'published') {
      return {
        status: PUBLISHED,
        publishing: {
          ...existingPublishing(post),
          provider: provider.name,
          providerJobId: jobId,
          postizJobId: jobId,
          publishedAt: status.publishedAt ?? new Date().toISOString(),
          publicUrl: status.publicUrl ?? null,
          lastError: null,
        },
      }
    }
    if (status.state === 'failed') {
      return {
        publishing: {
          ...existingPublishing(post),
          lastError: status.detail ?? 'The scheduling provider reported the post failed.',
        },
      }
    }
  } catch (err) {
    // Swallow — a transient provider error must not break the read path.
    if (!(err instanceof SchedulingError)) throw err
  }
  return null
}

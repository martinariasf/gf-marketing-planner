// GF-26 — provider-agnostic scheduling port.
//
// WHY THIS EXISTS: moving a post to "scheduled"/Programmed used to mean "the
// agent will eventually run the `postiz` CLI". The dashboard could flip a post
// to Programmed even though nothing was ever scheduled with a real backend, so
// the calendar lied. This port makes the API itself responsible for creating a
// REAL scheduled job through whatever provider the client is configured for,
// and surfaces failures instead of silently marking a post Programmed.
//
// The port is deliberately tiny and backend-neutral: a `SchedulingProvider`
// knows how to schedule a post for a time, move that schedule, cancel it, and
// report status. Postiz is the first adapter (see postiz.ts); a future provider
// (Buffer, native cron, n8n) only has to implement this interface — no route
// code changes.

/** A post in the shape the scheduler needs. Kept loose on purpose: different
 *  providers care about different fields, and the canonical post is a
 *  Record<string, unknown> elsewhere. */
export interface SchedulablePost {
  id: string
  /** Client slug — providers are per-client (own credentials, own accounts). */
  slug: string
  title?: string
  /** Post body / caption. */
  copy?: string
  /** Primary channel and (GF-20) the full multi-channel set. */
  channel?: string
  channels?: string[]
  /** Cover image (absolute URL). */
  image?: string
  /** Carousel / multi-media URLs, if any. */
  mediaUrls?: string[]
  /** Whatever else the canonical post carries — providers ignore unknown keys. */
  [k: string]: unknown
}

/** Result of asking a provider to (re)schedule a post. */
export interface ScheduleResult {
  /** The provider's own id for the created job — stored as providerJobId. */
  jobId: string
  /** Echo of the time the job is scheduled for (ISO). */
  scheduledFor: string
}

/** Lifecycle state of a scheduled job, normalized across providers. */
export type JobState = 'scheduled' | 'published' | 'failed' | 'cancelled' | 'unknown'

export interface JobStatus {
  state: JobState
  /** Set once the provider reports the post went live. */
  publishedAt?: string | null
  /** Public permalink to the live post, when the provider exposes one. */
  publicUrl?: string | null
  /** Human-readable detail for a failed/unknown job. */
  detail?: string | null
}

/**
 * A scheduling backend. Implementations talk to a real external service and
 * MUST throw on failure (never return a fake success) so the caller can keep
 * the post out of the Programmed lane and surface the error.
 */
export interface SchedulingProvider {
  /** Stable provider name, stored on the post (e.g. "postiz"). */
  readonly name: string
  /** Create a scheduled job to publish `post` at `when` (ISO). */
  schedule(post: SchedulablePost, when: string): Promise<ScheduleResult>
  /** Move an existing job to a new time. */
  reschedule(jobId: string, when: string, post: SchedulablePost): Promise<ScheduleResult>
  /** Cancel/delete an existing job. Idempotent: a missing job is not an error. */
  cancel(jobId: string): Promise<void>
  /** Report the current lifecycle state of a job (drives published/publicUrl). */
  getStatus(jobId: string): Promise<JobStatus>
}

/** Thrown by adapters when the backend rejects or is unreachable. Carries an
 *  agent/dashboard-readable message that the route turns into a 4xx/5xx. */
export class SchedulingError extends Error {
  readonly provider: string
  override readonly cause?: unknown
  constructor(provider: string, message: string, cause?: unknown) {
    super(message)
    this.name = 'SchedulingError'
    this.provider = provider
    this.cause = cause
  }
}

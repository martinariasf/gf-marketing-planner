// Write-validation schemas for Viktor-owned resources.
//
// WHY THIS EXISTS: in June 2026 the agent created/patched a post with the wrong
// shape (e.g. a missing `date`/`status`, or a mistyped field name like
// `imageUrl`). The dashboard renders posts assuming the `Post` contract holds,
// so a bad write white-screened the whole calendar/approvals page.
//
// These zod schemas reject malformed writes at the API boundary with a 422 and
// an AGENT-READABLE `detail` (so the agent can fix the one bad field and retry),
// and `coalescePost()` repairs already-stored partial rows on the way out so
// legacy junk can't crash the UI either. Strict (`.strict()`) on unknown keys so
// a typo'd field name surfaces as an error instead of silently doing nothing.

import { z } from 'zod'

export const POST_STATUSES = [
  'idea',
  'drafting',
  'in_review',
  'needs_revision',
  'approved',
  'scheduled',
  'published',
  'rejected',
] as const

export const CHANNELS = ['instagram', 'linkedin', 'tiktok', 'x', 'facebook'] as const

export const APPROVAL_DECISIONS = ['in_review', 'approved', 'scheduled', 'rejected'] as const

// Accept either a full ISO datetime or a plain calendar date (YYYY-MM-DD) — both
// appear in the agent's and the dashboard's writes. Reject anything Date can't parse.
const dateLike = z
  .string()
  .min(1, 'must not be empty')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: 'must be an ISO date like 2026-06-15 or 2026-06-15T09:00:00Z',
  })

// Sub-objects are validated loosely (passthrough) — the agent rarely sets them,
// and reads coalesce them. We only care that, if present, they're objects.
const approvalShape = z
  .object({
    status: z.enum(POST_STATUSES).optional(),
    approvedBy: z.string().nullable().optional(),
    approvedAt: z.string().nullable().optional(),
    version: z.number().optional(),
    blockerReason: z.string().nullable().optional(),
  })
  .passthrough()

const publishingShape = z
  .object({
    postizJobId: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    publicUrl: z.string().nullable().optional(),
  })
  .passthrough()

// All KNOWN post fields. `.strict()` then rejects anything else (typos).
const postFields = {
  id: z.string().min(1).optional(),
  date: dateLike,
  channel: z.enum(CHANNELS).optional(),
  format: z.string().optional(),
  pillar: z.string().optional(),
  campaign: z.string().optional(),
  title: z.string().min(1, 'must not be empty'),
  image: z.string().optional(),
  copy: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  cta: z.string().optional(),
  status: z.enum(POST_STATUSES).optional(),
  approval: approvalShape.optional(),
  publishing: publishingShape.optional(),
}

// CREATE: `date` + `title` are the genuinely essential fields (calendar bucketing
// + the post heading). Everything else is optional and coalesced on read.
export const postCreateSchema = z.object(postFields).strict()

// PATCH: any subset of the same fields; nothing required, but each present field
// must be the right type, and unknown keys are still rejected.
export const postPatchSchema = z
  .object({ ...postFields, date: dateLike.optional(), title: z.string().min(1).optional() })
  .strict()

export const suggestionPatchSchema = z
  .object({
    status: z.enum(['open', 'accepted', 'dismissed']).optional(),
    priority: z.number().optional(),
    reason: z.string().optional(),
  })
  .strict()

export const approvalCreateSchema = z
  .object({
    postId: z.string().min(1),
    decision: z.enum(APPROVAL_DECISIONS),
    note: z.string().optional(),
  })
  .strict()

/** Flatten a ZodError into a single agent-readable sentence + a structured list. */
export function zodDetail(err: z.ZodError): { detail: string; errors: Array<{ field: string; message: string }> } {
  const errors = err.issues.map((i) => ({
    field: i.path.join('.') || '(root)',
    message: i.message,
  }))
  const detail = errors.map((e) => `\`${e.field}\` ${e.message}`).join('; ')
  return { detail, errors }
}

// ── Read-side repair ─────────────────────────────────────────────────────────

const DEFAULT_APPROVAL = {
  status: 'idea' as (typeof POST_STATUSES)[number],
  approvedBy: null,
  approvedAt: null,
  version: 1,
  blockerReason: null,
}

const DEFAULT_PUBLISHING = {
  postizJobId: null,
  publishedAt: null,
  publicUrl: null,
}

/**
 * Guarantee a complete-enough Post shape for the dashboard, repairing partial or
 * legacy rows so the UI never throws on a missing field. Does NOT invent content
 * — only fills the structural fields the renderer dereferences unconditionally.
 */
export function coalescePost<T extends Record<string, unknown>>(post: T): T {
  const p = { ...post } as Record<string, unknown>
  if (typeof p.status !== 'string') p.status = 'idea'
  if (typeof p.title !== 'string') p.title = ''
  if (typeof p.copy !== 'string') p.copy = ''
  if (typeof p.cta !== 'string') p.cta = ''
  if (typeof p.date !== 'string') p.date = ''
  if (!Array.isArray(p.hashtags)) p.hashtags = []
  if (typeof p.approval !== 'object' || p.approval === null) {
    p.approval = { ...DEFAULT_APPROVAL, status: p.status }
  } else {
    p.approval = { ...DEFAULT_APPROVAL, ...(p.approval as object) }
  }
  if (typeof p.publishing !== 'object' || p.publishing === null) {
    p.publishing = { ...DEFAULT_PUBLISHING }
  } else {
    p.publishing = { ...DEFAULT_PUBLISHING, ...(p.publishing as object) }
  }
  return p as T
}

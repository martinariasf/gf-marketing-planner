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

// GF-23 — the dashboard now drives the full content workflow (not just
// accept/reject), so a status change can move a post into any settable state.
// `published` is intentionally NOT here: it is terminal and derived from the
// Postiz publish result (`publishing.publishedAt`/`publicUrl`), never set by a
// dashboard user.
export const APPROVAL_DECISIONS = [
  'drafting',
  'in_review',
  'approved',
  'scheduled',
  'needs_revision',
  'rejected',
] as const

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

// CAR1 carousel slides. A post becomes a carousel when it has a `slides` array
// (2–10; IG's cap). `image` stays the cover (= slides[0].image). Strict on the
// slide object so a typo'd key (e.g. `url` instead of `image`) 422s instead of
// silently dropping. caption = optional per-slide design-brief, not a body.
const slideShape = z
  .object({
    image: z.string().min(1, 'must be the asset URL returned by the image step'),
    caption: z.string().optional(),
  })
  .strict()

const mediaShape = z
  .object({
    type: z.enum(['image', 'video']),
    url: z.string().min(1, 'must be the public asset URL returned by the generation step'),
    thumbnail: z.string().optional(),
    caption: z.string().optional(),
    assetId: z.string().optional(),
  })
  .strict()

// All KNOWN post fields. `.strict()` then rejects anything else (typos).
const postFields = {
  id: z.string().min(1).optional(),
  date: dateLike,
  channel: z.enum(CHANNELS).optional(),
  // GF-20: a post can target several networks. Additive + optional; `channel`
  // stays the primary (coalescePost keeps it = channels[0]).
  channels: z.array(z.enum(CHANNELS)).max(5).optional(),
  format: z.string().optional(),
  pillar: z.string().optional(),
  campaign: z.string().optional(),
  title: z.string().min(1, 'must not be empty'),
  image: z.string().optional(),
  slides: z.array(slideShape).max(10, 'a carousel can have at most 10 slides').optional(),
  media: z.array(mediaShape).max(20, 'a post can have at most 20 media items').optional(),
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
  // GF-20: keep `channel` (primary) and `channels` (multi) coherent. If a valid
  // channels array is present, the primary is its first entry; otherwise leave
  // the scalar channel as-is. Drop unknown/empty arrays so the strict read shape
  // never carries junk.
  if (Array.isArray(p.channels)) {
    const valid = (p.channels as unknown[]).filter(
      (c): c is string => typeof c === 'string' && (CHANNELS as readonly string[]).includes(c),
    )
    const deduped = Array.from(new Set(valid))
    if (deduped.length > 0) {
      p.channel = deduped[0]
      p.channels = deduped
    } else {
      delete p.channels
    }
  }
  if (typeof p.copy !== 'string') p.copy = ''
  if (typeof p.cta !== 'string') p.cta = ''
  if (typeof p.date !== 'string') p.date = ''
  if (!Array.isArray(p.hashtags)) p.hashtags = []
  // CAR1: if slides are present, keep only well-formed {image, caption?} entries
  // and default the cover `image` to slides[0].image when missing. If absent,
  // leave single-image behaviour untouched.
  if (Array.isArray(p.slides)) {
    const slides = (p.slides as unknown[])
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .filter((s) => typeof s.image === 'string' && s.image.length > 0)
      .map((s) => ({
        image: s.image as string,
        ...(typeof s.caption === 'string' ? { caption: s.caption } : {}),
      }))
    p.slides = slides
    const cover = slides[0]
    if (cover && (typeof p.image !== 'string' || p.image.length === 0)) {
      p.image = cover.image
    }
  }
  if (Array.isArray(p.media)) {
    const media = (p.media as unknown[])
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
      .filter(
        (m) =>
          (m.type === 'image' || m.type === 'video') &&
          typeof m.url === 'string' &&
          m.url.length > 0,
      )
      .map((m) => ({
        type: m.type as 'image' | 'video',
        url: m.url as string,
        ...(typeof m.thumbnail === 'string' && m.thumbnail.length > 0 ? { thumbnail: m.thumbnail } : {}),
        ...(typeof m.caption === 'string' ? { caption: m.caption } : {}),
        ...(typeof m.assetId === 'string' ? { assetId: m.assetId } : {}),
      }))
    if (media.length > 0) p.media = media
    else delete p.media
  }
  // GF-7: a post must always surface a type. The agent's create_post tool may
  // omit `format` (it's optional on write), which left the calendar/chat with a
  // blank post type. Derive a structural default from the shape (carousel when
  // there are multiple slides, otherwise a single image) so every post — and
  // every chat action that quotes it — carries its type.
  if (typeof p.format !== 'string' || p.format.length === 0) {
    p.format = Array.isArray(p.slides) && (p.slides as unknown[]).length > 1 ? 'carousel' : 'single image'
  }
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

// GF-4 — PUBLIC, code-gated side of the Content Creation review link.
//
// Mounted BEFORE the bearer-auth subapps (like assetFiles + authExchange) so an
// external reviewer can use it WITHOUT a dashboard token. The only credential is
// the per-link access code; passing it mints a short-lived in-memory review
// session token (rev_*) that authorizes subsequent comment/decision calls.
//
// Hard rules enforced here (see plans/2026-06-09-gf-4-review-link-spec.md):
//   - Nothing is returned before the code is verified.
//   - Revoked or expired links return a safe error and zero client data.
//   - Only sanitizePost() output is ever exposed — never brief/plan/goals/etc.
//   - A reviewer "approve"/"request changes" is recorded as a signal event +
//     comment. It NEVER writes approvals_v2 or mutates a post.

import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import { withPb } from '../pb.js'
import { problem } from '../problem.js'
import { listPostsInRange } from '../posts.js'
import {
  verifyCode,
  linkState,
  sanitizePost,
  createReviewSession,
  getReviewSession,
  type ReviewLinkRecord,
  type ReviewSession,
} from '../reviewLib.js'

const PUBLIC_ID_RE = /^[A-Za-z0-9_-]{16,64}$/

const openSchema = z.object({
  code: z.string().min(1).max(32),
  name: z.string().max(120).optional(),
})
const commentSchema = z.object({
  body: z.string().min(1).max(20_000),
  postId: z.string().max(100).optional(),
  name: z.string().max(120).optional(),
})
const decisionSchema = z.object({
  decision: z.enum(['approved', 'changes_requested']),
  note: z.string().max(20_000).optional(),
  name: z.string().max(120).optional(),
})

async function findLink(publicId: string): Promise<ReviewLinkRecord | null> {
  try {
    return await withPb((pb) =>
      pb.collection('review_links').getFirstListItem<ReviewLinkRecord>(`publicId="${publicId}"`),
    )
  } catch {
    return null
  }
}

/** A generic gate error that never reveals whether the link or the code was wrong. */
function deny(c: Context) {
  return problem(c, {
    title: 'Forbidden',
    status: 403,
    detail: 'This review link is unavailable, or the access code is incorrect.',
  })
}

/** Sanitized, reviewer-safe payload for a link's shared content + comments. */
async function buildReviewPayload(link: ReviewLinkRecord) {
  const posts = (await listPostsInRange(link.slug, link.rangeStart, link.rangeEnd)).map((p) =>
    sanitizePost(p as Record<string, unknown>),
  )
  let comments: Array<Record<string, unknown>> = []
  try {
    const rows = await withPb((pb) =>
      pb
        .collection('review_comments')
        .getFullList<Record<string, unknown>>({ filter: `linkId="${link.id}"`, sort: 'createdAt' }),
    )
    // Only fields safe for the reviewer to see (no internal ids beyond the row id).
    comments = rows.map((r) => ({
      id: r.id,
      postId: r.postId ?? '',
      reviewerName: r.reviewerName ?? '',
      body: r.body ?? '',
      status: r.status ?? 'open',
      source: r.source ?? 'reviewer',
      createdAt: r.createdAt ?? '',
    }))
  } catch {
    comments = []
  }
  return {
    link: {
      title: link.title ?? '',
      rangeStart: link.rangeStart,
      rangeEnd: link.rangeEnd,
    },
    posts,
    comments,
  }
}

async function recordEvent(args: {
  slug: string
  linkId: string
  postId?: string
  kind: 'comment' | 'approved' | 'changes_requested'
  reviewerName: string
  preview: string
}): Promise<void> {
  try {
    await withPb((pb) =>
      pb.collection('review_events').create({
        slug: args.slug,
        linkId: args.linkId,
        postId: args.postId ?? '',
        kind: args.kind,
        reviewerName: args.reviewerName,
        preview: args.preview.slice(0, 300),
        read: false,
        createdAt: new Date().toISOString(),
      }),
    )
  } catch (err) {
    // Activity logging must not break the reviewer's action.
    console.error('[reviewPublic] event write failed', err)
  }
}

export const reviewPublic = new OpenAPIHono()

// Open a link with a code → mint a review session and return the shared content.
reviewPublic.post('/review/:publicId/open', async (c) => {
  const publicId = c.req.param('publicId')
  if (!PUBLIC_ID_RE.test(publicId)) return deny(c)
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }
  const parsed = openSchema.safeParse(raw)
  if (!parsed.success) return problem(c, { title: 'Unprocessable Entity', status: 422, detail: 'A code is required.' })

  const link = await findLink(publicId)
  if (!link) return deny(c)
  if (linkState(link) !== 'active') return deny(c)
  if (!verifyCode(link.publicId, parsed.data.code, link.codeHash)) return deny(c)

  const reviewerName = (parsed.data.name ?? '').trim() || 'Guest reviewer'
  const session = createReviewSession({ linkId: link.id, publicId, slug: link.slug, reviewerName })
  const payload = await buildReviewPayload(link)
  return c.json({
    token: session.token,
    expiresAt: new Date(session.expiresAt).toISOString(),
    reviewerName,
    canApprove: true,
    ...payload,
  })
})

// Middleware: resolve the rev_* session from the Authorization header and pin it
// to the path publicId. Anything else is denied.
async function withSession(
  c: Context,
): Promise<{ session: ReviewSession; link: ReviewLinkRecord } | null> {
  const publicId = c.req.param('publicId') ?? ''
  if (!PUBLIC_ID_RE.test(publicId)) return null
  const header = c.req.header('Authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/)
  const session = getReviewSession(match?.[1]?.trim())
  if (!session || session.publicId !== publicId) return null
  const link = await findLink(publicId)
  if (!link || linkState(link) !== 'active') return null
  return { session, link }
}

// Refresh the shared content (used for polling new dashboard replies).
reviewPublic.get('/review/:publicId', async (c) => {
  const ctx = await withSession(c)
  if (!ctx) return deny(c)
  const payload = await buildReviewPayload(ctx.link)
  return c.json({ reviewerName: ctx.session.reviewerName, canApprove: true, ...payload })
})

// Reviewer posts a comment.
reviewPublic.post('/review/:publicId/comments', async (c) => {
  const ctx = await withSession(c)
  if (!ctx) return deny(c)
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }
  const parsed = commentSchema.safeParse(raw)
  if (!parsed.success) {
    return problem(c, { title: 'Unprocessable Entity', status: 422, detail: parsed.error.issues.map((i) => i.message).join('; ') })
  }
  const reviewerName = (parsed.data.name ?? '').trim() || ctx.session.reviewerName
  const created = await withPb((pb) =>
    pb.collection('review_comments').create<Record<string, unknown>>({
      linkId: ctx.link.id,
      slug: ctx.link.slug,
      postId: parsed.data.postId ?? '',
      reviewerName,
      body: parsed.data.body,
      status: 'open',
      source: 'reviewer',
      createdAt: new Date().toISOString(),
    }),
  )
  await recordEvent({
    slug: ctx.link.slug,
    linkId: ctx.link.id,
    postId: parsed.data.postId,
    kind: 'comment',
    reviewerName,
    preview: parsed.data.body,
  })
  return c.json(
    {
      id: created.id,
      postId: created.postId ?? '',
      reviewerName,
      body: parsed.data.body,
      status: 'open',
      source: 'reviewer',
      createdAt: created.createdAt ?? '',
    },
    201,
  )
})

// Reviewer submits an overall review decision (a SIGNAL, not an internal action).
reviewPublic.post('/review/:publicId/decision', async (c) => {
  const ctx = await withSession(c)
  if (!ctx) return deny(c)
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }
  const parsed = decisionSchema.safeParse(raw)
  if (!parsed.success) {
    return problem(c, { title: 'Unprocessable Entity', status: 422, detail: parsed.error.issues.map((i) => i.message).join('; ') })
  }
  const reviewerName = (parsed.data.name ?? '').trim() || ctx.session.reviewerName
  const decisionWord = parsed.data.decision === 'approved' ? 'approved' : 'requested changes'
  const noteSuffix = parsed.data.note ? `: ${parsed.data.note}` : ''
  const body = `Review decision — ${decisionWord}${noteSuffix}`

  // Record the reviewer's decision as a comment (audit trail for the reviewer)
  // and an event (dashboard awareness). Deliberately does NOT touch approvals_v2
  // or post status — a dashboard user still decides internally.
  await withPb((pb) =>
    pb.collection('review_comments').create({
      linkId: ctx.link.id,
      slug: ctx.link.slug,
      postId: '',
      reviewerName,
      body,
      status: 'open',
      source: 'reviewer',
      createdAt: new Date().toISOString(),
    }),
  )
  await recordEvent({
    slug: ctx.link.slug,
    linkId: ctx.link.id,
    kind: parsed.data.decision,
    reviewerName,
    preview: parsed.data.note ? parsed.data.note : `Reviewer ${decisionWord}`,
  })
  return c.json({ ok: true, decision: parsed.data.decision })
})

// GF-4 — dashboard side of the Content Creation review-link feature.
//
// All routes here are bearer-gated (dash/admin) and client-scoped. They let a
// dashboard user create/list/revoke/rotate protected review links, moderate the
// comments external reviewers leave, and read the review-activity feed.
//
// The PUBLIC, code-gated counterpart (open a link, post reviewer comments /
// decisions) lives in routes/reviewPublic.ts and shares reviewLib.ts.

import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { z } from 'zod'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { audit } from '../audit.js'
import { withPb } from '../pb.js'
import { problem } from '../problem.js'
import {
  generateAccessCode,
  generatePublicId,
  hashCode,
  defaultExpiry,
  linkState,
  DEFAULT_TTL_DAYS,
  type ReviewLinkRecord,
} from '../reviewLib.js'

const MONTH_KEY = z.string().regex(/^\d{4}-\d{2}$/, 'must be a YYYY-MM month key')

const createSchema = z
  .object({
    title: z.string().max(200).optional(),
    rangeStart: MONTH_KEY,
    rangeEnd: MONTH_KEY,
    ttlDays: z.number().int().min(1).max(90).optional(),
  })
  .strict()
  .refine((v) => v.rangeStart <= v.rangeEnd, {
    message: 'rangeStart must be <= rangeEnd',
    path: ['rangeStart'],
  })

const dashCommentSchema = z.object({ body: z.string().min(1).max(20_000), postId: z.string().max(100).optional() }).strict()
const moderateSchema = z.object({ status: z.enum(['open', 'resolved']) }).strict()
const markReadSchema = z
  .object({ ids: z.array(z.string()).optional(), all: z.boolean().optional() })
  .strict()
  .refine((v) => v.all || (v.ids && v.ids.length > 0), { message: 'provide ids[] or all:true' })

function actorOf(c: Context<AppEnv>): string {
  const p = c.get('principal')
  return p.label ?? p.token.slice(0, 12)
}

/** Public-safe projection of a link record — never includes the codeHash. */
function publicLink(rec: ReviewLinkRecord) {
  return {
    id: rec.id,
    publicId: rec.publicId,
    title: rec.title ?? '',
    rangeStart: rec.rangeStart,
    rangeEnd: rec.rangeEnd,
    status: rec.status,
    state: linkState(rec),
    expiresAt: rec.expiresAt ?? null,
    createdBy: rec.createdBy ?? null,
    createdAt: rec.createdAt ?? null,
    revokedAt: rec.revokedAt ?? null,
    reviewPath: `/review/${rec.publicId}`,
  }
}

/** Fetch a link by id and confirm it belongs to the path slug (defends against
 *  an admin token operating on another client's link by id). */
async function getOwnedLink(slug: string, id: string): Promise<ReviewLinkRecord | null> {
  try {
    const rec = await withPb((pb) => pb.collection('review_links').getOne<ReviewLinkRecord>(id))
    if (rec.slug !== slug) return null
    return rec
  } catch {
    return null
  }
}

export const reviewLinks = new OpenAPIHono<AppEnv>()
reviewLinks.use('*', requireAuth)

// ── Create ───────────────────────────────────────────────────────────────────
reviewLinks.post('/clients/:slug/review-links', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }
  const parsed = createSchema.safeParse(raw)
  if (!parsed.success) {
    return problem(c, {
      title: 'Unprocessable Entity',
      status: 422,
      detail: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; '),
    })
  }
  const body = parsed.data
  const publicId = generatePublicId()
  const code = generateAccessCode()
  const now = new Date().toISOString()
  const expiresAt = defaultExpiry()
  const actor = actorOf(c)

  const rec = await withPb((pb) =>
    pb.collection('review_links').create<ReviewLinkRecord>({
      slug,
      publicId,
      title: body.title ?? '',
      rangeStart: body.rangeStart,
      rangeEnd: body.rangeEnd,
      codeHash: hashCode(publicId, code),
      status: 'active',
      expiresAt: body.ttlDays
        ? new Date(Date.now() + body.ttlDays * 86_400_000).toISOString()
        : expiresAt,
      createdBy: actor,
      createdAt: now,
    }),
  )
  await audit(c.get('principal'), {
    action: 'review_link.create',
    slug,
    resourceId: rec.id,
    after: { publicId, rangeStart: body.rangeStart, rangeEnd: body.rangeEnd, ttlDays: body.ttlDays ?? DEFAULT_TTL_DAYS },
  })
  // The plaintext code is returned exactly once — it is never stored or
  // retrievable again. Rotation issues a fresh one.
  return c.json({ ...publicLink(rec), code }, 201)
})

// ── List ───────────────────────────────────────────────────────────────────
reviewLinks.get('/clients/:slug/review-links', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  let rows: ReviewLinkRecord[] = []
  try {
    rows = await withPb((pb) =>
      // NB: review_links has no autodate `created` field — only the text
      // `createdAt` we write ourselves. Sorting by `-created` makes PB reject
      // the whole query (and the catch below hides it as an empty list).
      pb.collection('review_links').getFullList<ReviewLinkRecord>({ filter: `slug="${slug}"`, sort: '-createdAt' }),
    )
  } catch {
    rows = []
  }
  // Annotate each link with its open-comment count so the dashboard can show
  // "3 comments" without a second round trip.
  const items = await Promise.all(
    rows.map(async (rec) => {
      let commentCount = 0
      try {
        const list = await withPb((pb) =>
          pb.collection('review_comments').getList(1, 1, { filter: `linkId="${rec.id}"`, skipTotal: false }),
        )
        commentCount = list.totalItems
      } catch {
        /* none */
      }
      return { ...publicLink(rec), commentCount }
    }),
  )
  return c.json({ items })
})

// ── Revoke ───────────────────────────────────────────────────────────────────
reviewLinks.post(
  '/clients/:slug/review-links/:id/revoke',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const rec = await getOwnedLink(slug, c.req.param('id'))
    if (!rec) return problem(c, { title: 'Not Found', status: 404, detail: 'No such review link' })
    const updated = await withPb((pb) =>
      pb
        .collection('review_links')
        .update<ReviewLinkRecord>(rec.id, { status: 'revoked', revokedAt: new Date().toISOString() }),
    )
    await audit(c.get('principal'), { action: 'review_link.revoke', slug, resourceId: rec.id })
    return c.json(publicLink(updated))
  },
)

// ── Rotate code ───────────────────────────────────────────────────────────────
reviewLinks.post(
  '/clients/:slug/review-links/:id/rotate',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const rec = await getOwnedLink(slug, c.req.param('id'))
    if (!rec) return problem(c, { title: 'Not Found', status: 404, detail: 'No such review link' })
    const code = generateAccessCode()
    const updated = await withPb((pb) =>
      pb.collection('review_links').update<ReviewLinkRecord>(rec.id, {
        codeHash: hashCode(rec.publicId, code),
        status: 'active',
        expiresAt: defaultExpiry(),
        revokedAt: '',
      }),
    )
    await audit(c.get('principal'), { action: 'review_link.rotate', slug, resourceId: rec.id })
    return c.json({ ...publicLink(updated), code })
  },
)

// ── Comments (moderation view) ────────────────────────────────────────────────
reviewLinks.get(
  '/clients/:slug/review-links/:id/comments',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const rec = await getOwnedLink(slug, c.req.param('id'))
    if (!rec) return problem(c, { title: 'Not Found', status: 404, detail: 'No such review link' })
    let items: unknown[] = []
    try {
      items = await withPb((pb) =>
        pb.collection('review_comments').getFullList({ filter: `linkId="${rec.id}"`, sort: 'createdAt' }),
      )
    } catch {
      items = []
    }
    return c.json({ items })
  },
)

// Dashboard reply to a review thread (source: dashboard).
reviewLinks.post(
  '/clients/:slug/review-links/:id/comments',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const rec = await getOwnedLink(slug, c.req.param('id'))
    if (!rec) return problem(c, { title: 'Not Found', status: 404, detail: 'No such review link' })
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const parsed = dashCommentSchema.safeParse(raw)
    if (!parsed.success) {
      return problem(c, {
        title: 'Unprocessable Entity',
        status: 422,
        detail: parsed.error.issues.map((i) => i.message).join('; '),
      })
    }
    const created = await withPb((pb) =>
      pb.collection('review_comments').create({
        linkId: rec.id,
        slug,
        postId: parsed.data.postId ?? '',
        reviewerName: actorOf(c),
        body: parsed.data.body,
        status: 'open',
        source: 'dashboard',
        createdAt: new Date().toISOString(),
      }),
    )
    await audit(c.get('principal'), { action: 'review_comment.reply', slug, resourceId: rec.id })
    return c.json(created, 201)
  },
)

// Resolve / reopen a comment.
reviewLinks.patch(
  '/clients/:slug/review-comments/:id',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const id = c.req.param('id')
    let existing: { id: string; slug: string }
    try {
      existing = await withPb((pb) => pb.collection('review_comments').getOne<{ id: string; slug: string }>(id))
    } catch {
      return problem(c, { title: 'Not Found', status: 404, detail: 'No such comment' })
    }
    if (existing.slug !== slug) return problem(c, { title: 'Not Found', status: 404, detail: 'No such comment' })
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const parsed = moderateSchema.safeParse(raw)
    if (!parsed.success) {
      return problem(c, { title: 'Unprocessable Entity', status: 422, detail: parsed.error.issues.map((i) => i.message).join('; ') })
    }
    const updated = await withPb((pb) =>
      pb.collection('review_comments').update(id, { status: parsed.data.status }),
    )
    await audit(c.get('principal'), { action: 'review_comment.moderate', slug, resourceId: id, after: { status: parsed.data.status } })
    return c.json(updated)
  },
)

// ── Activity feed (TASK-005) ──────────────────────────────────────────────────
interface ReviewEventRow {
  id: string
  slug: string
  linkId: string
  postId?: string
  kind: 'comment' | 'approved' | 'changes_requested'
  reviewerName?: string
  preview?: string
  read?: boolean
  createdAt?: string
}

reviewLinks.get('/clients/:slug/review-activity', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  const unreadOnly = c.req.query('unread') === 'true'
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200)
  let items: ReviewEventRow[] = []
  let unreadCount = 0
  try {
    const filter = unreadOnly ? `slug="${slug}" && read=false` : `slug="${slug}"`
    items = await withPb((pb) =>
      pb.collection('review_events').getList<ReviewEventRow>(1, limit, { filter, sort: '-createdAt' }),
    ).then((r) => r.items)
    unreadCount = await withPb((pb) =>
      pb.collection('review_events').getList(1, 1, { filter: `slug="${slug}" && read=false` }),
    ).then((r) => r.totalItems)
  } catch {
    items = []
  }
  return c.json({ items, unreadCount })
})

reviewLinks.post('/clients/:slug/review-activity/read', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
  }
  const parsed = markReadSchema.safeParse(raw)
  if (!parsed.success) {
    return problem(c, { title: 'Unprocessable Entity', status: 422, detail: parsed.error.issues.map((i) => i.message).join('; ') })
  }
  let marked = 0
  await withPb(async (pb) => {
    const targets = parsed.data.all
      ? (await pb.collection('review_events').getFullList<ReviewEventRow>({ filter: `slug="${slug}" && read=false` })).map((r) => r.id)
      : parsed.data.ids ?? []
    for (const id of targets) {
      try {
        const row = await pb.collection('review_events').getOne<ReviewEventRow>(id)
        if (row.slug !== slug) continue
        await pb.collection('review_events').update(id, { read: true })
        marked++
      } catch {
        /* skip */
      }
    }
  })
  return c.json({ ok: true, marked })
})

// ── Per-post feedback aggregation (v3 TASK-001) ──────────────────────────────
// One call for the whole calendar: every reviewer decision and comment for the
// client, indexed by postId, so the calendar can badge cards and the post view
// can show the thread without per-post requests. Signals only — internal
// approvals stay in approvals_v2.
interface ReviewCommentRow {
  id: string
  slug: string
  linkId: string
  postId?: string
  reviewerName?: string
  body: string
  status?: 'open' | 'resolved'
  source: 'reviewer' | 'dashboard'
  createdAt?: string
}

reviewLinks.get('/clients/:slug/review-feedback', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')

  let events: ReviewEventRow[] = []
  let comments: ReviewCommentRow[] = []
  try {
    // NB: sort by the text `createdAt` we write ourselves — these collections
    // have no autodate `created` field (see 2026-06-12 list-sort bugfix).
    events = await withPb((pb) =>
      pb.collection('review_events').getFullList<ReviewEventRow>({
        filter: `slug="${slug}" && postId != "" && (kind="approved" || kind="changes_requested")`,
        sort: 'createdAt',
      }),
    )
  } catch {
    events = []
  }
  try {
    comments = await withPb((pb) =>
      pb.collection('review_comments').getFullList<ReviewCommentRow>({ filter: `slug="${slug}"`, sort: 'createdAt' }),
    )
  } catch {
    comments = []
  }

  // Latest decision per (postId, reviewer). Events are createdAt-ascending, so
  // a plain overwrite keeps the newest.
  const decisionsByPost = new Map<string, Map<string, { decision: string; reviewerName: string; createdAt: string }>>()
  for (const ev of events) {
    if (!ev.postId) continue
    const reviewer = ev.reviewerName || 'Guest'
    const perReviewer = decisionsByPost.get(ev.postId) ?? new Map()
    perReviewer.set(reviewer, {
      decision: ev.kind,
      reviewerName: reviewer,
      createdAt: ev.createdAt ?? '',
    })
    decisionsByPost.set(ev.postId, perReviewer)
  }

  const byPost: Record<
    string,
    { decisions: { decision: string; reviewerName: string; createdAt: string }[]; comments: ReviewCommentRow[] }
  > = {}
  const bucket = (postId: string) =>
    (byPost[postId] ??= { decisions: [], comments: [] })

  for (const [postId, perReviewer] of decisionsByPost) {
    bucket(postId).decisions = [...perReviewer.values()]
  }
  const general: { comments: ReviewCommentRow[] } = { comments: [] }
  for (const cm of comments) {
    if (cm.postId) bucket(cm.postId).comments.push(cm)
    else general.comments.push(cm)
  }

  return c.json({ byPost, general })
})

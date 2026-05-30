// Viktor-owned reads + Phase 4 dashboard writes (overlay-backed).
//
// Reads merge the on-disk JSON (Viktor's authoritative copy) with PB overlay
// rows written by the dashboard. Writes go into the PB overlays only — the
// agent's disk files are never mutated by the API in Phase 4.

import { OpenAPIHono } from '@hono/zod-openapi'
import { withPb } from '../pb.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { audit } from '../audit.js'
import { disk } from '../diskData.js'
import {
  loadPostPatches,
  loadSuggestionStates,
  loadApprovalsV2,
  latestApprovalByPost,
} from '../overlays.js'
import { problem } from '../problem.js'

type PostBase = {
  id: string
  status?: string
  pillar?: string
  approval?: { status?: string }
} & Record<string, unknown>

async function buildPost(slug: string, id: string): Promise<PostBase | null> {
  const base = (await disk.post(slug, id)) as PostBase | null
  if (!base) return null
  const patches = await loadPostPatches(slug)
  const approvals = await latestApprovalByPost(slug)
  const patch = patches.get(id) ?? {}
  const approval = approvals.get(id)
  const next: PostBase = { ...base, ...patch, id }
  if (approval) {
    next.approval = {
      ...(base.approval ?? {}),
      ...(typeof patch.approval === 'object' && patch.approval !== null ? patch.approval : {}),
      status: approval.decision,
    }
  }
  return next
}

export const viktorOwned = new OpenAPIHono<AppEnv>()
viktorOwned.use('*', requireAuth)

viktorOwned.get('/clients/:slug/posts', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const idsFromIndex = (await disk.postsIndex(slug))?.posts
  const ids = idsFromIndex ?? (await disk.listPostFiles(slug))
  const status = c.req.query('status')
  const pillar = c.req.query('pillar')
  const items: PostBase[] = []
  for (const id of ids) {
    const post = await buildPost(slug, id)
    if (!post) continue
    if (status && post.approval?.status !== status && post.status !== status) continue
    if (pillar && post.pillar !== pillar) continue
    items.push(post)
  }
  return c.json({ items })
})

viktorOwned.get('/clients/:slug/posts/:id', requireScope(), async (c) => {
  const post = await buildPost(c.req.param('slug'), c.req.param('id'))
  if (!post) return problem(c, { title: 'Not Found', status: 404, detail: 'No such post' })
  return c.json(post)
})

viktorOwned.patch(
  '/clients/:slug/posts/:id',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const postId = c.req.param('id')
    let patch: Record<string, unknown>
    try {
      patch = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const principal = c.get('principal')
    await withPb((pb) =>
      pb.collection('posts_patches').create({
        slug,
        postId,
        patch,
        ts: new Date().toISOString(),
        actor: principal.label ?? principal.token.slice(0, 12),
      }),
    )
    await audit(principal, { action: 'post.patch', slug, resourceId: postId, after: patch })
    const next = await buildPost(slug, postId)
    return c.json(next)
  },
)

// ── Suggestions ─────────────────────────────────────────────────────────────

viktorOwned.get('/clients/:slug/suggestions', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const baseRaw = (await disk.suggestions(slug)) as { items?: Array<Record<string, unknown>> } | null
  const items = baseRaw?.items ?? []
  const states = await loadSuggestionStates(slug)
  const merged = items.map((item) => {
    const id = String(item.id ?? '')
    const state = states.get(id)
    if (!state) return item
    return {
      ...item,
      ...(state.status ? { status: state.status } : {}),
      ...(typeof state.priority === 'number' ? { priority: state.priority } : {}),
      ...(state.reason ? { reason: state.reason } : {}),
    }
  })
  merged.sort((a, b) => {
    const pa = typeof a.priority === 'number' ? a.priority : 999
    const pb = typeof b.priority === 'number' ? b.priority : 999
    return pa - pb
  })
  return c.json({ items: merged })
})

viktorOwned.patch(
  '/clients/:slug/suggestions/:id',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const suggestionId = c.req.param('id')
    let body: { status?: string; priority?: number; reason?: string }
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const principal = c.get('principal')
    const payload = {
      slug,
      suggestionId,
      status: body.status ?? '',
      priority: typeof body.priority === 'number' ? body.priority : null,
      reason: body.reason ?? '',
      ts: new Date().toISOString(),
      actor: principal.label ?? principal.token.slice(0, 12),
    }
    await withPb(async (pb) => {
      try {
        const existing = await pb
          .collection('suggestion_states')
          .getFirstListItem<{ id: string }>(`slug="${slug}" && suggestionId="${suggestionId}"`)
        await pb.collection('suggestion_states').update(existing.id, payload)
      } catch {
        await pb.collection('suggestion_states').create(payload)
      }
    })
    await audit(principal, {
      action: 'suggestion.update',
      slug,
      resourceId: suggestionId,
      after: body,
    })
    return c.json({ ok: true, ...payload })
  },
)

// ── Performance + assets (unchanged from Phase 2) ───────────────────────────

viktorOwned.get('/clients/:slug/performance', requireScope(), async (c) => {
  return c.json((await disk.performance(c.req.param('slug'))) ?? {})
})

viktorOwned.get('/clients/:slug/assets/manifest', requireScope(), async (c) => {
  return c.json((await disk.assetsManifest(c.req.param('slug'))) ?? { items: [] })
})

// ── Approvals: disk log + PB overlay merge, plus POST decision ──────────────

interface ApprovalListEntry {
  ts?: string
  action?: string
  postId?: string
  actor?: string
  note?: string
  source: 'log' | 'dashboard'
}

viktorOwned.get('/clients/:slug/approvals', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const raw = await disk.approvalsLog(slug)
  const items: ApprovalListEntry[] = []
  if (raw) {
    for (const line of raw.split('\n').map((l) => l.trim()).filter(Boolean)) {
      const [ts, action, postId, actor, ...rest] = line.split(/\s+/)
      const meta: Record<string, string> = {}
      for (const kv of rest) {
        if (kv.startsWith('note=')) continue
        const eq = kv.indexOf('=')
        if (eq > 0) meta[kv.slice(0, eq)] = kv.slice(eq + 1)
      }
      const noteMatch = line.match(/note="([^"]*)"/)
      items.push({
        ts,
        action,
        postId,
        actor,
        ...meta,
        note: noteMatch?.[1],
        source: 'log',
      })
    }
  }
  for (const ov of await loadApprovalsV2(slug)) {
    items.push({
      ts: ov.ts,
      action: ov.decision,
      postId: ov.postId,
      actor: ov.actor,
      note: ov.note,
      source: 'dashboard',
    })
  }
  items.sort((a, b) => (a.ts ?? '').localeCompare(b.ts ?? ''))
  return c.json({ items })
})

viktorOwned.post(
  '/clients/:slug/approvals',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    let body: { postId?: string; decision?: string; note?: string }
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const allowed = new Set(['in_review', 'approved', 'scheduled', 'rejected'])
    if (!body.postId || !body.decision || !allowed.has(body.decision)) {
      return problem(c, {
        title: 'Bad Request',
        status: 400,
        detail: 'postId + decision (in_review|approved|scheduled|rejected) required',
      })
    }
    const principal = c.get('principal')
    const row = {
      slug,
      postId: body.postId,
      decision: body.decision,
      note: body.note ?? '',
      actor: principal.label ?? principal.token.slice(0, 12),
      ts: new Date().toISOString(),
    }
    await withPb((pb) => pb.collection('approvals_v2').create(row))
    await audit(principal, {
      action: 'approval.decide',
      slug,
      resourceId: body.postId,
      after: { decision: body.decision, note: body.note },
    })
    return c.json({ ok: true, ...row }, 201)
  },
)

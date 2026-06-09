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
  loadCreatedPosts,
  loadSuggestionStates,
  loadDeletedAssetIds,
  loadApprovalsV2,
  latestApprovalByPost,
} from '../overlays.js'
import { problem } from '../problem.js'
import {
  postCreateSchema,
  postPatchSchema,
  suggestionPatchSchema,
  approvalCreateSchema,
  coalescePost,
  zodDetail,
} from '../schemas/post.js'

type PostBase = {
  id: string
  status?: string
  pillar?: string
  approval?: { status?: string }
} & Record<string, unknown>

type AssetManifest = {
  items?: Array<{ id?: unknown } & Record<string, unknown>>
}

// The chat agent doesn't always write the full image URL — it sometimes PATCHes
// a relative path like "assets/p002_cover.png", a bare filename, or even an
// absolute container path. Any of those break the dashboard <img>. Normalize to
// our public, basicauth-bypassing file route (root-relative so it works on any
// host). Leaves real absolute URLs (Unsplash, or the already-correct full URL)
// untouched.
function normalizeImageUrl(slug: string, image: unknown): unknown {
  if (typeof image !== 'string') return image
  const v = image.trim()
  if (!v) return v
  if (/^https?:\/\//i.test(v) || v.startsWith('/api/v1/')) return v
  const name = v.split('/').filter(Boolean).pop() ?? v
  return `/api/v1/clients/${slug}/assets/files/${name}`
}

async function buildPost(slug: string, id: string): Promise<PostBase | null> {
  // Try disk first, then fall back to dashboard/chat-created posts in PB.
  let base = (await disk.post(slug, id)) as PostBase | null
  if (!base) {
    const created = await loadCreatedPosts(slug)
    const c = created.get(id)
    if (!c) return null
    base = { ...(c as PostBase), id }
  }
  const patches = await loadPostPatches(slug)
  const approvals = await latestApprovalByPost(slug)
  const patch = patches.get(id) ?? {}
  const approval = approvals.get(id)
  const next: PostBase = { ...base, ...patch, id }
  if ('image' in next) next.image = normalizeImageUrl(slug, next.image)
  // CAR1: normalize each carousel slide image the same way the cover is, so the
  // agent can PATCH bare filenames and the dashboard still gets full asset URLs.
  if (Array.isArray((next as Record<string, unknown>).slides)) {
    const slides = (next as Record<string, unknown>).slides as Array<Record<string, unknown>>
    ;(next as Record<string, unknown>).slides = slides.map((s) =>
      s && typeof s === 'object' ? { ...s, image: normalizeImageUrl(slug, s.image) } : s,
    )
  }
  if (approval) {
    next.approval = {
      ...(base.approval ?? {}),
      ...(typeof patch.approval === 'object' && patch.approval !== null ? patch.approval : {}),
      status: approval.decision,
    }
  }
  // Repair partial / legacy rows so the dashboard never throws on a missing
  // field (the June white-screen). Defensive last step — never invents content.
  return coalescePost(next)
}

export const viktorOwned = new OpenAPIHono<AppEnv>()
viktorOwned.use('*', requireAuth)

viktorOwned.get('/clients/:slug/posts', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const idsFromIndex = (await disk.postsIndex(slug))?.posts
  const diskIds = idsFromIndex ?? (await disk.listPostFiles(slug))
  const created = await loadCreatedPosts(slug)
  const allIds = [...diskIds, ...Array.from(created.keys()).filter((id) => !diskIds.includes(id))]
  const status = c.req.query('status')
  const pillar = c.req.query('pillar')
  const includeDeleted = c.req.query('includeDeleted') === 'true'
  const items: PostBase[] = []
  for (const id of allIds) {
    const post = await buildPost(slug, id)
    if (!post) continue
    if (!includeDeleted && post.status === 'deleted') continue
    if (status && post.approval?.status !== status && post.status !== status) continue
    if (pillar && post.pillar !== pillar) continue
    items.push(post)
  }
  return c.json({ items })
})

// Create a new post originated from the dashboard or chat. Lives in
// `posts_created`. Auto-assigns an id like `c-<timestamp>` so it can't collide
// with Viktor's `pNNN` ids.
viktorOwned.post(
  '/clients/:slug/posts',
  requireScope(),
  // 'agent' = the Hermes bot (Telegram + in-app chat). requireScope() already
  // confines it to its own client, so letting it create/patch posts, move
  // approvals and update suggestions is safe — and is exactly what the system
  // prompt instructs it to do. Strategy docs (brief/plan/goals/learnings PUT in
  // userOwned) stay dash/admin-only on purpose.
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const parsed = postCreateSchema.safeParse(raw)
    if (!parsed.success) {
      const { detail, errors } = zodDetail(parsed.error)
      return problem(c, { title: 'Unprocessable Entity', status: 422, detail, errors })
    }
    const body = parsed.data as Record<string, unknown>
    const principal = c.get('principal')
    const id =
      typeof body.id === 'string' && body.id.trim()
        ? body.id.trim()
        : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const data = { ...body, id }
    await withPb((pb) =>
      pb.collection('posts_created').create({
        slug,
        postId: id,
        data,
        ts: new Date().toISOString(),
        actor: principal.label ?? principal.token.slice(0, 12),
      }),
    )
    await audit(principal, { action: 'post.create', slug, resourceId: id, after: data })
    const next = await buildPost(slug, id)
    return c.json(next, 201)
  },
)

// Soft delete: appends a posts_patches row with { status: 'deleted' }.
// List endpoint filters these out unless ?includeDeleted=true. Recovery is
// a single PATCH back to a different status.
viktorOwned.delete(
  '/clients/:slug/posts/:id',
  requireScope(),
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    const postId = c.req.param('id')
    const exists = await buildPost(slug, postId)
    if (!exists) {
      return problem(c, { title: 'Not Found', status: 404, detail: 'No such post' })
    }
    const principal = c.get('principal')
    await withPb((pb) =>
      pb.collection('posts_patches').create({
        slug,
        postId,
        patch: { status: 'deleted' },
        ts: new Date().toISOString(),
        actor: principal.label ?? principal.token.slice(0, 12),
      }),
    )
    await audit(principal, {
      action: 'post.delete',
      slug,
      resourceId: postId,
      before: exists,
      after: { status: 'deleted' },
    })
    return c.json({ ok: true, id: postId })
  },
)

viktorOwned.get('/clients/:slug/posts/:id', requireScope(), async (c) => {
  const post = await buildPost(c.req.param('slug'), c.req.param('id'))
  if (!post) return problem(c, { title: 'Not Found', status: 404, detail: 'No such post' })
  return c.json(post)
})

viktorOwned.patch(
  '/clients/:slug/posts/:id',
  requireScope(),
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    const postId = c.req.param('id')
    let rawPatch: unknown
    try {
      rawPatch = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const parsedPatch = postPatchSchema.safeParse(rawPatch)
    if (!parsedPatch.success) {
      const { detail, errors } = zodDetail(parsedPatch.error)
      return problem(c, { title: 'Unprocessable Entity', status: 422, detail, errors })
    }
    const patch = parsedPatch.data as Record<string, unknown>
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
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    const suggestionId = c.req.param('id')
    let rawSug: unknown
    try {
      rawSug = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const parsedSug = suggestionPatchSchema.safeParse(rawSug)
    if (!parsedSug.success) {
      const { detail, errors } = zodDetail(parsedSug.error)
      return problem(c, { title: 'Unprocessable Entity', status: 422, detail, errors })
    }
    const body = parsedSug.data
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
  const slug = c.req.param('slug')
  const manifest = ((await disk.assetsManifest(slug)) ?? { items: [] }) as AssetManifest
  const deleted = await loadDeletedAssetIds(slug)
  const items = (manifest.items ?? []).filter((item) => {
    const id = typeof item.id === 'string' ? item.id : ''
    return !id || !deleted.has(id)
  })
  return c.json({ ...manifest, items })
})

viktorOwned.delete(
  '/clients/:slug/assets/:id',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const assetId = c.req.param('id')
    const manifest = ((await disk.assetsManifest(slug)) ?? { items: [] }) as AssetManifest
    const asset = (manifest.items ?? []).find((item) => item.id === assetId)
    if (!asset) {
      return problem(c, { title: 'Not Found', status: 404, detail: 'No such asset' })
    }
    const principal = c.get('principal')
    const payload = {
      slug,
      assetId,
      status: 'deleted',
      ts: new Date().toISOString(),
      actor: principal.label ?? principal.token.slice(0, 12),
    }
    await withPb(async (pb) => {
      try {
        const existing = await pb
          .collection('asset_states')
          .getFirstListItem<{ id: string }>(`slug="${slug}" && assetId="${assetId}"`)
        await pb.collection('asset_states').update(existing.id, payload)
      } catch {
        await pb.collection('asset_states').create(payload)
      }
    })
    await audit(principal, {
      action: 'asset.delete',
      slug,
      resourceId: assetId,
      before: asset,
      after: { status: 'deleted' },
    })
    return c.json({ ok: true, id: assetId })
  },
)

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
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    let rawApproval: unknown
    try {
      rawApproval = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const parsedApproval = approvalCreateSchema.safeParse(rawApproval)
    if (!parsedApproval.success) {
      const { detail, errors } = zodDetail(parsedApproval.error)
      return problem(c, { title: 'Unprocessable Entity', status: 422, detail, errors })
    }
    const body = parsedApproval.data
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

// Viktor-owned reads + Phase 4 dashboard writes (overlay-backed).
//
// Reads merge the on-disk JSON (Viktor's authoritative copy) with PB overlay
// rows written by the dashboard. Writes go into the PB overlays only — the
// agent's disk files are never mutated by the API in Phase 4.

import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { withPb } from '../pb.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { audit } from '../audit.js'
import { disk } from '../diskData.js'
import { loadSuggestionStates, loadDeletedAssetIds, loadApprovalsV2 } from '../overlays.js'
import { buildPost, listPostIds, type PostBase } from '../posts.js'
import { problem } from '../problem.js'
import {
  postCreateSchema,
  postPatchSchema,
  suggestionPatchSchema,
  approvalCreateSchema,
  zodDetail,
} from '../schemas/post.js'
import { applyStatusToSchedule, refreshPublishStatus, ScheduleRejected } from '../scheduling/sync.js'
import { SchedulingError } from '../scheduling/provider.js'

type AssetManifest = {
  items?: Array<{ id?: unknown } & Record<string, unknown>>
}

export const viktorOwned = new OpenAPIHono<AppEnv>()
viktorOwned.use('*', requireAuth)

// GF-26 — persist a publishing patch produced by the scheduling port as a
// posts_patches overlay row (same mechanism every other dashboard write uses).
async function persistSchedulingPatch(
  slug: string,
  postId: string,
  patch: Record<string, unknown>,
  actor: string,
): Promise<void> {
  await withPb((pb) =>
    pb.collection('posts_patches').create({
      slug,
      postId,
      patch,
      ts: new Date().toISOString(),
      actor,
    }),
  )
}

// Turn a scheduling-port exception into a problem+json response. A business
// rule (past date / no provider) is a 422; a backend failure (Postiz down /
// rejected) is a 502 — either way the caller learns WHY and the post is NOT
// left mislabeled as Programmed (TASK-014).
function schedulingProblem(c: Context<AppEnv>, err: unknown) {
  if (err instanceof ScheduleRejected) {
    return problem(c, { title: 'Unprocessable Entity', status: err.status, detail: err.message })
  }
  if (err instanceof SchedulingError) {
    return problem(c, {
      title: 'Bad Gateway',
      status: 502,
      detail: `Scheduling failed via ${err.provider}: ${err.message} The post was NOT scheduled.`,
    })
  }
  return null
}

viktorOwned.get('/clients/:slug/posts', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const allIds = await listPostIds(slug)
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
    const data = { ...body, id } as Record<string, unknown>
    const actor = principal.label ?? principal.token.slice(0, 12)

    // GF-26 — a post created directly as "scheduled" must get a REAL provider
    // job before we persist it; otherwise it would appear in the Programmed lane
    // with nothing actually scheduled. On failure return the error and do NOT
    // create the post (TASK-014/016). prevStatus is empty => this is a move-in.
    if (data.status === 'scheduled') {
      try {
        const result = await applyStatusToSchedule(slug, { ...data, status: '' }, 'scheduled')
        if (result?.publishing) {
          data.publishing = { ...((data.publishing as object) ?? {}), ...result.publishing }
        }
      } catch (err) {
        const resp = schedulingProblem(c, err)
        if (resp) return resp
        throw err
      }
    }

    await withPb((pb) =>
      pb.collection('posts_created').create({
        slug,
        postId: id,
        data,
        ts: new Date().toISOString(),
        actor,
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
  const slug = c.req.param('slug')
  const id = c.req.param('id')
  const post = await buildPost(slug, id)
  if (!post) return problem(c, { title: 'Not Found', status: 404, detail: 'No such post' })
  // GF-26 / TASK-015 — when a scheduled post has gone live at the provider,
  // flip it to Published (filling publishedAt + publicUrl) and persist the
  // transition so the Published lane + post link reflect reality. Best-effort:
  // refreshPublishStatus never throws on a provider hiccup.
  const refreshed = await refreshPublishStatus(slug, post as Record<string, unknown>)
  if (refreshed) {
    const patch: Record<string, unknown> = { publishing: refreshed.publishing }
    if (refreshed.status) patch.status = refreshed.status
    const principal = c.get('principal')
    await persistSchedulingPatch(slug, id, patch, principal.label ?? principal.token.slice(0, 12))
    const next = await buildPost(slug, id)
    return c.json(next ?? post)
  }
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
    const actor = principal.label ?? principal.token.slice(0, 12)

    // GF-26 — if this PATCH changes the status (and/or the date of a scheduled
    // post), drive the scheduling provider FIRST. We compute the post as it
    // WILL be after the field-level patch (date may change in the same call) so
    // the past-date check and the provider payload use the intended values.
    const current = await buildPost(slug, postId)
    if (!current) {
      return problem(c, { title: 'Not Found', status: 404, detail: 'No such post' })
    }
    const nextStatus = typeof patch.status === 'string' ? patch.status : undefined
    const intended = { ...current, ...patch, id: postId } as Record<string, unknown>
    // Drive the port when the status changes, or when an already-scheduled post
    // has its date moved (a reschedule must move the real provider job too).
    const reschedulingDate =
      nextStatus === undefined &&
      String(current.status ?? '') === 'scheduled' &&
      typeof patch.date === 'string' &&
      patch.date !== current.date
    let schedulingPatch: Record<string, unknown> | null = null
    if (nextStatus !== undefined || reschedulingDate) {
      try {
        const result = await applyStatusToSchedule(slug, intended, nextStatus)
        if (result) {
          schedulingPatch = result.publishing
          if (result.status) patch.status = result.status
        }
      } catch (err) {
        const resp = schedulingProblem(c, err)
        if (resp) return resp
        throw err
      }
    }

    const finalPatch = schedulingPatch ? { ...patch, publishing: { ...((patch.publishing as object) ?? {}), ...schedulingPatch } } : patch
    await persistSchedulingPatch(slug, postId, finalPatch, actor)
    await audit(principal, { action: 'post.patch', slug, resourceId: postId, after: finalPatch })
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
    const actor = principal.label ?? principal.token.slice(0, 12)

    // GF-26 — `decision` is the dashboard's primary status-change path. Moving a
    // post to "scheduled" must create a REAL provider job BEFORE we record the
    // decision; moving it out cancels the job. If scheduling fails we return an
    // error and DO NOT write the approval row, so the post is never shown as
    // Programmed without a live job (TASK-014/016).
    let schedulingPatch: Record<string, unknown> | null = null
    {
      const current = await buildPost(slug, body.postId)
      if (current) {
        try {
          const result = await applyStatusToSchedule(slug, current, body.decision)
          if (result) schedulingPatch = result.publishing
        } catch (err) {
          const resp = schedulingProblem(c, err)
          if (resp) return resp
          throw err
        }
      }
    }

    const row = {
      slug,
      postId: body.postId,
      decision: body.decision,
      note: body.note ?? '',
      actor,
      ts: new Date().toISOString(),
    }
    await withPb((pb) => pb.collection('approvals_v2').create(row))
    if (schedulingPatch) {
      await persistSchedulingPatch(slug, body.postId, { publishing: schedulingPatch }, actor)
    }
    await audit(principal, {
      action: 'approval.decide',
      slug,
      resourceId: body.postId,
      after: { decision: body.decision, note: body.note },
    })
    return c.json({ ok: true, ...row }, 201)
  },
)

// User-owned resources: brief / plan / goals / learnings.
//
// Source of truth is PB (collections: briefs, plans, goals, learnings). Each
// row is `{ slug, data: <opaque JSON> }`. The dashboard treats `data` as the
// full document and PUTs the whole thing back. Phase 4 will swap to JSON
// Patch for finer granularity.
//
// Reads fall back to the on-disk JSON shipped in the repo so a freshly seeded
// PB returns sensible content even before any user save.

import { OpenAPIHono } from '@hono/zod-openapi'
import { Hono } from 'hono'
import { withPb } from '../pb.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { audit } from '../audit.js'
import { disk } from '../diskData.js'
import { problem } from '../problem.js'

type UserResource = 'brief' | 'plan' | 'goals' | 'learnings'

const collectionFor: Record<UserResource, string> = {
  brief: 'briefs',
  plan: 'plans',
  goals: 'goals',
  learnings: 'learnings',
}

const diskFor: Record<UserResource, (slug: string) => Promise<unknown>> = {
  brief: disk.brief,
  plan: disk.plan,
  goals: disk.goals,
  learnings: disk.learnings,
}

function hasObjectKey(data: Record<string, unknown>, key: string): boolean {
  return !!data[key] && typeof data[key] === 'object'
}

function isValidUserDocument(resource: UserResource, data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  switch (resource) {
    case 'brief':
      return (
        hasObjectKey(d, 'company') &&
        hasObjectKey(d, 'business') &&
        hasObjectKey(d, 'audience') &&
        hasObjectKey(d, 'voice') &&
        hasObjectKey(d, 'boundaries')
      )
    case 'plan':
      return hasObjectKey(d, 'agency') && hasObjectKey(d, 'client') && hasObjectKey(d, 'quarter')
    case 'goals':
      return Array.isArray(d.quarterly) && Array.isArray(d.monthly) && Array.isArray(d.weekly)
    case 'learnings':
      return Array.isArray(d.items)
  }
}

async function loadFromPbOrDisk(resource: UserResource, slug: string): Promise<unknown> {
  const diskData = async () => (await diskFor[resource](slug)) ?? null
  try {
    const rec = await withPb((pb) =>
      pb.collection(collectionFor[resource]).getFirstListItem<{ data: unknown }>(
        `slug="${slug}"`,
      ),
    )
    if (!isValidUserDocument(resource, rec.data)) {
      return diskData()
    }
    return rec.data
  } catch {
    return diskData()
  }
}

interface UpsertResult {
  before: unknown
  after: unknown
}

async function upsertInPb(
  resource: UserResource,
  slug: string,
  data: unknown,
): Promise<UpsertResult> {
  return withPb<UpsertResult>(async (pb) => {
    const coll = pb.collection(collectionFor[resource])
    try {
      const existing = await coll.getFirstListItem<{ id: string; data: unknown }>(
        `slug="${slug}"`,
      )
      const updated = await coll.update<{ data: unknown }>(existing.id, { data })
      return { before: existing.data, after: updated.data }
    } catch {
      const created = await coll.create<{ data: unknown }>({ slug, data })
      return { before: null, after: created.data }
    }
  })
}

export const userOwned = new OpenAPIHono<AppEnv>()
userOwned.use('*', requireAuth)

for (const res of ['brief', 'plan', 'goals', 'learnings'] as const) {
  userOwned.get(`/clients/:slug/${res}`, requireScope(), async (c) => {
    const data = await loadFromPbOrDisk(res, c.req.param('slug'))
    return c.json({ data })
  })

  userOwned.put(
    `/clients/:slug/${res}`,
    requireScope(),
    requireRole('dash', 'admin'),
    async (c) => {
      const slug = c.req.param('slug')
      let body: { data?: unknown }
      try {
        body = await c.req.json()
      } catch {
        return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
      }
      if (body.data === undefined) {
        return problem(c, {
          title: 'Bad Request',
          status: 400,
          detail: 'Body must include { data: ... }',
        })
      }
      const { before, after } = await upsertInPb(res, slug, body.data)
      await audit(c.get('principal'), {
        action: `${res}.update`,
        slug,
        before,
        after,
      })
      return c.json({ data: after })
    },
  )
}

// PATCH /clients/:slug/branding — shallow merge into brief.branding without
// touching the rest of the brief. Lets the chatbot (or any client) update
// colors / typography / logos / tone in isolation.
//
// NOTE: this is the ONE user-owned (brief) field the 'agent' role may write.
// The full brief/plan/goals/learnings PUT stays dash/admin-only on purpose, but
// branding is narrow, low-risk visual config and is exactly what Viktor needs
// to keep posts on-brand — so the in-app chat agent is allowed here. requireScope()
// still confines the agent to its own client slug.
userOwned.patch(
  '/clients/:slug/branding',
  requireScope(),
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    let body: Record<string, unknown>
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const current = ((await loadFromPbOrDisk('brief', slug)) as
      | { branding?: Record<string, unknown> }
      | null) ?? {}
    const nextBranding = { ...(current.branding ?? {}), ...body }
    const nextBrief = { ...current, branding: nextBranding }
    const { before, after } = await upsertInPb('brief', slug, nextBrief)
    await audit(c.get('principal'), {
      action: 'branding.update',
      slug,
      before:
        typeof before === 'object' && before !== null
          ? (before as { branding?: unknown }).branding
          : null,
      after: nextBranding,
    })
    return c.json({ data: nextBranding })
  },
)

// POST /clients/:slug/learnings/entries — append one entry to the items list.
userOwned.post(
  '/clients/:slug/learnings/entries',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    let entry: { id?: string; [k: string]: unknown }
    try {
      entry = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const current = ((await loadFromPbOrDisk('learnings', slug)) as
      | { items?: unknown[] }
      | null) ?? { items: [] }
    const items = Array.isArray(current.items) ? current.items : []
    const id = entry.id ?? `l${String(items.length + 1).padStart(3, '0')}`
    const next = { ...current, items: [...items, { ...entry, id, createdAt: new Date().toISOString() }] }
    const { before, after } = await upsertInPb('learnings', slug, next)
    await audit(c.get('principal'), { action: 'learnings.entry.append', slug, before, after })
    return c.json({ data: after }, 201)
  },
)

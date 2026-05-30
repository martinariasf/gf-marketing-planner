// Viktor-owned reads: posts / suggestions / performance / approvals / assets.
//
// Phase 2 reads only — all five resources still live as files under
// /data/clients/<slug>/* (bind mount from the host). The agent continues to
// write them by editing JSON. Phase 4 introduces PB-backed writes for posts /
// suggestions / approvals.

import { OpenAPIHono } from '@hono/zod-openapi'
import { requireAuth, requireScope, type AppEnv } from '../auth.js'
import { disk } from '../diskData.js'
import { problem } from '../problem.js'

export const viktorOwned = new OpenAPIHono<AppEnv>()
viktorOwned.use('*', requireAuth)

viktorOwned.get('/clients/:slug/posts', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const idsFromIndex = (await disk.postsIndex(slug))?.posts
  const ids = idsFromIndex ?? (await disk.listPostFiles(slug))
  const status = c.req.query('status')
  const pillar = c.req.query('pillar')
  const items: unknown[] = []
  for (const id of ids) {
    const post = (await disk.post(slug, id)) as
      | { status?: string; pillar?: string }
      | null
    if (!post) continue
    if (status && post.status !== status) continue
    if (pillar && post.pillar !== pillar) continue
    items.push(post)
  }
  return c.json({ items })
})

viktorOwned.get('/clients/:slug/posts/:id', requireScope(), async (c) => {
  const post = await disk.post(c.req.param('slug'), c.req.param('id'))
  if (!post) return problem(c, { title: 'Not Found', status: 404, detail: 'No such post' })
  return c.json(post)
})

viktorOwned.get('/clients/:slug/suggestions', requireScope(), async (c) => {
  return c.json((await disk.suggestions(c.req.param('slug'))) ?? { items: [] })
})

viktorOwned.get('/clients/:slug/performance', requireScope(), async (c) => {
  return c.json((await disk.performance(c.req.param('slug'))) ?? {})
})

viktorOwned.get('/clients/:slug/assets/manifest', requireScope(), async (c) => {
  return c.json((await disk.assetsManifest(c.req.param('slug'))) ?? { items: [] })
})

// Approvals come from a text log: one decision per line, whitespace-separated.
// Format: <iso-ts> <action> <postId> <actor> [key=value ...]
viktorOwned.get('/clients/:slug/approvals', requireScope(), async (c) => {
  const raw = await disk.approvalsLog(c.req.param('slug'))
  if (!raw) return c.json({ items: [] })
  const items = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [ts, action, postId, actor, ...rest] = line.split(/\s+/)
      const meta: Record<string, string> = {}
      let noteMatch = line.match(/note="([^"]*)"/)
      for (const kv of rest) {
        const eq = kv.indexOf('=')
        if (eq > 0 && !kv.startsWith('note=')) meta[kv.slice(0, eq)] = kv.slice(eq + 1)
      }
      return { ts, action, postId, actor, ...meta, note: noteMatch?.[1] }
    })
  return c.json({ items })
})

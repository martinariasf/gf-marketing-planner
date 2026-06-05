// /v1/clients — list + bundle read.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { withPb } from '../pb.js'
import { requireAuth, requireScope, type AppEnv } from '../auth.js'
import { disk } from '../diskData.js'

const ClientSummarySchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    industry: z.string().optional(),
    logoInitials: z.string().optional(),
    quarter: z.string().optional(),
    headline: z.string().optional(),
    status: z.enum(['active', 'demo', 'archived']).optional(),
  })
  .openapi('ClientSummary')

const listRoute = createRoute({
  method: 'get',
  path: '/clients',
  tags: ['clients'],
  summary: 'List clients visible to the caller',
  security: [{ bearerAuth: [] }],
  responses: {
    200: {
      description: 'Array of client summaries',
      content: {
        'application/json': {
          schema: z.object({ items: z.array(ClientSummarySchema) }),
        },
      },
    },
  },
})

export const clients = new OpenAPIHono<AppEnv>()
clients.use('*', requireAuth)

type ClientRecord = {
  slug: string
  name: string
  industry?: string
  logoInitials?: string
  quarter?: string
  headline?: string
  status?: 'active' | 'demo' | 'archived'
}

async function clientList(): Promise<ClientRecord[]> {
  const idx = await disk.clientIndex()
  const diskRecords = ((idx?.clients ?? []) as ClientRecord[]).filter((r) => r.slug)
  try {
    const pbRecords = await withPb((pb) => pb.collection('clients').getFullList<ClientRecord>())
    const bySlug = new Map<string, ClientRecord>()
    for (const record of diskRecords) bySlug.set(record.slug, record)
    for (const record of pbRecords) bySlug.set(record.slug, record)
    return Array.from(bySlug.values())
  } catch {
    return diskRecords
  }
}

clients.openapi(listRoute, async (c) => {
  const principal = c.get('principal')
  const records = await clientList()
  const filtered =
    principal.slug === '*' ? records : records.filter((r) => r.slug === principal.slug)
  return c.json({
    items: filtered.map((r) => ({
      slug: r.slug,
      name: r.name,
      industry: r.industry,
      logoInitials: r.logoInitials,
      quarter: r.quarter,
      headline: r.headline,
      status: r.status,
    })),
  })
})

// GET /v1/clients/:slug — bundle: summary + all user-owned + viktor-owned docs.
// The dashboard hydrates a whole client view with a single request.
clients.get('/clients/:slug', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const all = await clientList()
  const summary = all.find((r) => r.slug === slug) ?? null
  const [brief, plan, goals, learnings, suggestions, performance, manifest] = await Promise.all([
    disk.brief(slug),
    disk.plan(slug),
    disk.goals(slug),
    disk.learnings(slug),
    disk.suggestions(slug),
    disk.performance(slug),
    disk.assetsManifest(slug),
  ])
  return c.json({ summary, brief, plan, goals, learnings, suggestions, performance, manifest })
})

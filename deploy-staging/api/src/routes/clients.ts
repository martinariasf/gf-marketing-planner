// /v1/clients — list + bundle read.
// Full implementation arrives in Phase 2; Phase 1 ships read-only stubs so the
// OpenAPI surface is visible and the dashboard can smoke-test against it.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { withPb } from '../pb.js'
import { requireAuth, type AppEnv } from '../auth.js'

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

clients.openapi(listRoute, async (c) => {
  const principal = c.get('principal')
  const records = await withPb((pb) =>
    pb.collection('clients').getFullList<{
      slug: string
      name: string
      industry?: string
      logoInitials?: string
      quarter?: string
      headline?: string
      status?: 'active' | 'demo' | 'archived'
    }>(),
  )
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

// Health + version endpoint. Unauthenticated.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { env } from '../env.js'
import { withPb } from '../pb.js'

const HealthSchema = z
  .object({
    ok: z.boolean(),
    release: z.string(),
    pb: z.enum(['up', 'down']),
    ts: z.string(),
  })
  .openapi('Health')

const route = createRoute({
  method: 'get',
  path: '/health',
  tags: ['meta'],
  summary: 'Health check',
  responses: {
    200: {
      description: 'Service is up. `pb` reflects PocketBase reachability.',
      content: { 'application/json': { schema: HealthSchema } },
    },
  },
})

export const health = new OpenAPIHono()

health.openapi(route, async (c) => {
  let pbStatus: 'up' | 'down' = 'down'
  try {
    await withPb((pb) => pb.health.check())
    pbStatus = 'up'
  } catch {
    pbStatus = 'down'
  }
  return c.json({
    ok: true,
    release: env.release,
    pb: pbStatus,
    ts: new Date().toISOString(),
  })
})

import { OpenAPIHono } from '@hono/zod-openapi'
import { withPb } from '../pb.js'
import { requireAuth, requireScope, type AppEnv } from '../auth.js'

export const agentJobsRoute = new OpenAPIHono<AppEnv>()
agentJobsRoute.use('*', requireAuth)

agentJobsRoute.get('/clients/:slug/agent-jobs', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const thread = c.req.query('thread')
  const limit = Math.min(Math.max(Number(c.req.query('limit') ?? '20'), 1), 100)
  const filter = [`slug="${slug}"`, thread ? `thread="${thread}"` : null]
    .filter(Boolean)
    .join(' && ')
  const records = await withPb((pb) =>
    pb.collection('agent_jobs').getList(1, limit, {
      filter,
      sort: '-created',
    }),
  )
  return c.json({ items: records.items })
})

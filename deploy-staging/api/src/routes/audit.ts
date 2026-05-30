// Audit list endpoint.
//
// Returns the most recent audit entries for a client slug. The append path
// lives in src/audit.ts (called from every write).

import { OpenAPIHono } from '@hono/zod-openapi'
import { withPb } from '../pb.js'
import { requireAuth, requireScope, type AppEnv } from '../auth.js'

export const auditRoute = new OpenAPIHono<AppEnv>()
auditRoute.use('*', requireAuth)

auditRoute.get('/clients/:slug/audit', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const since = c.req.query('since')
  const action = c.req.query('action')
  const limit = Math.min(Number(c.req.query('limit') ?? '100'), 500)

  const filterParts = [`slug='${slug}'`]
  if (since) filterParts.push(`created>='${since}'`)
  if (action) filterParts.push(`action='${action}'`)
  const filter = filterParts.join(' && ')

  const records = await withPb((pb) =>
    pb.collection('audit').getList(1, limit, { filter, sort: '-created' }),
  )
  return c.json({ items: records.items })
})

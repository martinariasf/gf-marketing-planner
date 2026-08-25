// GF-113 — Performance tab backend (TASK-006).
//
//   GET  /api/v1/clients/:slug/analytics        read the cached payload
//   POST /api/v1/clients/:slug/analytics/sync   refresh one client on demand
//
// THE READ ROUTE NEVER CALLS POSTIZ. It reads the cache row the sync worker
// writes. Postiz publishes no rate-limit headers (measured in the TASK-001
// probe), so a page load that hit the provider would burn an unmeasurable quota
// and make the tab's latency depend on a third party.
//
// It also never returns `{}`. The legacy `GET /clients/:slug/performance` ends in
// `?? {}`, which is exactly why the SPA cannot today tell "no Postiz key" from
// "connected but no data yet" — both arrive as an empty object and both render as
// a blank tab. Every response here carries an explicit `status` the SPA branches
// on.
//
// No secret material is ever in the response. The Postiz key is decrypted only
// inside the server-side adapter.

import { OpenAPIHono } from '@hono/zod-openapi'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { rateLimit } from '../rateLimit.js'
import { problem } from '../problem.js'
import { readAnalyticsCache, syncClientAnalytics } from '../analyticsSync.js'

export const analytics = new OpenAPIHono<AppEnv>()
analytics.use('*', requireAuth)

analytics.get('/clients/:slug/analytics', requireScope(), async (c) => {
  // Always a well-formed ClientAnalytics — no 404, no {}.
  return c.json(await readAnalyticsCache(c.req.param('slug')))
})

analytics.post(
  '/clients/:slug/analytics/sync',
  requireScope(),
  requireRole('dash', 'admin'),
  // The Refresh button must not be a quota cannon. Six refreshes per five minutes
  // per client is generous for a human clicking it and still nowhere near even the
  // most pessimistic reading of the Postiz hourly limit, given each sync costs ~4
  // requests. This is a SECOND limiter on top of the global one precisely because
  // the cost here is external and unmeasurable rather than local CPU.
  rateLimit({ windowMs: 5 * 60_000, max: 6 }),
  async (c) => {
    const slug = c.req.param('slug')
    try {
      return c.json(await syncClientAnalytics(slug))
    } catch (err) {
      // syncClientAnalytics already persists error/stale states, so reaching here
      // means something outside the provider path broke (e.g. PocketBase).
      return problem(c, {
        title: 'Analytics refresh failed',
        status: 502,
        detail: err instanceof Error ? err.message : 'Unknown error.',
      })
    }
  },
)

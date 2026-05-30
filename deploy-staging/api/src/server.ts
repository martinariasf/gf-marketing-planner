// Marketing Planner staging REST API — entry point.
//
// Mount order:
//   /api/v1/health        — unauth health probe
//   /api/v1/clients       — auth + scope checks (full CRUD lands Phase 2)
//   /api/v1/docs          — Scalar UI
//   /api/v1/openapi.json  — machine-readable spec

import { serve } from '@hono/node-server'
import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { env } from './env.js'
import { health } from './routes/health.js'
import { clients } from './routes/clients.js'
import { problem } from './problem.js'

const app = new OpenAPIHono()

// Same-origin in production (Caddy proxies /api/v1/* to here), but CORS is
// helpful for local dev where the SPA runs on 5173.
app.use('*', cors({ origin: ['http://localhost:5173', 'http://localhost:4173'], credentials: true }))
app.use('*', logger())

// Mount under /api/v1
app.route('/api/v1', health)
app.route('/api/v1', clients)

// OpenAPI spec
app.doc('/api/v1/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Marketing Planner API',
    version: '1.0.0',
    description:
      'Staging API for the Viktor marketing operating dashboard. Single source of truth for agent <-> dashboard interactions.',
  },
  servers: [
    { url: 'https://staging.marketing.gfinnov.com', description: 'staging' },
    { url: 'http://localhost:8080', description: 'local' },
  ],
})

// Bearer-token security scheme reference
app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'agent_* or dash_* token. See deploy-staging/api/README.md.',
})

// Interactive docs UI
app.get(
  '/api/v1/docs',
  apiReference({
    spec: { url: '/api/v1/openapi.json' },
    pageTitle: 'Marketing Planner API — staging',
    theme: 'purple',
  }),
)

// Friendly root.
app.get('/', (c) => c.json({ name: 'mp-staging-api', docs: '/api/v1/docs' }))

// 404 + error handlers in problem+json shape.
app.notFound((c) =>
  problem(c, { title: 'Not Found', status: 404, detail: `No route for ${c.req.method} ${c.req.path}` }),
)
app.onError((err, c) => {
  console.error('[api] unhandled', err)
  return problem(c, {
    title: 'Internal Server Error',
    status: 500,
    detail: err instanceof Error ? err.message : 'unknown',
  })
})

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[mp-staging-api] listening on :${info.port} (release=${env.release})`)
})

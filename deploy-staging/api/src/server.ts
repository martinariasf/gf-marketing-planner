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
import { errorResponse } from './pbError.js'
import { health } from './routes/health.js'
import { clients } from './routes/clients.js'
import { userOwned } from './routes/userOwned.js'
import { viktorOwned } from './routes/viktorOwned.js'
import { auditRoute } from './routes/audit.js'
import { notifyRoute } from './routes/notify.js'
import { chat } from './routes/chat.js'
import { authExchange } from './routes/authExchange.js'
import { authLogin } from './routes/authLogin.js'
import { reviewPublic } from './routes/reviewPublic.js'
import { reviewLinks } from './routes/reviewLinks.js'
import { integration } from './routes/integration.js'
import { assetFiles } from './routes/assetFiles.js'
import { inspiration } from './routes/inspiration.js'
import { chatAttachments } from './routes/chatAttachments.js'
import { planningConfig } from './routes/planningConfig.js'
import { agentJobsRoute } from './routes/agentJobs.js'
import { rateLimit } from './rateLimit.js'
import { ensureCollections } from './ensureCollections.js'
import { startAgentJobReconciler } from './agentJobs.js'
import { startAnalyticsSync } from './analyticsSync.js'
import { analytics } from './routes/analytics.js'
import { registerApiDocs } from './openapi-docs.js'
import { problem } from './problem.js'

const app = new OpenAPIHono()

// Same-origin in production (Caddy proxies /api/v1/* to here), but CORS is
// helpful for local dev where the SPA runs on 5173.
app.use('*', cors({ origin: ['http://localhost:5173', 'http://localhost:4173'], credentials: true }))
app.use('*', logger())
// Phase 7: global rate limit (120 req/min per token+IP). Stricter caps on
// /chat/stream live in routes/chat.ts.
app.use('/api/v1', rateLimit({ windowMs: 60_000, max: 120 }, 'def'))
app.use('/api/v1/*', rateLimit({ windowMs: 60_000, max: 120 }, 'def'))

// Document the plain-Hono routes (posts/branding/suggestions/approvals/assets/…)
// in the OpenAPI registry so /api/v1/docs is complete for external agents. This
// only adds spec entries; the real handlers live in the route files.
registerApiDocs(app)

// OpenAPI spec + docs UI are registered BEFORE the auth-gated subapps so
// the clients router's wildcard requireAuth middleware doesn't swallow them.
app.doc('/api/v1/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'Marketing Planner API',
    version: '1.0.0',
    description: [
      'Staging API for the Viktor marketing operating dashboard. Single source of truth for agent <-> dashboard interactions.',
      '',
      '## For external agents',
      'These docs are the agent-facing integration reference (the human webapp only links here).',
      '',
      '- **Auth:** send `Authorization: Bearer <agent token>` on every request. The token is scoped to one client `slug` and cannot touch other clients.',
      '- **Get connected in one step:** the dashboard Integration screen offers a one-click JSON payload (`apiBase`, `slug`, `token`, `openapiUrl`, key `endpoints`) — ingest that and you are configured.',
      '- **Source material for post generation — READ THIS BEFORE YOU DRAFT:** `GET /clients/{slug}/information-sources?approved=true` returns the documents a human uploaded through the dashboard for the agent to use (brand guidelines, product facts, transcripts). The full document text is in each item’s `summary`; `title` names it and `prompt` says how to use it. Treat these as authoritative about the client, above your own assumptions. You can also POST your own grounding to the same path (JSON) or `/clients/{slug}/information-sources/upload` (text file); role `agent` is allowed, and uploads are approved on arrival. See the **source material** tag.',
      '- **Posts / approvals / suggestions:** agent role has full read+write (see those tags).',
      '- **Strategy docs** (brief/plan/goals/learnings) are **read-only** for agents; only `branding` is agent-writable.',
      '- **Images** are optional. When you do generate one, write it to `clients/{slug}/assets/` and append a manifest row; reference it via the public `/clients/{slug}/assets/files/{name}` URL.',
    ].join('\n'),
  },
  servers: [
    { url: 'https://staging.marketing.gfinnov.com', description: 'staging' },
    { url: 'http://localhost:8080', description: 'local' },
  ],
})

app.openAPIRegistry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  description: 'agent_* or dash_* token. See deploy-staging/api/README.md.',
})

app.get(
  '/api/v1/docs',
  apiReference({
    spec: { url: '/api/v1/openapi.json' },
    pageTitle: 'Marketing Planner API — staging',
    theme: 'purple',
  }),
)

app.get('/api/v1', (c) =>
  c.json({
    name: 'marketing-planner-api',
    release: env.release,
    health: '/api/v1/health',
    docs: '/api/v1/docs',
    openapi: '/api/v1/openapi.json',
  }),
)

// Mount under /api/v1. authExchange is mounted FIRST because the other
// subapps register `use('*', requireAuth)` which would otherwise intercept
// /auth/exchange and 401 it before our handler runs.
app.route('/api/v1', health)
// Public image serving — mounted before the auth-gated subapps so <img> tags
// can load generated assets without a bearer token.
app.route('/api/v1', assetFiles)
// GF-4 public review API — code-gated, no bearer token. Mounted before the
// auth-gated subapps so an external reviewer can reach /review/* without a
// dashboard token (mirrors assetFiles + authExchange).
app.route('/api/v1', reviewPublic)
app.route('/api/v1', authExchange)
// GF-58 — dashboard account login (/auth/login, /auth/me, /auth/logout).
// Mounted before the bearer-gated subapps, like authExchange.
app.route('/api/v1', authLogin)
app.route('/api/v1', clients)
// GF-4 dashboard review-link management (bearer-gated).
app.route('/api/v1', reviewLinks)
app.route('/api/v1', userOwned)
app.route('/api/v1', viktorOwned)
app.route('/api/v1', inspiration)
app.route('/api/v1', chatAttachments)
app.route('/api/v1', planningConfig)
app.route('/api/v1', agentJobsRoute)
app.route('/api/v1', auditRoute)
app.route('/api/v1', notifyRoute)
app.route('/api/v1', chat)
app.route('/api/v1', integration)
app.route('/api/v1', analytics)

// Friendly root.
app.get('/', (c) =>
  c.json({
    name: 'marketing-planner-api',
    release: env.release,
    health: '/api/v1/health',
    docs: '/api/v1/docs',
    openapi: '/api/v1/openapi.json',
  }),
)

// 404 + error handlers in problem+json shape.
app.notFound((c) =>
  problem(c, { title: 'Not Found', status: 404, detail: `No route for ${c.req.method} ${c.req.path}` }),
)
app.onError((err, c) => {
  console.error('[api] unhandled', err)
  // GF-110 — a PocketBase validation failure is the caller's problem, not a
  // server fault. errorResponse reports PB's status and the field-level reason
  // instead of flattening everything into a 500 whose detail said
  // "Failed to create record."
  return errorResponse(c, err)
})

// Best-effort PB collection bootstrap. Failures only log — the API still
// boots so /health stays green while we investigate.
if (env.pbAdminEmail && env.pbAdminPassword) {
  ensureCollections().catch((err) => console.error('[ensureCollections] failed', err))
  startAgentJobReconciler()
  // GF-113 — periodic Postiz analytics pull. Conservative by construction:
  // Postiz returns no rate-limit headers, so there is nothing to react to.
  startAnalyticsSync()
}

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`[mp-staging-api] listening on :${info.port} (release=${env.release})`)
})

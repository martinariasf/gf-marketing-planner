import { test } from 'node:test'
import assert from 'node:assert/strict'
import { OpenAPIHono } from '@hono/zod-openapi'

// GF-144 TASK-003 — the viewer role must be able to read everything `dash`
// reads and write NOTHING. Per the design constraint, the write-deny guard
// lives inside `requireAuth` (src/auth.ts), not as a global app.use(), because
// requireAuth is registered PER-SUBAPP (`use('*', requireAuth)` inside each
// file in src/routes/) rather than globally on `app` in src/server.ts.
//
// Rather than hand-writing a list of routes (which rots the moment a new
// mutating route is added), this test builds the SAME app server.ts builds
// and enumerates its own route table (`app.routes`) so a future unguarded
// route fails this test automatically.

process.env.BOOTSTRAP_TOKENS = 'viewer_test:viewer:staging-demo,dash_test:dash:staging-demo'

const { health } = await import('./routes/health.js')
const { assetFiles } = await import('./routes/assetFiles.js')
const { reviewPublic } = await import('./routes/reviewPublic.js')
const { authExchange } = await import('./routes/authExchange.js')
const { authLogin } = await import('./routes/authLogin.js')
const { clients } = await import('./routes/clients.js')
const { reviewLinks } = await import('./routes/reviewLinks.js')
const { userOwned } = await import('./routes/userOwned.js')
const { viktorOwned } = await import('./routes/viktorOwned.js')
const { inspiration } = await import('./routes/inspiration.js')
const { chatAttachments } = await import('./routes/chatAttachments.js')
const { planningConfig } = await import('./routes/planningConfig.js')
const { agentJobsRoute } = await import('./routes/agentJobs.js')
const { auditRoute } = await import('./routes/audit.js')
const { notifyRoute } = await import('./routes/notify.js')
const { chat } = await import('./routes/chat.js')
const { integration } = await import('./routes/integration.js')
const { analytics } = await import('./routes/analytics.js')
const { errorResponse } = await import('./pbError.js')
const { problem } = await import('./problem.js')

// Mirrors src/server.ts's mount order exactly (minus OpenAPI doc registration,
// ensureCollections, and serve() — none of which affect routing/auth).
const app = new OpenAPIHono()
app.route('/api/v1', health)
app.route('/api/v1', assetFiles)
app.route('/api/v1', reviewPublic)
app.route('/api/v1', authExchange)
app.route('/api/v1', authLogin)
app.route('/api/v1', clients)
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
app.notFound((c) => problem(c, { title: 'Not Found', status: 404, detail: 'no route' }))
app.onError((err, c) => errorResponse(c, err))

const SLUG = 'staging-demo'

// Routes mounted BEFORE the bearer-gated subapps (see src/server.ts's mount
// comments) — no requireAuth guards these, so the viewer write-deny guard
// (which lives inside requireAuth) never runs for them. Excluded per spec.
const EXCLUDED_PATHS = new Set<string>([
  // server.ts:118 — unauth health probe.
  'GET /api/v1/health',
  // server.ts:121 — public asset/image serving, mounted before auth so <img>
  // tags work without a bearer token.
  'GET /api/v1/clients/:slug/assets/files/:name',
  'GET /api/v1/clients/:slug/inspiration/:id/file',
  'GET /api/v1/clients/:slug/chat/attachments/:id/file',
  // server.ts:125 — public review API, code-gated (no bearer token at all).
  'POST /api/v1/review/:publicId/open',
  'GET /api/v1/review/:publicId',
  'POST /api/v1/review/:publicId/comments',
  'POST /api/v1/review/:publicId/decision',
  // server.ts:126 — /auth/exchange must be reachable before a bearer token
  // exists (it MINTS the token from basicauth), so it is mounted before the
  // requireAuth-guarded subapps.
  'GET /api/v1/auth/exchange',
  // server.ts:129 — dashboard account login/session, mounted before the
  // bearer-gated subapps for the same reason as authExchange. GET /auth/me
  // does call requireAuth itself inline, but it's a GET (excluded from write
  // testing anyway); /auth/login and /auth/logout have no requireAuth at all.
  'POST /api/v1/auth/login',
  'GET /api/v1/auth/me',
  'POST /api/v1/auth/logout',
])

function substitute(path: string): string {
  return path
    .replace(/:slug/g, SLUG)
    .replace(/:publicId/g, 'pub-1')
    .replace(/:name/g, 'test.png')
    .replace(/:id/g, 'test-id')
}

// Hono's route table can list the same (method, path) more than once (once
// per middleware in a multi-middleware chain). Dedupe so each endpoint is
// only exercised once.
const seen = new Set<string>()
const routeEntries: { method: string; path: string }[] = []
for (const r of app.routes) {
  if (r.method === 'ALL') continue // middleware wildcards, not real endpoints
  const key = `${r.method} ${r.path}`
  if (seen.has(key)) continue
  seen.add(key)
  routeEntries.push({ method: r.method, path: r.path })
}

const mutating = routeEntries.filter(
  (r) => !['GET', 'HEAD', 'OPTIONS'].includes(r.method) && !EXCLUDED_PATHS.has(`${r.method} ${r.path}`),
)
const readable = routeEntries.filter(
  (r) => ['GET', 'HEAD', 'OPTIONS'].includes(r.method) && !EXCLUDED_PATHS.has(`${r.method} ${r.path}`),
)

// The mount list above is a hand-kept mirror of server.ts. Routes added to an
// EXISTING subapp are caught automatically (the real modules are imported), but
// a brand-new subapp file mounted only in server.ts would be invisible to the
// sweep above — silently exempting every route in it. That is precisely the
// hole this test exists to close, so assert the mirror has not drifted.
test('GF-144: the mirrored mount list matches server.ts', async () => {
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('./server.ts', import.meta.url), 'utf8')
  const mountedInServer = new Set(
    [...src.matchAll(/^app\.route\('\/api\/v1',\s*(\w+)\)/gm)].map((m) => m[1]!),
  )
  const mirrored = new Set([
    'health', 'assetFiles', 'reviewPublic', 'authExchange', 'authLogin', 'clients',
    'reviewLinks', 'userOwned', 'viktorOwned', 'inspiration', 'chatAttachments',
    'planningConfig', 'agentJobsRoute', 'auditRoute', 'notifyRoute', 'chat',
    'integration', 'analytics',
  ])
  const missing = [...mountedInServer].filter((n) => !mirrored.has(n))
  const stale = [...mirrored].filter((n) => !mountedInServer.has(n))
  assert.deepEqual(
    { missing, stale },
    { missing: [], stale: [] },
    'server.ts mounts a subapp this test does not sweep (or vice versa). Add it to ' +
      'the imports + app.route() block above, or viewer writes to it go untested.',
  )
})

test('GF-144: sanity — enumerated at least one mutating and one readable route', () => {
  assert.ok(mutating.length > 5, `expected several mutating routes, found ${mutating.length}`)
  assert.ok(readable.length > 5, `expected several readable routes, found ${readable.length}`)
})

test('GF-144: viewer role gets 403 with the write-deny detail on every non-GET route', async () => {
  const failures: string[] = []
  for (const r of mutating) {
    const path = `/api/v1${substitute(r.path.replace(/^\/api\/v1/, ''))}`
    const res = await app.request(path, {
      method: r.method,
      headers: { Authorization: 'Bearer viewer_test', 'Content-Type': 'application/json' },
      body: ['GET', 'HEAD'].includes(r.method) ? undefined : '{}',
    })
    let detail = ''
    try {
      detail = (await res.json()).detail
    } catch {
      // no JSON body — still a failure below
    }
    // A 403 from requireScope would be a FALSE PASS — it proves nothing about
    // the write guard. Assert on the specific write-guard detail string so a
    // scope-mismatch 403 can't masquerade as this test passing.
    if (res.status !== 403 || detail !== 'Viewer tokens are read-only') {
      failures.push(`${r.method} ${r.path} -> status=${res.status} detail=${JSON.stringify(detail)}`)
    }
  }
  assert.deepEqual(failures, [], `unguarded (or wrongly-guarded) mutating routes:\n${failures.join('\n')}`)
})

// GF-144 criterion 4 — the token must be visible in the audit trail. A viewer
// never mutates, so the only thing there is to log is the refusal.
test('GF-144: a refused viewer write is recorded in the audit log', async () => {
  const { audit } = await import('./audit.js')
  assert.equal(typeof audit, 'function', 'audit() must exist for requireAuth to call')
  const src = await (await import('node:fs/promises')).readFile(
    new URL('./auth.ts', import.meta.url),
    'utf8',
  )
  // Structural assertion: the denial branch calls audit with the agreed action.
  assert.match(
    src,
    /principal\.role === 'viewer'[\s\S]{0,600}?action: 'viewer\.denied'/,
    "requireAuth's viewer-deny branch must call audit({ action: 'viewer.denied' })",
  )
  assert.match(
    src,
    /action: 'viewer\.denied'[\s\S]{0,300}?note: `\$\{c\.req\.method\}/,
    'the audit row must record the attempted method and path in `note`',
  )
})

test('GF-144: viewer role is NOT blocked on GET routes (positive case)', async () => {
  const sample = readable.find((r) => r.path === '/api/v1/clients/:slug/posts') ?? readable[0]!
  const path = `/api/v1${substitute(sample.path.replace(/^\/api\/v1/, ''))}`
  const res = await app.request(path, {
    method: sample.method,
    headers: { Authorization: 'Bearer viewer_test' },
  })
  assert.notEqual(res.status, 403, `GET ${sample.path} was blocked for a viewer token`)
})

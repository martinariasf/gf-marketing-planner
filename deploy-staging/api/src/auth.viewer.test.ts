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
// WARNING to a future author: if the sweep below fails on a route that is NOT
// in this list, the correct fix is almost never to add it here. These entries
// are excluded because they are mounted BEFORE requireAuth and are public to
// everyone (not just viewers), so the guard cannot fire for them by design. A
// newly-failing route means a genuinely unguarded mutating endpoint — fix the
// route, not this list.
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
  // 'ALL' entries are middleware wildcards (use('*', ...)), not endpoints. A
  // real endpoint registered with .all() would otherwise be invisibly exempt
  // from the sweep — the guard below fails loudly if one ever appears.
  if (r.method === 'ALL') {
    assert.equal(
      r.path.includes('*'),
      true,
      `route table has a non-wildcard ALL entry (${r.path}). If that is a real ` +
        'endpoint registered with .all(), it is escaping the viewer write sweep.',
    )
    continue
  }
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
  // Tolerant of reformatting: any quote style, any indentation, any whitespace.
  // A brittle pattern here would find nothing, report no drift, and silently
  // reintroduce the exact hole this test exists to close.
  const mountedInServer = new Set(
    [...src.matchAll(/app\.route\(\s*['"`]\/api\/v1['"`]\s*,\s*(\w+)\s*\)/g)].map((m) => m[1]!),
  )
  assert.ok(
    mountedInServer.size > 5,
    `the server.ts mount regex matched ${mountedInServer.size} subapps — it has almost ` +
      'certainly stopped matching after a reformat. Fix the pattern; do not delete this test.',
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

// GF-144 criterion 3 — the token must be visible in the audit trail. A viewer
// never mutates, so the only thing there is to log is the refusal.
//
// This asserts BEHAVIOR, not the presence of a call site: an earlier version
// regex-matched auth.ts's source, which would have passed just as happily if
// audit() were a no-op or wrote to the wrong collection.
test('GF-144: a refused viewer write is recorded in the audit log', async () => {
  const calls: { principal: { role: string; label?: string }; entry: Record<string, unknown> }[] = []
  const { mock } = await import('node:test')
  const { Hono } = await import('hono')
  mock.module('./audit.js', {
    namedExports: {
      audit: async (principal: { role: string; label?: string }, entry: Record<string, unknown>) => {
        calls.push({ principal, entry })
      },
    },
  })
  // Re-import auth.ts so it binds the mocked audit module.
  const { requireAuth: guarded } = await import(`./auth.js?audit-spy=${Date.now()}`)
  const app2 = new Hono()
  app2.use('*', guarded)
  app2.post('/clients/:slug/thing', (c) => c.json({ ok: true }))

  const res = await app2.request('/clients/staging-demo/thing', {
    method: 'POST',
    headers: { Authorization: 'Bearer viewer_test' },
  })

  assert.equal(res.status, 403)
  assert.equal(calls.length, 1, 'exactly one audit row per refused viewer write')
  assert.equal(calls[0]!.entry.action, 'viewer.denied')
  assert.equal(calls[0]!.entry.slug, 'staging-demo')
  assert.match(String(calls[0]!.entry.note), /^POST \/clients\/staging-demo\/thing$/)
  // criterion 3: "with their own label"
  assert.equal(calls[0]!.principal.role, 'viewer')
  assert.ok(calls[0]!.principal.label, 'the audit row must carry the token label')
})

// GF-144 criterion 1 — a viewer must be able to GET every read endpoint a
// `dash` token can reach. Sweeping EVERY readable route, not sampling one:
// sampling a single route passed while 8 of 26 GET routes were in fact 403ing,
// because `viewer` was in no requireRole allow-list.
//
// The comparison is against `dash`, not against 200. Many of these routes need
// a live PocketBase and legitimately fail with 5xx in unit tests; what matters
// is that a viewer is not turned away where a dash token is let through.
test('GF-144: a viewer can reach every GET route a dash token can reach', async () => {
  const regressions: string[] = []
  for (const r of readable) {
    const path = `/api/v1${substitute(r.path.replace(/^\/api\/v1/, ''))}`
    const headers = (t: string) => ({ Authorization: `Bearer ${t}` })
    const asViewer = await app.request(path, { method: r.method, headers: headers('viewer_test') })
    const asDash = await app.request(path, { method: r.method, headers: headers('dash_test') })
    if (asViewer.status === 403 && asDash.status !== 403) {
      let detail = ''
      try {
        detail = (await asViewer.json()).detail
      } catch {
        /* no JSON body */
      }
      regressions.push(`${r.method} ${r.path} -> viewer 403 (${detail}) but dash ${asDash.status}`)
    }
  }
  assert.deepEqual(
    regressions,
    [],
    `read endpoints a dash token can reach but a viewer cannot:\n${regressions.join('\n')}`,
  )
})

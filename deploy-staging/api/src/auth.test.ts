// GF-126 — requireAuth must turn a PbUnavailableError thrown out of
// lookupToken's JWT branch (verifyUserToken -> pb.ts) into a 503 problem+json,
// never the existing 401 "Unknown or revoked token". A PB blip must not look
// like a bad token to the SPA and mass-log-out every dashboard user.
//
// Mocks '../pb.js' at the module boundary auth.ts itself imports from,
// following the mock.module pattern already used in
// routes/viktorOwned.approvals.test.ts and
// routes/planningConfig.orgSettings.test.ts.

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Hono } from 'hono'

process.env.BOOTSTRAP_TOKENS = 'dash_test:dash:acme'

class FakePbUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('PocketBase is unavailable')
    this.name = 'PbUnavailableError'
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause
  }
}

let verifyUserTokenImpl: (token: string) => Promise<unknown> = async () => null

// GF-144 — the api_tokens row lookupToken's PB branch should find, or null to
// simulate "no such token". Default throws, preserving the original GF-126
// tests' assertion that their paths never reach PB.
let apiTokenRowImpl: () => Promise<unknown> = async () => {
  throw new Error('withPb should not be called by these requireAuth tests')
}

mock.module('./pb.js', {
  namedExports: {
    withPb: async (fn: (pb: unknown) => unknown) => {
      void fn
      return apiTokenRowImpl()
    },
    verifyUserToken: (token: string) => verifyUserTokenImpl(token),
    pb: {},
    PbUnavailableError: FakePbUnavailableError,
  },
})

const { requireAuth } = await import('./auth.js')

function appWithAuth() {
  const app = new Hono()
  app.use('*', requireAuth)
  app.get('/ping', (c) => c.json({ ok: true }))
  return app
}

// Well-formed dot-separated JWT shape so lookupToken's JWT_RE routes it into
// the verifyUserToken branch instead of the bootstrap/api_tokens branches.
const JWT = 'header.payload.signature'

test('requireAuth responds 401 (not 503) when the token is genuinely invalid', async () => {
  // pb.ts's own verifyUserToken already translates a real 4xx into null —
  // requireAuth just needs to keep treating a null principal as 401.
  verifyUserTokenImpl = async () => null
  const res = await appWithAuth().request('/ping', { headers: { Authorization: `Bearer ${JWT}` } })
  assert.equal(res.status, 401)
  const body = (await res.json()) as { title: string; detail: string }
  assert.equal(body.title, 'Unauthorized')
  assert.equal(body.detail, 'Unknown or revoked token')
})

test('requireAuth responds 503 (not 401) when PB is unavailable', async () => {
  verifyUserTokenImpl = async () => {
    throw new FakePbUnavailableError(new Error('fetch failed'))
  }
  const res = await appWithAuth().request('/ping', { headers: { Authorization: `Bearer ${JWT}` } })
  assert.equal(res.status, 503)
  const body = (await res.json()) as { title: string; status: number; detail: string }
  assert.equal(body.title, 'Service Unavailable')
  assert.equal(body.status, 503)
})

test('requireAuth still accepts a valid bootstrap token without touching verifyUserToken', async () => {
  verifyUserTokenImpl = async () => {
    throw new Error('should not be called — bootstrap tokens never look like a JWT')
  }
  const res = await appWithAuth().request('/ping', { headers: { Authorization: 'Bearer dash_test' } })
  assert.equal(res.status, 200)
})

test('requireAuth propagates an error that is not PbUnavailableError rather than swallowing it', async () => {
  verifyUserTokenImpl = async () => {
    throw new Error('some other unexpected failure')
  }
  const app = appWithAuth()
  app.onError((err, c) => c.json({ caught: err.message }, 500))
  const res = await app.request('/ping', { headers: { Authorization: `Bearer ${JWT}` } })
  assert.equal(res.status, 500)
  const body = (await res.json()) as { caught: string }
  assert.equal(body.caught, 'some other unexpected failure')
})

// ── GF-144: the viewer role, as it will actually exist in staging ────────────
//
// Every other viewer test uses a BOOTSTRAP_TOKENS token. Real viewer tokens are
// rows in the `api_tokens` PB collection, and that is a different branch of
// lookupToken — one that no test exercised. Criteria 1 and 3 are about those
// tokens, so they are tested here against the PB branch specifically.

function appWithGuardedRoutes() {
  const app = new Hono()
  app.use('*', requireAuth)
  app.get('/ping', (c) => c.json({ ok: true }))
  app.post('/write', (c) => c.json({ ok: true }))
  return app
}

// A PB-shaped token (no dots) so lookupToken skips the JWT branch and, finding
// no bootstrap match, falls through to the api_tokens query.
const PB_TOKEN = 'viewer_pb_abc123'

test('GF-144: a viewer token stored in api_tokens is accepted and can read', async () => {
  apiTokenRowImpl = async () => ({
    token: PB_TOKEN,
    role: 'viewer',
    slug: 'acme',
    label: 'ci-verifier',
    revoked: false,
  })
  const res = await appWithGuardedRoutes().request('/ping', {
    headers: { Authorization: `Bearer ${PB_TOKEN}` },
  })
  assert.equal(res.status, 200, 'a PB-issued viewer token must be able to read')
})

test('GF-144: a viewer token stored in api_tokens is still refused on writes', async () => {
  apiTokenRowImpl = async () => ({
    token: PB_TOKEN,
    role: 'viewer',
    slug: 'acme',
    label: 'ci-verifier',
    revoked: false,
  })
  const res = await appWithGuardedRoutes().request('/write', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PB_TOKEN}` },
  })
  assert.equal(res.status, 403)
  const body = (await res.json()) as { detail: string }
  assert.equal(body.detail, 'Viewer tokens are read-only')
})

test('GF-144: revoking a viewer token in api_tokens stops it working (criterion 3)', async () => {
  apiTokenRowImpl = async () => ({
    token: PB_TOKEN,
    role: 'viewer',
    slug: 'acme',
    label: 'ci-verifier',
    revoked: true,
  })
  const res = await appWithGuardedRoutes().request('/ping', {
    headers: { Authorization: `Bearer ${PB_TOKEN}` },
  })
  assert.equal(res.status, 401, 'a revoked viewer token must not authenticate')
  const body = (await res.json()) as { detail: string }
  assert.equal(body.detail, 'Unknown or revoked token')
})

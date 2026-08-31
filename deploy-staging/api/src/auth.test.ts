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

mock.module('./pb.js', {
  namedExports: {
    withPb: async () => {
      throw new Error('withPb should not be called by these requireAuth tests')
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

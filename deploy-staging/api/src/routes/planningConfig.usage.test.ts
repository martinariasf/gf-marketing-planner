import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-104 TASK-002 — GET /clients/:slug/usage.
//
// GF-104 rework: the OpenRouter key hash / guardrail id are no longer read
// from client-editable org_configs.settings — they come from the server-side
// OPENROUTER_CLIENTS_JSON env map (env.ts's resolveOpenRouterClient()). That
// map is parsed once at module-evaluation time, so it must be set on
// process.env BEFORE planningConfig.js (which imports env.js) is imported
// below — a static import would hoist and evaluate env.ts first, same
// reasoning as env.drive.test.ts. Each slug used below therefore gets a
// fixed, scenario-appropriate entry (or no entry, for the "not configured"
// case) up front, rather than being mutated per-test as the old
// org-settings-backed version did.

process.env.BOOTSTRAP_TOKENS =
  'dash_test:dash:acme,dash_other:dash:other-client,agent_test:agent:acme,dash_cache:dash:cache-slug,dash_nokey:dash:no-key-slug'

process.env.OPENROUTER_CLIENTS_JSON = JSON.stringify({
  acme: { keyHash: 'hash1', guardrailId: 'guard1' },
  'cache-slug': { keyHash: 'hash1', guardrailId: 'guard1' },
  // 'no-key-slug' is deliberately absent — exercises the "not configured" path.
})

let getClientUsageImpl: (keyHash: string, guardrailId: string) => Promise<unknown> = async () => {
  throw new Error('getClientUsageImpl not set for this test')
}

mock.module('../usage.js', {
  namedExports: {
    getClientUsage: async (keyHash: string, guardrailId: string) => getClientUsageImpl(keyHash, guardrailId),
  },
})
mock.module('../audit.js', { namedExports: { audit: async () => {} } })
mock.module('../pb.js', {
  namedExports: {
    withPb: async (fn: (pb: unknown) => unknown) =>
      fn({
        collection: () => ({
          getFirstListItem: async () => {
            throw new Error('not found')
          },
        }),
      }),
    verifyUserToken: async () => null,
    pb: {},
    PbUnavailableError: class PbUnavailableError extends Error {
      constructor(cause?: unknown) {
        super('PocketBase is unavailable')
        this.name = 'PbUnavailableError'
        if (cause !== undefined) (this as { cause?: unknown }).cause = cause
      }
    },
  },
})

const { planningConfig } = await import('./planningConfig.js')

// GF-104 Layer-5 review, finding 2 — pins the existing requireAuth behavior
// (already exercised live on staging) for this specific route: no/invalid
// bearer token must never reach resolveOpenRouterClient or getClientUsage.
test('GET /usage is unauthorized (401) with no Authorization header', async () => {
  const res = await planningConfig.request('/clients/acme/usage')
  assert.equal(res.status, 401)
})

test('GET /usage is unauthorized (401) with an invalid bearer token', async () => {
  const res = await planningConfig.request('/clients/acme/usage', {
    headers: { Authorization: 'Bearer not-a-real-token' },
  })
  assert.equal(res.status, 401)
})

test('GET /usage returns configured:false when the client has no key hash / guardrail linked', async () => {
  const res = await planningConfig.request('/clients/no-key-slug/usage', {
    headers: { Authorization: 'Bearer dash_nokey' },
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.deepEqual(body, { configured: false })
})

test('GET /usage returns configured:true, unavailable:true when OpenRouter fails, never a 500', async () => {
  getClientUsageImpl = async () => {
    throw new Error('OpenRouter /keys/hash1 returned 503 Service Unavailable')
  }
  const res = await planningConfig.request('/clients/acme/usage', {
    headers: { Authorization: 'Bearer dash_test' },
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.deepEqual(body, { configured: true, unavailable: true })
})

test('GET /usage returns the usage shape for a caller scoped to that client', async () => {
  getClientUsageImpl = async () => ({
    percentUsed: 0.42,
    categories: { writing: 0.2, image: 0.15, video: 0.05, audio: 0 },
    hasLimit: true,
  })
  const res = await planningConfig.request('/clients/acme/usage', {
    headers: { Authorization: 'Bearer dash_test' },
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.deepEqual(body, {
    configured: true,
    percentUsed: 0.42,
    categories: { writing: 0.2, image: 0.15, video: 0.05, audio: 0 },
    hasLimit: true,
  })
  // No monetary value may ever appear in the response.
  const raw = JSON.stringify(body)
  assert.ok(!raw.includes('usage_monthly'))
  assert.ok(!raw.includes('limit_usd'))
})

test('GET /usage is forbidden (403) for a caller scoped to a DIFFERENT client', async () => {
  const res = await planningConfig.request('/clients/acme/usage', {
    headers: { Authorization: 'Bearer dash_other' },
  })
  assert.equal(res.status, 403)
})

test('GET /usage caches a successful result for repeated calls within the TTL window', async () => {
  // A slug not touched by any earlier test — the cache is a module-level
  // singleton shared across this file's requests, so reusing "acme" here
  // would read a previous test's cached entry instead of exercising a fresh
  // cache miss followed by a cache hit.
  let calls = 0
  getClientUsageImpl = async () => {
    calls += 1
    return { percentUsed: 0.1, categories: { writing: 0.1, image: 0, video: 0, audio: 0 }, hasLimit: true }
  }
  const first = await planningConfig.request('/clients/cache-slug/usage', {
    headers: { Authorization: 'Bearer dash_cache' },
  })
  assert.equal(first.status, 200)
  const second = await planningConfig.request('/clients/cache-slug/usage', {
    headers: { Authorization: 'Bearer dash_cache' },
  })
  assert.equal(second.status, 200)
  assert.equal(calls, 1, 'getClientUsage should be called once; the second request should hit the cache')
})

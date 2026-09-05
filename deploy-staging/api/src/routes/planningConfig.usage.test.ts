import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-104 TASK-002 — GET /clients/:slug/usage.

process.env.BOOTSTRAP_TOKENS =
  'dash_test:dash:acme,dash_other:dash:other-client,agent_test:agent:acme,dash_cache:dash:cache-slug'

let orgSettingsBySlug: Record<string, Record<string, unknown>> = {}
let getClientUsageImpl: (keyHash: string, guardrailId: string) => Promise<unknown> = async () => {
  throw new Error('getClientUsageImpl not set for this test')
}

mock.module('../orgSettings.js', {
  namedExports: {
    loadOrgSettings: async (slug: string) => ({
      showAiGeneratedLabel: true,
      autoScheduleOnApprove: false,
      timezone: 'UTC',
      ...(orgSettingsBySlug[slug] ?? {}),
    }),
    DEFAULTS: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' },
    isValidIanaTimezone: (tz: unknown) => {
      if (typeof tz !== 'string' || !tz.trim()) return false
      try {
        new Intl.DateTimeFormat(undefined, { timeZone: tz })
        return true
      } catch {
        return false
      }
    },
  },
})
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

test('GET /usage returns configured:false when the client has no key hash / guardrail linked', async () => {
  orgSettingsBySlug = { acme: {} }
  const res = await planningConfig.request('/clients/acme/usage', {
    headers: { Authorization: 'Bearer dash_test' },
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.deepEqual(body, { configured: false })
})

test('GET /usage returns configured:true, unavailable:true when OpenRouter fails, never a 500', async () => {
  orgSettingsBySlug = { acme: { openrouterKeyHash: 'hash1', openrouterGuardrailId: 'guard1' } }
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
  orgSettingsBySlug = { acme: { openrouterKeyHash: 'hash1', openrouterGuardrailId: 'guard1' } }
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
  orgSettingsBySlug = { acme: { openrouterKeyHash: 'hash1', openrouterGuardrailId: 'guard1' } }
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
  orgSettingsBySlug = { 'cache-slug': { openrouterKeyHash: 'hash1', openrouterGuardrailId: 'guard1' } }
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

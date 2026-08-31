import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-92 (B) — GET/PUT /clients/:slug/config/settings.

process.env.BOOTSTRAP_TOKENS = 'dash_test:dash:acme,agent_test:agent:acme'

let storedSettings: Record<string, unknown> | undefined
const pbCreateCalls: Array<{ collection: string; data: unknown }> = []

mock.module('../orgSettings.js', {
  namedExports: {
    // Real implementation, minus the withPb dependency: mirrors loadOrgSettings'
    // "never throw, fall back to DEFAULTS" contract for this test's fake store.
    loadOrgSettings: async () => ({
      showAiGeneratedLabel: true,
      autoScheduleOnApprove: false,
      timezone: 'UTC',
      ...(storedSettings ?? {}),
    }),
    DEFAULTS: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' },
    // GF-37 follow-up — real implementation (no PB dependency to strip here).
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
mock.module('../audit.js', { namedExports: { audit: async () => {} } })
mock.module('../pb.js', {
  namedExports: {
    withPb: async (fn: (pb: unknown) => unknown) =>
      fn({
        collection: (name: string) => ({
          getFirstListItem: async () => {
            if (name === 'org_configs' && storedSettings) {
              return { id: 'rec1', settings: storedSettings }
            }
            throw new Error('not found')
          },
          create: async (data: Record<string, unknown>) => {
            pbCreateCalls.push({ collection: name, data })
            storedSettings = data.settings as Record<string, unknown>
            return data
          },
          update: async (_id: string, data: Record<string, unknown>) => {
            pbCreateCalls.push({ collection: name, data })
            storedSettings = data.settings as Record<string, unknown>
            return data
          },
        }),
      }),
    verifyUserToken: async () => null,
    pb: {},
  },
})

const { planningConfig } = await import('./planningConfig.js')

test('GET /config/settings defaults showAiGeneratedLabel and timezone when unset', async () => {
  storedSettings = undefined
  const res = await planningConfig.request('/clients/acme/config/settings', {
    headers: { Authorization: 'Bearer dash_test' },
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  // GF-37 follow-up — an existing client that has never touched this screen
  // must read back exactly 'UTC', proving the new field is additive and
  // doesn't change behavior for anyone who hasn't set it.
  assert.deepEqual(body.data, { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' })
})

test('PUT /config/settings with the dash role succeeds and persists all three keys', async () => {
  storedSettings = undefined
  const res = await planningConfig.request('/clients/acme/config/settings', {
    method: 'PUT',
    headers: { Authorization: 'Bearer dash_test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: { showAiGeneratedLabel: false, autoScheduleOnApprove: true, timezone: 'Europe/Berlin' },
    }),
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.deepEqual(body.data, {
    showAiGeneratedLabel: false,
    autoScheduleOnApprove: true,
    timezone: 'Europe/Berlin',
  })

  // GF-92 Layer-5 review, finding 6 — the PUT response body alone doesn't
  // prove persistence (acceptance criterion 2: "survive reload"). Read the
  // value back via a fresh GET to prove it was actually stored, not just
  // echoed.
  const readBack = await planningConfig.request('/clients/acme/config/settings', {
    headers: { Authorization: 'Bearer dash_test' },
  })
  const readBackBody = await readBack.json()
  assert.equal(readBack.status, 200)
  assert.deepEqual(readBackBody.data, {
    showAiGeneratedLabel: false,
    autoScheduleOnApprove: true,
    timezone: 'Europe/Berlin',
  })
})

test('PUT /config/settings rejects a missing/non-boolean key with 422', async () => {
  storedSettings = undefined
  const res = await planningConfig.request('/clients/acme/config/settings', {
    method: 'PUT',
    headers: { Authorization: 'Bearer dash_test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { showAiGeneratedLabel: 'yes' } }),
  })
  assert.equal(res.status, 422)
})

test('PUT /config/settings rejects a made-up timezone name with 422', async () => {
  storedSettings = undefined
  const res = await planningConfig.request('/clients/acme/config/settings', {
    method: 'PUT',
    headers: { Authorization: 'Bearer dash_test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'Not/A_Zone' },
    }),
  })
  assert.equal(res.status, 422)
})

test('PUT /config/settings is forbidden for the agent role', async () => {
  storedSettings = undefined
  const res = await planningConfig.request('/clients/acme/config/settings', {
    method: 'PUT',
    headers: { Authorization: 'Bearer agent_test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' },
    }),
  })
  assert.equal(res.status, 403)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mock } from 'node:test'

// GF-37 timezone follow-up — live click-through by Martin found a real
// PUT /clients/:slug/config/settings 422 when saving a timezone. Root cause
// (confirmed, not guessed): the local dev frontend talks to the REAL
// deployed staging API (`VITE_API_BASE=https://staging.marketing.gfinnov.com`),
// which is still running whatever's on `origin/experimental` — a version
// that predates this branch's `timezone` field entirely (its
// `validateOrgSettings` allowlist is `{showAiGeneratedLabel,
// autoScheduleOnApprove}` only, so any payload carrying `timezone` gets
// rejected by the KEY allowlist check, regardless of the value). That is
// an environment/deployment-lag artifact, not a logic bug in this branch's
// source — verified by diffing `git show origin/experimental:...planningConfig.ts`
// against this branch.
//
// planningConfig.orgSettings.test.ts already covers the route with a
// mocked `orgSettings.js` (a hand-copied `isValidIanaTimezone` mirroring
// the real one). That structurally can't catch a REAL integration gap
// between `planningConfig.ts` and the REAL `orgSettings.ts` module, which
// is exactly the class of bug this file exists to close: it mocks ONLY
// `pb.js` and `audit.js`, so `validateOrgSettings` calls the ACTUAL
// `isValidIanaTimezone`/`loadOrgSettings` from orgSettings.ts, unmocked.

process.env.BOOTSTRAP_TOKENS = 'dash_test:dash:acme,agent_test:agent:acme'

let storedSettings: Record<string, unknown> | undefined

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
            storedSettings = data.settings as Record<string, unknown>
            return data
          },
          update: async (_id: string, data: Record<string, unknown>) => {
            storedSettings = data.settings as Record<string, unknown>
            return data
          },
        }),
      }),
    verifyUserToken: async () => null,
    pb: {},
  },
})

// orgSettings.js is deliberately NOT mocked here.
const { planningConfig } = await import('./planningConfig.js')

async function putSettings(timezone: string) {
  storedSettings = undefined
  return planningConfig.request('/clients/acme/config/settings', {
    method: 'PUT',
    headers: { Authorization: 'Bearer dash_test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone },
    }),
  })
}

// The curated fallback list app-v2/src/routes/client/configuration.tsx ships
// (UTC + the four client regions) — the exact values a real save can send
// when the browser lacks Intl.supportedValuesOf, or when a user picks one of
// the pinned/curated options.
const CURATED = ['UTC', 'Europe/Berlin', 'Europe/Madrid', 'America/Montevideo', 'America/Mexico_City']

for (const tz of CURATED) {
  test(`PUT /config/settings (real orgSettings module) saves the curated timezone "${tz}" without a 422`, async () => {
    const res = await putSettings(tz)
    const body = await res.json()
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.equal(body.data.timezone, tz)
  })
}

// A broader sample from the ~400-entry Intl.supportedValuesOf('timeZone')
// set a real browser offers — proves this isn't just the 5 curated values.
const BROADER_SAMPLE = [
  'Australia/Sydney',
  'Asia/Tokyo',
  'Pacific/Auckland',
  'America/Argentina/Buenos_Aires', // a nested-region IANA name
  'Etc/UTC', // a common alias/link name, not a "real" zone identifier
]

for (const tz of BROADER_SAMPLE) {
  test(`PUT /config/settings (real orgSettings module) saves "${tz}" (broader IANA sample) without a 422`, async () => {
    const res = await putSettings(tz)
    const body = await res.json()
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(body)}`)
    assert.equal(body.data.timezone, tz)
  })
}

test('PUT /config/settings (real orgSettings module) still 422s a genuinely invalid timezone', async () => {
  const res = await putSettings('Not/A_Real_Zone')
  assert.equal(res.status, 422)
})

// The actual reported repro shape: exactly the three-key payload the
// Configuration page's toggle()/saveTimezone() handlers send (full `local`
// state, always all three keys together) — end to end through the real
// validator and the real loadOrgSettings' persistence round trip.
test('PUT /config/settings (real orgSettings module): full save-then-reload round trip for a real client shape', async () => {
  const putRes = await putSettings('Europe/Berlin')
  assert.equal(putRes.status, 200)
  const getRes = await planningConfig.request('/clients/acme/config/settings', {
    headers: { Authorization: 'Bearer dash_test' },
  })
  const getBody = await getRes.json()
  assert.equal(getRes.status, 200)
  assert.deepEqual(getBody.data, {
    showAiGeneratedLabel: true,
    autoScheduleOnApprove: false,
    timezone: 'Europe/Berlin',
  })
})

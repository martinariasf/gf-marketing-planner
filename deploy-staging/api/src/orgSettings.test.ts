import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-37 follow-up, Layer-5 review round 1 finding 7b — direct unit coverage
// for isValidIanaTimezone() and loadOrgSettings()'s coerce() fallback. Until
// now this logic was only exercised indirectly through planningConfig's PUT
// validator (which uses the strict/rejecting side) and never through the
// lenient "stored value is bad, fall back silently" path loadOrgSettings
// itself is documented to guarantee ("NEVER throws into a request path").

let storedRecord: { settings?: unknown } | null = null

mock.module('./pb.js', {
  namedExports: {
    withPb: async (fn: (pb: unknown) => unknown) =>
      fn({
        collection: () => ({
          getFirstListItem: async () => {
            if (!storedRecord) throw new Error('not found')
            return storedRecord
          },
        }),
      }),
  },
})

const { loadOrgSettings, isValidIanaTimezone, DEFAULTS } = await import('./orgSettings.js')

test('isValidIanaTimezone accepts real IANA names', () => {
  assert.equal(isValidIanaTimezone('UTC'), true)
  assert.equal(isValidIanaTimezone('Europe/Berlin'), true)
  assert.equal(isValidIanaTimezone('America/Montevideo'), true)
  assert.equal(isValidIanaTimezone('Australia/Sydney'), true)
})

test('isValidIanaTimezone rejects made-up or malformed input', () => {
  assert.equal(isValidIanaTimezone('Not/A_Zone'), false)
  assert.equal(isValidIanaTimezone(''), false)
  assert.equal(isValidIanaTimezone('   '), false)
  assert.equal(isValidIanaTimezone(undefined), false)
  assert.equal(isValidIanaTimezone(null), false)
  assert.equal(isValidIanaTimezone(42), false)
})

test('loadOrgSettings: no stored record at all -> DEFAULTS, including timezone "UTC"', async () => {
  storedRecord = null
  const settings = await loadOrgSettings('acme')
  assert.deepEqual(settings, DEFAULTS)
  assert.equal(settings.timezone, 'UTC')
})

test('loadOrgSettings: a stored record with a valid custom timezone round-trips it', async () => {
  storedRecord = {
    settings: { showAiGeneratedLabel: false, autoScheduleOnApprove: true, timezone: 'Europe/Madrid' },
  }
  const settings = await loadOrgSettings('acme')
  assert.deepEqual(settings, {
    showAiGeneratedLabel: false,
    autoScheduleOnApprove: true,
    timezone: 'Europe/Madrid',
  })
})

// Layer-5 review round 1, finding 7b — a stored value that fails validation
// (bad data, or a zone this Node's ICU no longer recognizes) must fall back
// to DEFAULTS.timezone, not poison every date comparison for this client by
// handing an invalid string to Intl.DateTimeFormat downstream.
test('loadOrgSettings: a stored INVALID timezone silently falls back to "UTC", not left broken or thrown', async () => {
  storedRecord = {
    settings: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'Definitely/Not_Real' },
  }
  const settings = await loadOrgSettings('acme')
  assert.equal(settings.timezone, 'UTC')
})

test('loadOrgSettings: a stored non-string timezone (e.g. legacy/corrupt data) also falls back to "UTC"', async () => {
  storedRecord = {
    settings: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 12345 },
  }
  const settings = await loadOrgSettings('acme')
  assert.equal(settings.timezone, 'UTC')
})

test('loadOrgSettings never throws — a PB failure of any kind falls back to DEFAULTS', async () => {
  storedRecord = null // getFirstListItem throws 'not found' above
  await assert.doesNotReject(() => loadOrgSettings('does-not-exist'))
})

// GF-104 — openrouterKeyHash / openrouterGuardrailId are optional and absent
// from DEFAULTS; an existing client that has never set them must keep
// loading exactly as before (no new keys appearing, no error).
test('loadOrgSettings: a stored record with neither OpenRouter field set has no such keys on the result', async () => {
  storedRecord = {
    settings: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' },
  }
  const settings = await loadOrgSettings('acme')
  assert.deepEqual(settings, DEFAULTS)
  assert.equal('openrouterKeyHash' in settings, false)
  assert.equal('openrouterGuardrailId' in settings, false)
})

test('loadOrgSettings: a stored record with both OpenRouter fields round-trips them as strings', async () => {
  storedRecord = {
    settings: {
      showAiGeneratedLabel: true,
      autoScheduleOnApprove: false,
      timezone: 'UTC',
      openrouterKeyHash: 'abc123hash',
      openrouterGuardrailId: 'guardrail-42',
    },
  }
  const settings = await loadOrgSettings('acme')
  assert.equal(settings.openrouterKeyHash, 'abc123hash')
  assert.equal(settings.openrouterGuardrailId, 'guardrail-42')
})

test('loadOrgSettings: a non-string OpenRouter field is dropped rather than poisoning the result', async () => {
  storedRecord = {
    settings: {
      showAiGeneratedLabel: true,
      autoScheduleOnApprove: false,
      timezone: 'UTC',
      openrouterKeyHash: 12345,
    },
  }
  const settings = await loadOrgSettings('acme')
  assert.equal('openrouterKeyHash' in settings, false)
})

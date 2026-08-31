import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-92 (A3) — laneOf() must prefer approval.status over top-level status, so
// legacy rows written before A1's status-mirroring fix (top-level `status`
// lagging `approval.status`) still get polled for publish, and still cancel
// their provider job when moved out of the scheduled lane.
//
// `./index.js` can only be mocked once per process (node:test's module mocker
// throws on a second mock.module call for the same specifier), so all three
// cases share one mock and swap behavior through this mutable provider.

class FakeSchedulingError extends Error {
  provider: string
  constructor(provider: string, message: string) {
    super(message)
    this.name = 'SchedulingError'
    this.provider = provider
  }
}

let fakeProvider: {
  name: string
  schedule: (...args: unknown[]) => Promise<never>
  reschedule: (...args: unknown[]) => Promise<never>
  cancel: (jobId: string) => Promise<void>
  getStatus: (jobId: string) => Promise<{ state: string; publishedAt?: string; publicUrl?: string }>
} | null = null

mock.module('./index.js', {
  namedExports: {
    SchedulingError: FakeSchedulingError,
    getSchedulingProvider: async () => fakeProvider,
  },
})

// GF-37 timezone follow-up — applyStatusToSchedule now loads the client's
// configured timezone before checking isPastDate. Default to 'UTC' so every
// pre-existing GF-37 test below (none of which touch timezone) keeps its
// original, unchanged UTC-day behavior. Individual timezone tests overwrite
// this before calling applyStatusToSchedule/isPastDate.
let fakeOrgSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' }

mock.module('../orgSettings.js', {
  namedExports: {
    loadOrgSettings: async () => fakeOrgSettings,
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

const { refreshPublishStatus, applyStatusToSchedule, isPastDate } = await import('./sync.js')

test('refreshPublishStatus polls when approval.status is scheduled but top-level status lags', async () => {
  const getStatus = mock.fn(async () => ({
    state: 'published',
    publishedAt: '2026-08-06T00:00:00Z',
    publicUrl: 'https://x/1',
  }))
  fakeProvider = {
    name: 'postiz',
    schedule: async () => {
      throw new Error('not used')
    },
    reschedule: async () => {
      throw new Error('not used')
    },
    cancel: async () => {},
    getStatus,
  }

  const post = {
    status: 'approved',
    approval: { status: 'scheduled' },
    publishing: { providerJobId: 'x' },
  }
  const result = await refreshPublishStatus('acme', post)
  assert.equal(getStatus.mock.calls.length, 1)
  assert.equal(result?.status, 'published')
  assert.equal((result?.publishing as Record<string, unknown>).publicUrl, 'https://x/1')
})

test('refreshPublishStatus does not poll when neither status nor approval.status is scheduled', async () => {
  const getStatus = mock.fn(async () => ({ state: 'published' }))
  fakeProvider = {
    name: 'postiz',
    schedule: async () => {
      throw new Error('not used')
    },
    reschedule: async () => {
      throw new Error('not used')
    },
    cancel: async () => {},
    getStatus,
  }

  const post = { status: 'approved', approval: { status: 'approved' }, publishing: { providerJobId: 'x' } }
  const result = await refreshPublishStatus('acme', post)
  assert.equal(getStatus.mock.calls.length, 0)
  assert.equal(result, null)
})

test('applyStatusToSchedule cancels the provider job when a legacy row moves out of the scheduled lane', async () => {
  const cancel = mock.fn(async () => {})
  fakeProvider = {
    name: 'postiz',
    schedule: async () => {
      throw new Error('not used')
    },
    reschedule: async () => {
      throw new Error('not used')
    },
    cancel,
    getStatus: async () => ({ state: 'scheduled' }),
  }

  // Legacy shape: top-level status never got mirrored to 'scheduled', only
  // approval.status did — laneOf() must still see this as "in the lane".
  const current = {
    status: 'approved',
    approval: { status: 'scheduled' },
    publishing: { providerJobId: 'x' },
  }
  const result = await applyStatusToSchedule('acme', current, 'approved')
  assert.equal(cancel.mock.calls.length, 1)
  assert.equal(cancel.mock.calls[0].arguments[0], 'x')
  assert.equal((result?.publishing as Record<string, unknown>).providerJobId, null)
  // GF-92 Layer-5 round-2 review, MINOR — the cancel path must mirror the
  // top-level status too, not just clear the publishing sub-object. Without
  // this, viktorOwned.ts's /approvals handler (which only writes
  // patch.status when result.status is truthy) cancels the job but leaves
  // the post's raw `status` stuck at 'scheduled' forever.
  assert.equal(result?.status, 'approved')
})

// GF-92 Layer-5 review, finding 1/2 — acceptance criterion 5: "must never
// write status for a post already published". This covers the exact legacy
// shape the reviewer called out: top-level status still 'approved' but
// approval.status already 'published' (i.e. laneOf() resolves to
// 'published' even though the raw status field does not).
test('applyStatusToSchedule never re-schedules an already-published post (legacy shape)', async () => {
  const schedule = mock.fn(async () => ({ jobId: 'should-not-happen', scheduledFor: 'x' }))
  const reschedule = mock.fn(async () => ({ jobId: 'should-not-happen', scheduledFor: 'x' }))
  fakeProvider = {
    name: 'postiz',
    schedule,
    reschedule,
    cancel: async () => {},
    getStatus: async () => ({ state: 'published' }),
  }

  const current = {
    status: 'approved',
    approval: { status: 'published' },
    publishing: { providerJobId: 'original-job' },
  }
  const result = await applyStatusToSchedule('acme', current, 'scheduled')

  assert.equal(result, null)
  assert.equal(schedule.mock.calls.length, 0)
  assert.equal(reschedule.mock.calls.length, 0)
})

// GF-37 — a date-only value (`YYYY-MM-DD`, which is what the calendar's date
// input writes) has no time-of-day, so it must be judged by calendar day.
// `new Date('2026-06-15')` is UTC midnight, so the old `ts <= Date.now()` test
// rejected a post dated *today* from 00:00 UTC onward: the client said "today,
// allowed", the API answered 422.

function utcDayOffset(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function schedulingFake() {
  const schedule = mock.fn(async () => ({ jobId: 'job-1', scheduledFor: 'x' }))
  fakeProvider = {
    name: 'postiz',
    schedule,
    reschedule: async () => {
      throw new Error('not used')
    },
    cancel: async () => {},
    getStatus: async () => ({ state: 'scheduled' }),
  }
  return schedule
}

test('GF-37: a date-only post dated today is schedulable', async () => {
  fakeOrgSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' }
  const schedule = schedulingFake()
  const current = { status: 'approved', approval: { status: 'approved' }, date: utcDayOffset(0) }
  const result = await applyStatusToSchedule('acme', current, 'scheduled')
  assert.equal(schedule.mock.calls.length, 1)
  assert.equal(result?.status, 'scheduled')
})

test('GF-37: a date-only post dated tomorrow is schedulable', async () => {
  fakeOrgSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' }
  const schedule = schedulingFake()
  const current = { status: 'approved', approval: { status: 'approved' }, date: utcDayOffset(1) }
  await applyStatusToSchedule('acme', current, 'scheduled')
  assert.equal(schedule.mock.calls.length, 1)
})

test('GF-37: a date-only post dated yesterday is rejected', async () => {
  fakeOrgSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' }
  const schedule = schedulingFake()
  const current = { status: 'approved', approval: { status: 'approved' }, date: utcDayOffset(-1) }
  await assert.rejects(
    () => applyStatusToSchedule('acme', current, 'scheduled'),
    (err: Error) => err.name === 'ScheduleRejected' || /past/i.test(err.message),
  )
  assert.equal(schedule.mock.calls.length, 0)
})

test('GF-37: a full-ISO timestamp keeps exact-instant comparison', async () => {
  fakeOrgSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' }
  const schedule = schedulingFake()
  const past = { status: 'approved', approval: { status: 'approved' }, date: '2020-01-01T09:00:00Z' }
  await assert.rejects(() => applyStatusToSchedule('acme', past, 'scheduled'))
  assert.equal(schedule.mock.calls.length, 0)

  const future = new Date(Date.now() + 3600_000).toISOString()
  const ahead = { status: 'approved', approval: { status: 'approved' }, date: future }
  await applyStatusToSchedule('acme', ahead, 'scheduled')
  assert.equal(schedule.mock.calls.length, 1)
})

test('GF-37: a post with no date is still rejected', async () => {
  fakeOrgSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' }
  schedulingFake()
  const current = { status: 'approved', approval: { status: 'approved' } }
  await assert.rejects(() => applyStatusToSchedule('acme', current, 'scheduled'))
})

// ── GF-37 follow-up: per-client timezone ────────────────────────────────────
//
// Both cases below use an EXPLICIT `now` (isPastDate's 4th param) rather than
// the real wall clock, so they are deterministic regardless of when the test
// suite actually runs — and both are constructed so the pre-fix, UTC-only
// comparison gives the WRONG answer while the timezone-aware comparison gives
// the right one.

test('GF-37 timezone: a negative-offset client\'s "today" can already be UTC\'s "tomorrow" — must not be refused', () => {
  // now = 2026-08-31T01:30:00Z. Uruguay has not observed DST since 2015, so
  // America/Montevideo is a fixed UTC-3 year-round: local time at this instant
  // is 2026-08-30T22:30, i.e. Montevideo's real "today" is Aug 30.
  const now = new Date('2026-08-31T01:30:00Z')
  const when = '2026-08-30'
  const ts = new Date(when).getTime()

  // The bug this closes: naive UTC comparison sees "today" as Aug 31 (from
  // `now`), so a post dated Aug 30 reads as PAST and gets wrongly refused —
  // exactly the residual documented in the old isPastDate() docstring.
  assert.equal(isPastDate(when, ts, 'UTC', now), true, 'sanity: naive UTC would (wrongly) reject this')

  // Timezone-aware: Montevideo's actual calendar day for `now` is Aug 30, so
  // a post dated Aug 30 is TODAY for this client, not past — must be allowed.
  assert.equal(isPastDate(when, ts, 'America/Montevideo', now), false)
})

test('GF-37 timezone: a positive-offset client\'s "today" can already be UTC\'s "yesterday" — must not be allowed', () => {
  // now = 2026-08-31T23:30:00Z. Australia/Sydney is AEST (UTC+10, no DST in
  // the southern-hemisphere winter month of August), so local time at this
  // instant is 2026-09-01T09:30 — Sydney's real "today" is Sep 1, and Aug 31
  // (still "today" by UTC's clock) is already YESTERDAY for this client.
  const now = new Date('2026-08-31T23:30:00Z')
  const when = '2026-08-31'
  const ts = new Date(when).getTime()

  // The bug this closes, in the opposite direction: naive UTC comparison
  // sees "today" as Aug 31 (from `now`), so a post genuinely dated yesterday
  // for the client reads as "today" and gets wrongly ALLOWED to schedule.
  assert.equal(isPastDate(when, ts, 'UTC', now), false, 'sanity: naive UTC would (wrongly) allow this')

  // Timezone-aware: Sydney's actual calendar day for `now` is Sep 1, so a
  // post dated Aug 31 is genuinely in the past for this client — must reject.
  assert.equal(isPastDate(when, ts, 'Australia/Sydney', now), true)
})

test('GF-37 timezone: an unset client timezone defaults to UTC end-to-end through applyStatusToSchedule', async () => {
  // No explicit timezone configured (mirrors an existing client's org_configs
  // row with no `settings.timezone` key — loadOrgSettings' DEFAULTS kicks in
  // upstream of this call). Must behave exactly like the pre-timezone code.
  fakeOrgSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' }
  const schedule = schedulingFake()
  const current = { status: 'approved', approval: { status: 'approved' }, date: utcDayOffset(-1) }
  await assert.rejects(() => applyStatusToSchedule('acme', current, 'scheduled'))
  assert.equal(schedule.mock.calls.length, 0)
})

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

const { refreshPublishStatus, applyStatusToSchedule } = await import('./sync.js')

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

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-92 (D) — auto-schedule on approve.
//
// Covers the three POST /clients/:slug/approvals scenarios (human dashboard
// path) plus one PATCH /clients/:slug/posts/:id scenario proving Viktor's
// agent-role path is excluded from auto-scheduling even when the toggle is on.
//
// All PB/scheduling-provider dependencies are mocked via node:test's module
// mocker (each module can only be mocked once per process, so state that
// varies per-test is threaded through mutable closures, mirroring the
// pattern already used in scheduling/sync.test.ts).

process.env.BOOTSTRAP_TOKENS = 'dash_test:dash:acme,agent_test:agent:acme'

class FakeScheduleRejected extends Error {
  status: 422 | 409
  constructor(message: string, status: 422 | 409 = 422) {
    super(message)
    this.name = 'ScheduleRejected'
    this.status = status
  }
}

class FakeSchedulingError extends Error {
  provider: string
  constructor(provider: string, message: string) {
    super(message)
    this.name = 'SchedulingError'
    this.provider = provider
  }
}

let fakeSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false }
let scheduleImpl: (
  slug: string,
  current: Record<string, unknown>,
  nextStatus: string | undefined,
) => Promise<{ status?: string; publishing: Record<string, unknown> } | null> = async (_s, _c, nextStatus) => {
  if (nextStatus === 'scheduled') {
    return { status: 'scheduled', publishing: { provider: 'postiz', providerJobId: 'job-1' } }
  }
  return null
}
const applyStatusToSchedule = mock.fn(
  (slug: string, current: Record<string, unknown>, nextStatus: string | undefined) =>
    scheduleImpl(slug, current, nextStatus),
)

let currentPost: Record<string, unknown> = {
  id: 'p1',
  status: 'in_review',
  date: '2099-01-01T10:00:00Z',
  publishing: {},
}

mock.module('../orgSettings.js', {
  namedExports: {
    loadOrgSettings: async () => ({ ...fakeSettings }),
    DEFAULTS: { showAiGeneratedLabel: true, autoScheduleOnApprove: false },
  },
})
mock.module('../scheduling/sync.js', {
  namedExports: {
    applyStatusToSchedule,
    refreshPublishStatus: async () => null,
    ScheduleRejected: FakeScheduleRejected,
  },
})
mock.module('../scheduling/provider.js', {
  namedExports: { SchedulingError: FakeSchedulingError },
})
mock.module('../posts.js', {
  namedExports: {
    buildPost: async (_slug: string, id: string) => (id === currentPost.id ? { ...currentPost } : null),
    listPostIds: async () => [currentPost.id as string],
    listPosts: async () => [],
    listPostsInRange: async () => [],
    monthKeyOf: () => '',
    normalizeAssetUrl: (_slug: string, v: unknown) => v,
    normalizeImageUrl: (_slug: string, v: unknown) => v,
  },
})
mock.module('../audit.js', {
  namedExports: { audit: async () => {} },
})
const pbCreateCalls: Array<{ collection: string; data: unknown }> = []
mock.module('../pb.js', {
  namedExports: {
    withPb: async (fn: (pb: unknown) => unknown) =>
      fn({
        collection: (name: string) => ({
          create: async (data: unknown) => {
            pbCreateCalls.push({ collection: name, data })
            return data
          },
        }),
      }),
    verifyUserToken: async () => null,
    pb: {},
  },
})

const { viktorOwned } = await import('./viktorOwned.js')

async function postApproval(decision: string, headers: Record<string, string> = { Authorization: 'Bearer dash_test' }) {
  return viktorOwned.request('/clients/acme/approvals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ postId: 'p1', decision }),
  })
}

test('toggle ON + future date + valid provider -> ends scheduled with a provider job id', async () => {
  fakeSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: true }
  currentPost = { id: 'p1', status: 'in_review', date: '2099-01-01T10:00:00Z', publishing: {} }
  scheduleImpl = async (_s, _c, nextStatus) =>
    nextStatus === 'scheduled'
      ? { status: 'scheduled', publishing: { provider: 'postiz', providerJobId: 'job-42' } }
      : null

  const res = await postApproval('approved')
  const body = await res.json()
  assert.equal(res.status, 201)
  assert.equal(body.decision, 'scheduled')
  assert.equal(body.scheduleWarning, undefined)
})

test('toggle ON + past date -> ends approved with a non-fatal scheduleWarning, HTTP 201', async () => {
  fakeSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: true }
  currentPost = { id: 'p1', status: 'in_review', date: '2020-01-01T10:00:00Z', publishing: {} }
  scheduleImpl = async (_s, _c, nextStatus) => {
    if (nextStatus === 'scheduled') {
      throw new FakeScheduleRejected('Cannot schedule a post dated in the past (2020-01-01T10:00:00Z).')
    }
    return null
  }

  const res = await postApproval('approved')
  const body = await res.json()
  assert.equal(res.status, 201)
  assert.equal(body.decision, 'approved')
  assert.match(body.scheduleWarning, /past/)
})

test('toggle OFF -> ends approved, and the scheduling provider is never invoked for the extra auto-schedule attempt', async () => {
  fakeSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false }
  currentPost = { id: 'p1', status: 'in_review', date: '2099-01-01T10:00:00Z', publishing: {} }
  const before = applyStatusToSchedule.mock.calls.length
  scheduleImpl = async (_s, _c, nextStatus) => (nextStatus === 'scheduled' ? { status: 'scheduled', publishing: {} } : null)

  const res = await postApproval('approved')
  const body = await res.json()
  assert.equal(res.status, 201)
  assert.equal(body.decision, 'approved')
  assert.equal(body.scheduleWarning, undefined)
  // Only the ordinary decision-driven call (nextStatus='approved') ran; the
  // toggle being off must skip the extra 'scheduled' attempt entirely.
  const callsAfter = applyStatusToSchedule.mock.calls.slice(before)
  assert.equal(callsAfter.length, 1)
  assert.equal(callsAfter[0]?.arguments[2], 'approved')
})

test('the agent-role PATCH /posts/:id path never auto-schedules, even with the toggle ON', async () => {
  fakeSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: true }
  currentPost = { id: 'p1', status: 'in_review', date: '2099-01-01T10:00:00Z', publishing: {} }
  const before = applyStatusToSchedule.mock.calls.length
  const patchesBefore = pbCreateCalls.length
  scheduleImpl = async () => null

  const res = await viktorOwned.request('/clients/acme/posts/p1', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer agent_test' },
    body: JSON.stringify({ status: 'approved' }),
  })
  assert.equal(res.status, 200)
  // The persisted patch (posts_patches overlay row) carries status:'approved',
  // NOT 'scheduled' — proving this PATCH path (Viktor's agent role) never
  // drives the post into the scheduled lane.
  const persisted = pbCreateCalls.slice(patchesBefore).find((call) => call.collection === 'posts_patches')
  assert.equal((persisted?.data as { patch?: { status?: string } } | undefined)?.patch?.status, 'approved')
  // And the scheduling provider is never asked to move this post to
  // 'scheduled' from this route, even though the toggle is ON — proving the
  // agent path is excluded from the dashboard's auto-schedule-on-approve
  // behavior (that logic lives ONLY in the POST /approvals handler above).
  const callsAfter = applyStatusToSchedule.mock.calls.slice(before)
  assert.ok(callsAfter.every((call) => call.arguments[2] !== 'scheduled'))
})

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

let fakeSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' }
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
    DEFAULTS: { showAiGeneratedLabel: true, autoScheduleOnApprove: false, timezone: 'UTC' },
  },
})
mock.module('../scheduling/sync.js', {
  namedExports: {
    applyStatusToSchedule,
    refreshPublishStatus: async () => null,
    ScheduleRejected: FakeScheduleRejected,
    // GF-92a — laneOf() is exported from sync.ts and used by the approvals
    // route's already-published guard. Mirror its real behavior (prefer
    // approval.status, fall back to status) so that guard exercises real
    // logic against this test's fake posts.
    laneOf: (post: Record<string, unknown>) => {
      const approval = post.approval
      if (approval && typeof approval === 'object') {
        const approvalStatus = (approval as Record<string, unknown>).status
        if (typeof approvalStatus === 'string' && approvalStatus) return approvalStatus
      }
      return String(post.status ?? '')
    },
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
          // No getFullList here — mirrors production's real approvals_v2
          // overlay being empty for a client that has never used the
          // dashboard kanban (e.g. Black Venture Farm): loadApprovalsV2's
          // own try/catch swallows this and returns [].
        }),
      }),
    verifyUserToken: async () => null,
    pb: {},
    // GF-126 — mirror the real pb.js module shape so this mock doesn't
    // silently diverge (requireAuth imports this from '../pb.js').
    PbUnavailableError: class PbUnavailableError extends Error {
      constructor(cause?: unknown) {
        super('PocketBase is unavailable')
        this.name = 'PbUnavailableError'
        if (cause !== undefined) (this as { cause?: unknown }).cause = cause
      }
    },
  },
})

// GF-119 — approvals.log always starts with a `# …` header comment (see
// clients/black-venture-farm/approvals.log, clients/biomas/approvals.log).
// Mock only `approvalsLog`; every other disk.* export stays real since no
// route exercised by this file's other tests reads from disk directly.
let fakeApprovalsLog: string | null = null
const { disk: realDisk } = await import('../diskData.js')
mock.module('../diskData.js', {
  namedExports: {
    disk: {
      ...realDisk,
      approvalsLog: async (_slug: string) => fakeApprovalsLog,
    },
  },
})

const { viktorOwned } = await import('./viktorOwned.js')

async function getApprovals(headers: Record<string, string> = { Authorization: 'Bearer dash_test' }) {
  return viktorOwned.request('/clients/acme/approvals', { headers })
}

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

test('toggle ON + no provider configured -> ends approved with a non-fatal scheduleWarning, HTTP 201', async () => {
  // GF-92 Layer-5 review, finding 5 — the contract explicitly lists "no
  // provider key" as a case that must warn, not 5xx.
  fakeSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: true }
  currentPost = { id: 'p1', status: 'in_review', date: '2099-01-01T10:00:00Z', publishing: {} }
  scheduleImpl = async (_s, _c, nextStatus) => {
    if (nextStatus === 'scheduled') {
      throw new FakeScheduleRejected(
        'No scheduling provider is configured for this client. Add a Postiz API key under Integrations, then try again.',
      )
    }
    return null
  }

  const res = await postApproval('approved')
  const body = await res.json()
  assert.equal(res.status, 201)
  assert.equal(body.decision, 'approved')
  assert.match(body.scheduleWarning, /provider/i)
})

test('toggle ON + provider down (generic Error, not a typed scheduling error) -> ends approved with a non-fatal, user-safe scheduleWarning, HTTP 201', async () => {
  // GF-92 Layer-5 review, finding 1 — "provider down" in practice throws a
  // plain Error / TypeError from a failed fetch, NOT ScheduleRejected or
  // SchedulingError. Auto-schedule failure must never fail the approval,
  // regardless of the error's type, and must never leak a raw error message
  // (e.g. a provider response body or stack trace) to the client.
  fakeSettings = { showAiGeneratedLabel: true, autoScheduleOnApprove: true }
  currentPost = { id: 'p1', status: 'in_review', date: '2099-01-01T10:00:00Z', publishing: {} }
  scheduleImpl = async (_s, _c, nextStatus) => {
    if (nextStatus === 'scheduled') {
      throw new TypeError('fetch failed: ECONNREFUSED 10.0.0.5:443 secret-internal-detail')
    }
    return null
  }

  const res = await postApproval('approved')
  const body = await res.json()
  assert.equal(res.status, 201)
  assert.equal(body.decision, 'approved')
  assert.ok(typeof body.scheduleWarning === 'string' && body.scheduleWarning.length > 0)
  // The raw error message must NOT be forwarded to the client.
  assert.doesNotMatch(body.scheduleWarning, /ECONNREFUSED|secret-internal-detail/)
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

test('GF-119: GET /clients/:slug/approvals skips the approvals.log header comment', async () => {
  // Reproduces the exact Black Venture Farm / Biomas approvals.log shape: a
  // single `# …` header line and nothing else (no decisions made yet).
  fakeApprovalsLog = '# approvals.log - Black Venture Farm. Una linea por decision (approve/reject), agregada por Viktor.\n'

  const res = await getApprovals()
  const body = await res.json()
  assert.equal(res.status, 200)
  // Before the fix this contained a garbage entry parsed from the header
  // line itself: { ts: "#", action: "approvals.log", postId: "-", actor:
  // "Black", source: "log" }. The frontend then called
  // fmtDateTime(entry.ts) -> new Date("#") -> Invalid Date, and
  // Intl.DateTimeFormat#format threw RangeError: Invalid time value,
  // which the app's top-level ErrorBoundary caught and rendered as a
  // generic error screen ("Approvals shows an error").
  assert.deepEqual(body.items, [])
})

test('GF-119: GET /clients/:slug/approvals still returns real log lines alongside a header comment', async () => {
  fakeApprovalsLog = [
    '# approvals.log - Acme. Una linea por decision (approve/reject), agregada por Viktor.',
    '2026-04-01T16:30:00Z  approve  p001  Martin  via=telegram  note="v2 - tightened hook"',
  ].join('\n')

  const res = await getApprovals()
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.items.length, 1)
  assert.equal(body.items[0].ts, '2026-04-01T16:30:00Z')
  assert.equal(body.items[0].action, 'approve')
  assert.equal(body.items[0].postId, 'p001')
  assert.equal(body.items[0].actor, 'Martin')
  assert.equal(body.items[0].note, 'v2 - tightened hook')
})

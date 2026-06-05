import { withPb } from './pb.js'
import { env } from './env.js'

export type AgentJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'recovered'

export interface AgentJobRecord {
  id: string
  slug: string
  thread: string
  source: string
  status: AgentJobStatus
  input?: unknown
  result?: unknown
  error?: unknown
  provider?: string
  providerRunId?: string
  userMessageId?: string
  assistantMessageId?: string
  created?: string
  updated?: string
  completedAt?: string
}

interface HermesRun {
  run_id?: string
  status?: string
  last_event?: string
  output?: string
  error?: unknown
}

const ACTIVE_STATUSES = new Set<AgentJobStatus>(['queued', 'running'])
const WRITE_ACTION_RE = /^(post\.|approval\.|suggestion\.|brief\.|plan\.|goals\.|learnings\.|information_sources\.)/

function nowIso(): string {
  return new Date().toISOString()
}

function fallbackFor(status: AgentJobStatus, hadPlatformWrites: boolean, detail?: string): string {
  if (status === 'completed' || status === 'recovered') {
    if (hadPlatformWrites) {
      return 'I completed the work and updated the dashboard, but did not receive final text from the agent.'
    }
    return 'I finished the run, but the agent did not send a final text reply.'
  }
  if (status === 'timed_out') {
    return 'This request timed out before the agent sent a final reply. Check the dashboard for any partial updates.'
  }
  return `The agent run did not complete cleanly${detail ? `: ${detail}` : '.'}`
}

export async function createDashboardChatJob(args: {
  slug: string
  thread: string
  input: { message: string; history?: unknown }
  userMessageId: string | null
}): Promise<AgentJobRecord> {
  return withPb((pb) =>
    pb.collection('agent_jobs').create<AgentJobRecord>({
      slug: args.slug,
      thread: args.thread,
      source: 'dashboard_chat',
      status: 'queued',
      input: args.input,
      result: null,
      error: null,
      provider: 'hermes',
      providerRunId: '',
      userMessageId: args.userMessageId ?? '',
      assistantMessageId: '',
      completedAt: '',
    }),
  )
}

export async function updateAgentJob(
  id: string | null,
  patch: Partial<Omit<AgentJobRecord, 'id'>>,
): Promise<void> {
  if (!id) return
  try {
    await withPb((pb) =>
      pb.collection('agent_jobs').update(id, {
        ...patch,
      }),
    )
  } catch (err) {
    console.warn('[agentJobs] update failed', { id, err })
  }
}

async function hadPlatformWrites(slug: string, since: string): Promise<boolean> {
  try {
    const records = await withPb((pb) =>
      pb.collection('audit').getList<{ action?: string }>(1, 25, {
        filter: `slug="${slug}" && ts>="${since}"`,
        sort: '-ts',
      }),
    )
    return records.items.some((item) => WRITE_ACTION_RE.test(item.action ?? ''))
  } catch {
    return false
  }
}

export async function finalizeAgentJob(args: {
  jobId: string | null
  slug: string
  thread: string
  status: AgentJobStatus
  output?: string
  error?: unknown
  providerRunId?: string | null
  actor: string
  sawToolActivity?: boolean
}): Promise<string | null> {
  if (!args.jobId) return null
  const completedAt = nowIso()
  return withPb(async (pb) => {
    const job = await pb.collection('agent_jobs').getOne<AgentJobRecord>(args.jobId!)
    if (job.assistantMessageId) {
      await pb.collection('agent_jobs').update(job.id, {
        status: args.status,
        result: args.output ? { output: args.output } : job.result ?? null,
        error: args.error ?? job.error ?? null,
        providerRunId: args.providerRunId ?? job.providerRunId ?? '',
        completedAt: job.completedAt || completedAt,
      })
      return job.assistantMessageId
    }

    const platformWrites = await hadPlatformWrites(args.slug, job.created ?? job.updated ?? completedAt)
    const content =
      args.output?.trim() ||
      fallbackFor(args.status, platformWrites || !!args.sawToolActivity, String(args.error ?? ''))
    const assistant = await pb.collection('chat_messages').create<{ id: string }>({
      slug: args.slug,
      thread: args.thread,
      role: 'assistant',
      content,
      toolEvent: {
        actor: args.actor,
        provider: job.provider || 'hermes',
        runId: args.providerRunId ?? job.providerRunId ?? null,
        jobId: job.id,
        recovered: args.status === 'recovered',
      },
    })
    await pb.collection('agent_jobs').update(job.id, {
      status: args.status,
      result: { output: args.output ?? '', platformWrites },
      error: args.error ?? null,
      assistantMessageId: assistant.id,
      providerRunId: args.providerRunId ?? job.providerRunId ?? '',
      completedAt,
    })
    return assistant.id
  })
}

async function getHermesRun(runId: string): Promise<HermesRun> {
  const res = await fetch(`${env.hermesBaseUrl}/v1/runs/${runId}`, {
    headers: { Authorization: `Bearer ${env.hermesApiKey}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes run ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as HermesRun
}

async function reconcileOnce(): Promise<void> {
  if (!env.hermesApiKey) return
  const jobs = await withPb(async (pb) => {
    const queued = await pb.collection('agent_jobs').getList<AgentJobRecord>(1, 25, {
      filter: 'status="queued" && provider="hermes"',
      sort: 'created',
    })
    const running = await pb.collection('agent_jobs').getList<AgentJobRecord>(1, 25, {
      filter: 'status="running" && provider="hermes"',
      sort: 'created',
    })
    return [...queued.items, ...running.items]
  })
  const now = Date.now()
  for (const job of jobs) {
    if (job.assistantMessageId || !ACTIVE_STATUSES.has(job.status)) continue
    const createdMs = Date.parse(job.created ?? job.updated ?? '')
    const ageMs = Number.isFinite(createdMs) ? now - createdMs : 0
    if (ageMs < 15_000) continue
    if (!job.providerRunId) {
      if (ageMs > 2 * 60_000) {
        await finalizeAgentJob({
          jobId: job.id,
          slug: job.slug,
          thread: job.thread,
          status: 'timed_out',
          error: 'No provider run id was recorded.',
          actor: 'agent-job-reconciler',
        }).catch((err) => console.warn('[agentJobs] queued timeout finalize failed', err))
      }
      continue
    }

    let run: HermesRun
    try {
      run = await getHermesRun(job.providerRunId)
    } catch (err) {
      if (ageMs > 10 * 60_000) {
        await finalizeAgentJob({
          jobId: job.id,
          slug: job.slug,
          thread: job.thread,
          status: 'timed_out',
          error: err instanceof Error ? err.message : err,
          providerRunId: job.providerRunId,
          actor: 'agent-job-reconciler',
        }).catch((finalizeErr) => console.warn('[agentJobs] timeout finalize failed', finalizeErr))
      }
      continue
    }

    await updateAgentJob(job.id, {
      status: run.status === 'completed' ? job.status : 'running',
      result: run.output ? { output: run.output } : job.result,
      error: run.error ?? job.error ?? null,
    })

    if (run.status === 'completed' || run.last_event === 'run.completed') {
      await finalizeAgentJob({
        jobId: job.id,
        slug: job.slug,
        thread: job.thread,
        status: 'recovered',
        output: run.output ?? '',
        providerRunId: job.providerRunId,
        actor: 'agent-job-reconciler',
        sawToolActivity: true,
      }).catch((err) => console.warn('[agentJobs] completed finalize failed', err))
    } else if (run.status === 'failed' || run.last_event === 'run.failed') {
      await finalizeAgentJob({
        jobId: job.id,
        slug: job.slug,
        thread: job.thread,
        status: 'failed',
        error: run.error ?? 'Hermes run failed',
        providerRunId: job.providerRunId,
        actor: 'agent-job-reconciler',
      }).catch((err) => console.warn('[agentJobs] failed finalize failed', err))
    }
  }
}

export function startAgentJobReconciler(): void {
  const run = () => {
    reconcileOnce().catch((err) => console.warn('[agentJobs] reconcile failed', err))
  }
  setTimeout(run, 10_000).unref()
  setInterval(run, 30_000).unref()
}

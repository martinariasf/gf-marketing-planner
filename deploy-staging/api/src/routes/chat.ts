// Chat route — thin SSE proxy to hermes-marketing-staging's built-in OpenAI
// gateway (the `api_server` platform). The same Hermes agent that powers the
// Telegram bot now powers the in-app chat panel: identical model, prompt,
// plugins, and tools.
//
// Flow:
//   1. Browser → POST /api/v1/clients/:slug/chat/stream  (SSE)
//   2. We POST to http://hermes-marketing-staging:8642/v1/runs with the user
//      message + conversation history + a Bearer key.
//   3. Hermes returns { run_id }.
//   4. We open GET /v1/runs/{run_id}/events (SSE) and translate Hermes
//      lifecycle events (`tool.started`, `tool.completed`, `run.completed`,
//      `run.failed`) into our existing wire shape (token / tool_call /
//      tool_result / done / error) so the chat-sheet UI is unchanged.
//
// Hermes does all tool execution server-side. The tools talk to *our* API
// (this same Hono service) via curl using the API_TOKEN env var the
// container ships with. There is no in-process tool implementation anymore.

import { OpenAPIHono } from '@hono/zod-openapi'
import { stream } from 'hono/streaming'
import { withPb } from '../pb.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { env } from '../env.js'
import { problem } from '../problem.js'
import { rateLimit } from '../rateLimit.js'
import {
  createDashboardChatJob,
  finalizeAgentJob,
  updateAgentJob,
} from '../agentJobs.js'

export const chat = new OpenAPIHono<AppEnv>()
chat.use('/clients/:slug/chat/*', rateLimit({ windowMs: 60_000, max: 10 }, 'chat'))
chat.use('*', requireAuth)

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// Chronologically-sortable PocketBase record id (15 chars, [a-z0-9]).
// PocketBase's default ids are random, so `getList(sort: 'id')` returned the
// chat transcript in essentially random order — a just-sent message could
// surface anywhere (or fall past the page limit), making the conversation look
// scrambled or "deleted" on every reload. A fixed-width base36 millisecond
// prefix makes lexical id order match insertion order; a per-ms counter + a few
// random chars disambiguate messages created in the same millisecond.
let _midLastTs = 0
let _midSeq = 0
function mkMsgId(): string {
  const now = Date.now()
  if (now === _midLastTs) _midSeq++
  else {
    _midLastTs = now
    _midSeq = 0
  }
  const ts = now.toString(36).padStart(9, '0').slice(-9) // 9 chars (sortable past year ~5000)
  const seq = _midSeq.toString(36).padStart(2, '0').slice(-2) // 2 chars
  const rnd = Math.random().toString(36).slice(2, 6).padEnd(4, '0') // 4 chars
  return (ts + seq + rnd).slice(0, 15)
}

interface HermesRunEvent {
  event: string
  run_id?: string
  timestamp?: number
  // tool.* fields
  tool?: string
  preview?: string
  duration?: number
  error?: boolean | string
  // run.completed
  output?: string
  usage?: unknown
  // reasoning.available
  text?: string
}

// Open a long-lived SSE GET against Hermes and yield parsed event objects.
async function* hermesRunEvents(
  runId: string,
  signal: AbortSignal,
): AsyncGenerator<HermesRunEvent> {
  const res = await fetch(`${env.hermesBaseUrl}/v1/runs/${runId}/events`, {
    headers: { Authorization: `Bearer ${env.hermesApiKey}`, Accept: 'text/event-stream' },
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`Hermes events ${res.status}: ${text.slice(0, 300)}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let currentEvent = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '')
      if (line === '') {
        currentEvent = ''
        continue
      }
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        const payload = line.slice(5).trim()
        if (!payload) continue
        try {
          const parsed = JSON.parse(payload) as HermesRunEvent
          if (!parsed.event && currentEvent) parsed.event = currentEvent
          yield parsed
        } catch {
          /* skip non-JSON keepalives */
        }
      }
    }
  }
}

chat.post(
  '/clients/:slug/chat/stream',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    let body: {
      thread?: string
      message?: string
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
    }
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const message = (body.message ?? '').trim()
    const thread = (body.thread ?? 'default').slice(0, 100)
    const history = (body.history ?? []).slice(-10)
    if (!message) return problem(c, { title: 'Bad Request', status: 400, detail: 'message required' })
    if (!env.hermesApiKey) {
      return problem(c, {
        title: 'Misconfigured',
        status: 503,
        detail: 'HERMES_API_KEY not set on mp-staging-api — chat proxy disabled',
      })
    }

    const principal = c.get('principal')

    // Persist the user message BEFORE opening the stream, and AWAIT it. The
    // dashboard re-fetches thread history as soon as a turn settles; when this
    // write was fire-and-forget, that reload could race ahead of the un-awaited
    // create and read a snapshot missing the just-sent message — so it appeared
    // "deleted" from the conversation. Awaiting closes that window. A PB hiccup
    // is logged but non-fatal so the chat still proceeds.
    let userMessageId: string | null = null
    try {
      const rec = await withPb((pb) =>
        pb.collection('chat_messages').create({
          id: mkMsgId(),
          slug,
          thread,
          role: 'user',
          content: message,
          toolEvent: null,
        }),
      )
      userMessageId = (rec as { id: string }).id
    } catch (err) {
      console.warn('[chat] persist user msg failed', err)
    }

    const job = await createDashboardChatJob({
      slug,
      thread,
      userMessageId,
      input: { message, history },
    })

    return stream(c, async (s) => {
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache, no-transform')
      c.header('X-Accel-Buffering', 'no')

      // Start the run on Hermes.
      let runId: string | null = null
      let jobStatus: 'running' | 'completed' | 'failed' | 'timed_out' | 'recovered' = 'running'
      let assistantFinalText = ''
      let sawRunCompleted = false
      let sawToolActivity = false
      const toolIds = new Map<string, string>() // tool name -> synthetic id for matching started→completed
      let toolCounter = 0
      const ac = new AbortController()
      // Persistence resilience: we intentionally do NOT abort the Hermes run when
      // the browser disconnects. The run keeps executing server-side on Hermes,
      // so we keep consuming its events until completion and save the assistant
      // reply to chat_messages even if the user navigated away mid-run. Image
      // generation can take ~3 min on the premium model, so a reload during that
      // window used to drop the reply and the turn looked "lost" on return.
      // Writes to the now-closed SSE are swallowed by safeWrite. A hard timeout
      // still bounds a genuinely stuck run so the handler can't linger forever.
      const HARD_TIMEOUT_MS = 6 * 60_000
      const hardTimeout = setTimeout(() => ac.abort(), HARD_TIMEOUT_MS)
      const clientGone = () => c.req.raw.signal?.aborted === true
      const safeWrite = async (data: string) => {
        if (clientGone()) return
        try {
          await s.write(data)
        } catch {
          /* client went away mid-write; keep consuming so we can still persist. */
        }
      }
      // Heartbeat. The premium image model can run ~3 min, during which Hermes
      // emits no JSON events — leaving the SSE connection idle long enough for an
      // intermediary (caddy/LB/browser) to drop it, which surfaced as a spurious
      // "Network error" in the chat. A comment frame (": hb") every 15s keeps the
      // pipe warm; the client parser ignores frames with no event/data.
      const heartbeat = setInterval(() => {
        void safeWrite(': hb\n\n')
      }, 15_000)

      try {
        const runRes = await fetch(`${env.hermesBaseUrl}/v1/runs`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.hermesApiKey}`,
            'Content-Type': 'application/json',
            // Scope long-term memory per client so different slugs don't bleed.
            'X-Hermes-Session-Key': `mp-${slug}-${thread}`,
          },
          body: JSON.stringify({
            input: message,
            conversation_history: history.map((h) => ({ role: h.role, content: h.content })),
          }),
          signal: ac.signal,
        })
        if (!runRes.ok) {
          const text = await runRes.text().catch(() => '')
          throw new Error(`Hermes /v1/runs ${runRes.status}: ${text.slice(0, 300)}`)
        }
        const runJson = (await runRes.json()) as { run_id?: string }
        runId = runJson.run_id ?? null
        if (!runId) throw new Error('Hermes did not return a run_id')
        await updateAgentJob(job.id, {
          status: 'running',
          provider: 'hermes',
          providerRunId: runId,
        })

        for await (const ev of hermesRunEvents(runId, ac.signal)) {
          if (ev.event === 'tool.started') {
            sawToolActivity = true
            void updateAgentJob(job.id, {
              status: 'running',
              result: { sawToolActivity: true, lastEvent: ev.event, tool: ev.tool ?? 'tool' },
            })
            const id = `t${++toolCounter}`
            toolIds.set(ev.tool ?? `tool-${toolCounter}`, id)
            await safeWrite(
              sse('tool_call', {
                id,
                name: ev.tool ?? 'tool',
                arguments: ev.preview ?? '',
              }),
            )
          } else if (ev.event === 'tool.completed') {
            sawToolActivity = true
            void updateAgentJob(job.id, {
              status: 'running',
              result: { sawToolActivity: true, lastEvent: ev.event, tool: ev.tool ?? 'tool' },
            })
            const id = toolIds.get(ev.tool ?? '') ?? `t${++toolCounter}`
            const ok = !ev.error
            await safeWrite(
              sse('tool_result', {
                id,
                name: ev.tool ?? 'tool',
                result: { ok, duration: ev.duration ?? 0 },
              }),
            )
          } else if (ev.event === 'reasoning.available') {
            // Surface as a synthetic "thought" so the UI's existing thoughts
            // collapser picks it up.
            if (ev.text) {
              await safeWrite(sse('tool', { label: ev.text.slice(0, 160), status: 'done' }))
            }
          } else if (ev.event === 'run.completed') {
            sawRunCompleted = true
            jobStatus = 'completed'
            assistantFinalText = ev.output ?? ''
            if (!assistantFinalText.trim() && sawToolActivity) {
              assistantFinalText =
                'I finished the tool work, but Hermes did not send a final text reply. Refresh the dashboard if you do not see the update yet.'
            }
            // Emit the whole final text as one token chunk. The chat-sheet UI
            // already concatenates token events into the assistant bubble.
            if (assistantFinalText) {
              await safeWrite(sse('token', { text: assistantFinalText }))
            }
            break
          } else if (ev.event === 'run.failed') {
            jobStatus = 'failed'
            await safeWrite(sse('error', { detail: String(ev.error ?? 'run failed') }))
            break
          } else if (ev.event === 'run.cancelled') {
            jobStatus = 'failed'
            await safeWrite(sse('error', { detail: 'run cancelled' }))
            break
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown'
        jobStatus = ac.signal.aborted ? 'timed_out' : 'failed'
        await updateAgentJob(job.id, {
          status: jobStatus,
          provider: 'hermes',
          providerRunId: runId ?? '',
          error: { detail },
        })
        await safeWrite(sse('error', { detail }))
      } finally {
        clearTimeout(hardTimeout)
        clearInterval(heartbeat)
      }

      if (!assistantFinalText.trim() && runId && sawToolActivity && !sawRunCompleted) {
        jobStatus = 'recovered'
        assistantFinalText =
          'I saw tool activity for this request, but the Hermes event stream ended before a final reply arrived. Refresh the dashboard if you do not see the update yet.'
        await safeWrite(sse('token', { text: assistantFinalText }))
      }

      // Persist assistant message + emit done. Skip empty replies (a failed or
      // cancelled run, or a hard-timeout) so a reload doesn't surface a blank
      // assistant bubble. A reply that finished server-side after the client
      // left still lands here because we kept consuming events above.
      try {
        const messageId = await finalizeAgentJob({
          jobId: job.id,
          slug,
          thread,
          status: jobStatus,
          output: assistantFinalText,
          error: jobStatus === 'failed' || jobStatus === 'timed_out' ? 'Hermes stream ended without a completed run.' : null,
          providerRunId: runId,
          actor: principal.label ?? principal.token.slice(0, 12),
          sawToolActivity,
        })
        await safeWrite(sse('done', { messageId }))
      } catch (err) {
        console.warn('[chat] persist assistant msg failed', err)
        await safeWrite(sse('done', { messageId: null }))
      }
    })
  },
)

// Session list — distinct threads for a client, newest activity first. Powers
// the dashboard chat's session switcher. We derive a human title from each
// session's opening user message and report last activity + message count.
chat.get('/clients/:slug/chat/threads', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  const rows = await withPb((pb) =>
    pb.collection('chat_messages').getList(1, 500, {
      filter: `slug="${slug}"`,
      sort: '-created',
      fields: 'thread,role,content,created',
    }),
  )
  interface Row { thread: string; role: string; content: string; created: string }
  const byThread = new Map<
    string,
    { thread: string; lastActivity: string; title: string; count: number }
  >()
  for (const row of rows.items as unknown as Row[]) {
    if (!row.thread) continue
    const cur = byThread.get(row.thread)
    if (!cur) {
      byThread.set(row.thread, {
        thread: row.thread,
        lastActivity: row.created, // rows are newest-first, so first seen = latest
        title: row.role === 'user' ? row.content.slice(0, 80) : '',
        count: 1,
      })
    } else {
      cur.count++
      // Newest-first order means the LAST user row we encounter is the oldest —
      // that opening message makes the most intuitive session title.
      if (row.role === 'user') cur.title = row.content.slice(0, 80)
    }
  }
  const items = [...byThread.values()].sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
  return c.json({ items })
})

// Thread history fetch — unchanged.
chat.get('/clients/:slug/chat/messages', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  const thread = c.req.query('thread') ?? 'default'
  const items = await withPb((pb) =>
    // sort:'id' is chronological because we mint time-sortable ids (mkMsgId).
    // 200 keeps a long demo conversation fully visible (was 50, which dropped
    // older turns once a thread grew past the page limit).
    pb.collection('chat_messages').getList(1, 200, {
      filter: `slug="${slug}" && thread="${thread}"`,
      sort: 'created,id',
    }),
  )
  return c.json({ items: items.items })
})

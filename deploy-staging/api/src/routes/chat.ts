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

export const chat = new OpenAPIHono<AppEnv>()
chat.use('/clients/:slug/chat/*', rateLimit({ windowMs: 60_000, max: 10 }, 'chat'))
chat.use('*', requireAuth)

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
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

    // Persist user message immediately so chat history is queryable even if
    // the run errors mid-flight.
    withPb((pb) =>
      pb.collection('chat_messages').create({
        slug,
        thread,
        role: 'user',
        content: message,
        toolEvent: null,
      }),
    ).catch((err) => console.warn('[chat] persist user msg failed', err))

    return stream(c, async (s) => {
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache, no-transform')
      c.header('X-Accel-Buffering', 'no')

      // Start the run on Hermes.
      let runId: string | null = null
      let assistantFinalText = ''
      const toolIds = new Map<string, string>() // tool name -> synthetic id for matching started→completed
      let toolCounter = 0
      const ac = new AbortController()
      // If the client disconnects we want the Hermes event stream to close too.
      const onAbort = () => ac.abort()
      c.req.raw.signal?.addEventListener('abort', onAbort, { once: true })

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

        for await (const ev of hermesRunEvents(runId, ac.signal)) {
          if (ev.event === 'tool.started') {
            const id = `t${++toolCounter}`
            toolIds.set(ev.tool ?? `tool-${toolCounter}`, id)
            await s.write(
              sse('tool_call', {
                id,
                name: ev.tool ?? 'tool',
                arguments: ev.preview ?? '',
              }),
            )
          } else if (ev.event === 'tool.completed') {
            const id = toolIds.get(ev.tool ?? '') ?? `t${++toolCounter}`
            const ok = !ev.error
            await s.write(
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
              await s.write(sse('tool', { label: ev.text.slice(0, 160), status: 'done' }))
            }
          } else if (ev.event === 'run.completed') {
            assistantFinalText = ev.output ?? ''
            // Emit the whole final text as one token chunk. The chat-sheet UI
            // already concatenates token events into the assistant bubble.
            if (assistantFinalText) {
              await s.write(sse('token', { text: assistantFinalText }))
            }
            break
          } else if (ev.event === 'run.failed') {
            await s.write(sse('error', { detail: String(ev.error ?? 'run failed') }))
            break
          } else if (ev.event === 'run.cancelled') {
            await s.write(sse('error', { detail: 'run cancelled' }))
            break
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown'
        await s.write(sse('error', { detail }))
      } finally {
        c.req.raw.signal?.removeEventListener('abort', onAbort)
      }

      // Persist assistant message + emit done.
      try {
        const rec = await withPb((pb) =>
          pb.collection('chat_messages').create({
            slug,
            thread,
            role: 'assistant',
            content: assistantFinalText,
            toolEvent: {
              actor: principal.label ?? principal.token.slice(0, 12),
              runId,
            },
          }),
        )
        await s.write(sse('done', { messageId: (rec as { id: string }).id }))
      } catch (err) {
        console.warn('[chat] persist assistant msg failed', err)
        await s.write(sse('done', { messageId: null }))
      }
    })
  },
)

// Thread history fetch — unchanged.
chat.get('/clients/:slug/chat/messages', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  const thread = c.req.query('thread') ?? 'default'
  const items = await withPb((pb) =>
    pb.collection('chat_messages').getList(1, 50, {
      filter: `slug="${slug}" && thread="${thread}"`,
      sort: 'id',
    }),
  )
  return c.json({ items: items.items })
})

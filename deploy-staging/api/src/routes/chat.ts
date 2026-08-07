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
import { env, resolveHermesAgent, resolveClientLang, type HermesAgent } from '../env.js'
import { problem } from '../problem.js'
import { rateLimit } from '../rateLimit.js'
// `message` is aliased: this route already has a local `message` (the user's
// chat text), so the catalog helper comes in as `localized`.
import { friendlyError, message as localized } from '../agentMessages.js'
import {
  createDashboardChatJob,
  finalizeAgentJob,
  updateAgentJob,
} from '../agentJobs.js'

// GF-68: hard cap on attachments processed per chat turn (matches the
// per-request cap enforced at upload time in routes/chatAttachments.ts).
const MAX_CHAT_ATTACHMENTS = 4

// Served by assetFiles.ts (public, no auth, images only).
function chatAttachmentUrl(slug: string, id: string): string {
  return `/api/v1/clients/${slug}/chat/attachments/${id}/file`
}

// `env.publicApiBase` is documented/configured as an absolute URL that
// already ends in "/api/v1" (see env.ts and docker-compose.yml's
// PUBLIC_API_BASE default). `chatAttachmentUrl()` above also returns a path
// that starts with "/api/v1/...". Concatenating the two verbatim doubles the
// prefix into ".../api/v1/api/v1/..." — a path that matches no route and
// that the agent's own `_internal_api_url()` rewrite (which splits on the
// *first* literal "/api/v1/") would also mis-resolve.
//
// Normalize by stripping a trailing "/api/v1" (with or without slash) off
// the configured base before joining, so the result always has exactly one
// "/api/v1/" segment no matter how PUBLIC_API_BASE happens to be set.
export function publicOrigin(): string {
  return env.publicApiBase.replace(/\/api\/v1\/?$/, '')
}

// Builds the absolute, agent-facing URL for a chat attachment. Guaranteed to
// contain exactly one "/api/v1/" occurrence — see `publicOrigin()` above.
// Exported so tests can assert the real, behavioural output rather than
// grepping chat.ts's source text.
export function chatAttachmentAgentUrl(slug: string, id: string): string {
  return `${publicOrigin()}${chatAttachmentUrl(slug, id)}`
}

// Cross-tenant guard for GF-68 attachments: a `chat_attachments` record
// fetched by id must belong to the SAME client slug as the route being
// called, or a caller authorized for one client could have another client's
// attachment bytes/text injected into a different tenant's agent
// conversation. Extracted to a pure, exported function (rather than an
// inline `if` in the route handler) so it can be exercised with real
// behavioural test cases — two attachment records against two different
// slugs — instead of a source-text regex match.
export interface TenantCheckedAttachment {
  id: string
  slug: string
}
export type AttachmentTenantCheck = { ok: true } | { ok: false; status: 403; detail: string }
export function checkAttachmentTenant(rec: TenantCheckedAttachment, routeSlug: string): AttachmentTenantCheck {
  if (rec.slug !== routeSlug) {
    return {
      ok: false,
      status: 403,
      detail: `Attachment "${rec.id}" does not belong to client "${routeSlug}"`,
    }
  }
  return { ok: true }
}

interface AttachmentForInput {
  id: string
  kind: 'image' | 'document'
  filename: string
  text?: string
}

// Build the transport `input` string sent to Hermes. When there are
// attachments, appends a synthetic "--- ATTACHMENTS ---" block AFTER the
// user's raw message. This block is ONLY added to the payload sent to the
// agent — the chat_messages row persisted above keeps `content` as the raw
// typed text, never this block (see the persist call just above).
function buildAgentInput(message: string, slug: string, attachments: AttachmentForInput[]): string {
  if (attachments.length === 0) return message
  const lines: string[] = ['--- ATTACHMENTS ---']
  attachments.forEach((att, i) => {
    const n = i + 1
    if (att.kind === 'image') {
      const url = chatAttachmentAgentUrl(slug, att.id)
      lines.push(
        `${n}. IMAGE: ${url}`,
        `   (pass this URL directly as a reference_images entry if calling image_generate — do not describe it in words)`,
      )
    } else {
      const text = att.text ?? ''
      lines.push(
        `${n}. DOCUMENT: ${att.filename} (${text.length} characters)`,
        `<<<`,
        text,
        `>>>`,
      )
    }
  })
  const block = lines.join('\n')
  return message ? `${message}\n\n${block}` : block
}

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
  agent: HermesAgent,
): AsyncGenerator<HermesRunEvent> {
  const res = await fetch(`${agent.baseUrl}/v1/runs/${runId}/events`, {
    headers: { Authorization: `Bearer ${agent.apiKey}`, Accept: 'text/event-stream' },
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
    // Route this client's chat to its own Hermes agent if one is configured
    // (HERMES_AGENTS_JSON), else the shared default agent.
    const agent = resolveHermesAgent(slug)
    // Fixed language for this client's NON-LLM messages (quota/failure/fallback
    // notices the model never phrases). GF/biomas = Spanish; default English.
    const lang = resolveClientLang(slug)
    let body: {
      thread?: string
      message?: string
      history?: Array<{ role: 'user' | 'assistant'; content: string }>
      attachments?: Array<{ id: string }>
    }
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const message = (body.message ?? '').trim()
    const thread = (body.thread ?? 'default').slice(0, 100)
    const history = (body.history ?? []).slice(-10)
    // GF-68: only accept text OR at least one attachment (image/document
    // pre-uploaded via /chat/attachments) — an attachment-only turn is valid.
    const requestedAttachmentIds = Array.isArray(body.attachments)
      ? body.attachments.map((a) => a?.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    if (!message && requestedAttachmentIds.length === 0) {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'message or attachments required' })
    }
    if (requestedAttachmentIds.length > MAX_CHAT_ATTACHMENTS) {
      return problem(c, {
        title: 'Bad Request',
        status: 400,
        detail: `Max ${MAX_CHAT_ATTACHMENTS} attachments per message`,
      })
    }

    // Re-read each attachment record and cross-check its `slug` against THIS
    // route's :slug param. Without this guard, a caller authorized for one
    // client could pass another client's attachment id and have its bytes/
    // text injected into a different tenant's agent conversation — a
    // cross-tenant data leak. Reject the whole request rather than silently
    // dropping the mismatched ids, so the caller sees the failure instead of
    // a confusingly attachment-less turn.
    interface ChatAttachmentRecord {
      id: string
      slug: string
      kind: 'image' | 'document'
      file?: string
      filename: string
      mimeType: string
      size: number
      text?: string
    }
    const attachmentRecords: ChatAttachmentRecord[] = []
    for (const id of requestedAttachmentIds) {
      let rec: ChatAttachmentRecord
      try {
        rec = await withPb((pb) => pb.collection('chat_attachments').getOne<ChatAttachmentRecord>(id))
      } catch {
        return problem(c, { title: 'Bad Request', status: 400, detail: `Attachment "${id}" not found` })
      }
      const tenantCheck = checkAttachmentTenant(rec, slug)
      if (!tenantCheck.ok) {
        return problem(c, { title: 'Forbidden', status: tenantCheck.status, detail: tenantCheck.detail })
      }
      attachmentRecords.push(rec)
    }
    if (!agent.apiKey) {
      return problem(c, {
        title: 'Misconfigured',
        status: 503,
        detail: `No Hermes API key configured for "${slug}" — chat proxy disabled`,
      })
    }

    const principal = c.get('principal')

    // Persist the user message BEFORE opening the stream, and AWAIT it. The
    // dashboard re-fetches thread history as soon as a turn settles; when this
    // write was fire-and-forget, that reload could race ahead of the un-awaited
    // create and read a snapshot missing the just-sent message — so it appeared
    // "deleted" from the conversation. Awaiting closes that window. A PB hiccup
    // is logged but non-fatal so the chat still proceeds.
    // GF-68: structured attachment metadata for the historical chat bubble.
    // `content` above stays the user's raw typed text ONLY — this is a
    // separate field, never inlined into content.
    const attachmentsMeta = attachmentRecords.map((rec) => ({
      id: rec.id,
      kind: rec.kind,
      filename: rec.filename,
      mimeType: rec.mimeType,
      size: rec.size,
      ...(rec.kind === 'image' ? { url: chatAttachmentUrl(slug, rec.id) } : {}),
    }))

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
          attachments: attachmentsMeta.length ? attachmentsMeta : null,
        }),
      )
      userMessageId = (rec as { id: string }).id
    } catch (err) {
      console.warn('[chat] persist user msg failed', err)
    }

    // Backfill each chat_attachments record's messageId to point at this
    // message, for later lookup/cleanup. Best-effort — failures here must not
    // block the chat turn.
    if (userMessageId && attachmentRecords.length > 0) {
      for (const rec of attachmentRecords) {
        try {
          await withPb((pb) => pb.collection('chat_attachments').update(rec.id, { messageId: userMessageId }))
        } catch (err) {
          console.warn('[chat] backfill attachment messageId failed', rec.id, err)
        }
      }
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
      // Raw failure text (e.g. a 402 body), kept so the PERSISTED assistant
      // bubble classifies the same way as the live error toast — otherwise a
      // quota failure would degrade to generic copy on reload.
      let failureDetail: string | null = null
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
        const runRes = await fetch(`${agent.baseUrl}/v1/runs`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${agent.apiKey}`,
            'Content-Type': 'application/json',
            // Scope long-term memory per client so different slugs don't bleed.
            'X-Hermes-Session-Key': `mp-${slug}-${thread}`,
          },
          body: JSON.stringify({
            input: buildAgentInput(message, slug, attachmentRecords),
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

        for await (const ev of hermesRunEvents(runId, ac.signal, agent)) {
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
              assistantFinalText = localized('completed_with_writes', lang)
            }
            // Emit the whole final text as one token chunk. The chat-sheet UI
            // already concatenates token events into the assistant bubble.
            if (assistantFinalText) {
              await safeWrite(sse('token', { text: assistantFinalText }))
            }
            break
          } else if (ev.event === 'run.failed') {
            jobStatus = 'failed'
            // Classify the raw provider/Hermes error (often raw English, e.g. a
            // 402 "daily limit exceeded") into a friendly, localized message —
            // the model never sees this text, so only the relay can translate it.
            const raw = typeof ev.error === 'string' ? ev.error : null
            failureDetail = raw
            await safeWrite(sse('error', { detail: friendlyError(raw, lang) }))
            break
          } else if (ev.event === 'run.cancelled') {
            jobStatus = 'failed'
            await safeWrite(sse('error', { detail: localized('run_failed', lang) }))
            break
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown'
        failureDetail = detail
        jobStatus = ac.signal.aborted ? 'timed_out' : 'failed'
        await updateAgentJob(job.id, {
          status: jobStatus,
          provider: 'hermes',
          providerRunId: runId ?? '',
          error: { detail }, // keep the raw error for debugging/audit
        })
        // The user sees a friendly, localized message. A hard-timeout abort gets
        // the timeout copy; everything else is classified (a thrown 402 from the
        // initial /v1/runs POST surfaces here as the Spanish quota notice).
        const userDetail = ac.signal.aborted ? localized('timed_out', lang) : friendlyError(detail, lang)
        await safeWrite(sse('error', { detail: userDetail }))
      } finally {
        clearTimeout(hardTimeout)
        clearInterval(heartbeat)
      }

      if (!assistantFinalText.trim() && runId && sawToolActivity && !sawRunCompleted) {
        jobStatus = 'recovered'
        assistantFinalText = localized('stream_ended', lang)
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
          // Pass the RAW failure text so fallbackFor classifies it (a 402 →
          // clear quota copy) instead of degrading to generic on reload.
          error:
            jobStatus === 'failed' || jobStatus === 'timed_out'
              ? failureDetail ?? 'Hermes stream ended without a completed run.'
              : null,
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

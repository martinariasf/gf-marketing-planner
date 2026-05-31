// Phase 6 — read-only chat endpoint.
//
// POST /api/v1/clients/:slug/chat/stream
//   body: { thread: string, message: string }
//   response: text/event-stream with events:
//     event: tool   data: { label, status }      (synthetic, for UI polish)
//     event: token  data: { text }                (streamed model tokens)
//     event: done   data: { messageId }
//
// We inject brief + plan + recent posts + suggestions into the system prompt
// rather than do an OpenAI tool-use loop. Same result for read-only scope,
// far less surface area. Writes `user` and `assistant` rows to chat_messages.
//
// Auth: dash_* or admin token, scoped to :slug. agent_* tokens are rejected —
// the chatbot is a dashboard feature, not an agent feature.

import { OpenAPIHono } from '@hono/zod-openapi'
import { stream } from 'hono/streaming'
import { withPb } from '../pb.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { disk } from '../diskData.js'
import {
  loadPostPatches,
  loadSuggestionStates,
  latestApprovalByPost,
} from '../overlays.js'
import { env } from '../env.js'
import { problem } from '../problem.js'
import { rateLimit } from '../rateLimit.js'

export const chat = new OpenAPIHono<AppEnv>()
// Strict per-token cap on the chat path — each turn calls OpenRouter, so this
// is the real cost surface. 10/min absorbs a hot demo without bleeding budget.
chat.use('/clients/:slug/chat/*', rateLimit({ windowMs: 60_000, max: 10 }, 'chat'))
chat.use('*', requireAuth)

// ── Helpers ─────────────────────────────────────────────────────────────────

interface Post {
  id: string
  title?: string
  status?: string
  date?: string
  pillar?: string
  channel?: string
}

interface Suggestion {
  id?: string
  title?: string
  status?: string
  rationale?: string
}

async function buildContext(slug: string): Promise<string> {
  const [brief, plan, suggestionsRaw, idx, patches, approvals, sStates] = await Promise.all([
    disk.brief(slug),
    disk.plan(slug),
    disk.suggestions(slug) as Promise<{ items?: Suggestion[] } | null>,
    disk.postsIndex(slug),
    loadPostPatches(slug),
    latestApprovalByPost(slug),
    loadSuggestionStates(slug),
  ])
  const postIds = idx?.posts ?? (await disk.listPostFiles(slug))
  const posts: Post[] = []
  for (const id of postIds.slice(0, 25)) {
    const p = (await disk.post(slug, id)) as Post | null
    if (!p) continue
    const patch = patches.get(id)
    const ap = approvals.get(id)
    posts.push({
      ...p,
      ...(patch as Partial<Post>),
      id,
      status: ap?.decision ?? p.status,
    })
  }

  const suggestions = (suggestionsRaw?.items ?? []).slice(0, 15).map((s) => {
    const st = sStates.get(String(s.id ?? ''))
    return { ...s, status: st?.status ?? s.status }
  })

  const briefSummary = compactJson(brief, 6000)
  const planSummary = compactJson(plan, 6000)
  const postsLine = posts
    .map((p) => `- ${p.id} [${p.status ?? 'idea'}] ${p.date ?? '-'} (${p.channel ?? '?'}/${p.pillar ?? '?'}): ${p.title ?? ''}`)
    .join('\n')
  const suggestionsLine = suggestions
    .map((s) => `- ${s.id} [${s.status ?? 'open'}]: ${s.title ?? ''}`)
    .join('\n')

  return [
    `=== BRIEF (${slug}) ===`,
    briefSummary,
    `=== PLAN ===`,
    planSummary,
    `=== POSTS (most recent ${posts.length}) ===`,
    postsLine || '(none)',
    `=== SUGGESTIONS (${suggestions.length}) ===`,
    suggestionsLine || '(none)',
  ].join('\n\n')
}

function compactJson(v: unknown, max = 4000): string {
  if (!v) return '(empty)'
  const s = JSON.stringify(v, null, 2)
  return s.length > max ? s.slice(0, max) + `\n... (${s.length - max} more chars truncated)` : s
}

const SLASH = {
  '/suggest':
    'Propose 3 next post ideas. For each: one-line angle, target pillar, channel, why it matters now. Be concrete and tied to the brief/plan/recent posts.',
  '/weekly':
    'Write a short weekly summary: what was published, what is waiting on approval, what the agent flagged. End with 1 recommendation for the week ahead.',
  '/sync metrics':
    'Acknowledge that metrics sync is a Phase 7 capability — list which metrics you would pull (engagement, reach, conversion) and from where.',
  '/draft':
    'Draft a short LinkedIn post on the topic given by the user after /draft. Keep tone consistent with the brief. 4-6 lines, German if the brief is German, English otherwise.',
} as const

function interpretSlash(message: string): { instruction: string; userVisible: string } | null {
  const trimmed = message.trim()
  for (const [cmd, instr] of Object.entries(SLASH)) {
    if (trimmed === cmd || trimmed.startsWith(cmd + ' ')) {
      return { instruction: instr, userVisible: trimmed }
    }
  }
  return null
}

// ── SSE primitives ──────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ── OpenRouter streaming ────────────────────────────────────────────────────

interface OrChunk {
  choices?: Array<{ delta?: { content?: string } }>
}

async function* streamOpenRouter(args: {
  apiKey: string
  model: string
  system: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  user: string
}): AsyncGenerator<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://staging.marketing.gfinnov.com',
      'X-Title': 'Marketing Planner staging chat',
    },
    body: JSON.stringify({
      model: args.model,
      stream: true,
      messages: [
        { role: 'system', content: args.system },
        ...args.history,
        { role: 'user', content: args.user },
      ],
    }),
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300)}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const j = JSON.parse(payload) as OrChunk
        const delta = j.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // ignore comment/keepalive lines
      }
    }
  }
}

// ── Route ───────────────────────────────────────────────────────────────────

chat.post(
  '/clients/:slug/chat/stream',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    let body: { thread?: string; message?: string; history?: Array<{ role: 'user' | 'assistant'; content: string }> }
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const message = (body.message ?? '').trim()
    const thread = (body.thread ?? 'default').slice(0, 100)
    const history = (body.history ?? []).slice(-10)
    if (!message) {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'message required' })
    }
    if (!env.openrouterApiKey) {
      return problem(c, {
        title: 'Misconfigured',
        status: 503,
        detail: 'OPENROUTER_API_KEY not set on mp-staging-api',
      })
    }

    const principal = c.get('principal')
    const actor = principal.label ?? principal.token.slice(0, 12)
    const slash = interpretSlash(message)

    // Persist user message immediately (best-effort).
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
      s.onAbort(() => {
        // Client closed — let the generator GC naturally.
      })
      // SSE headers
      c.header('Content-Type', 'text/event-stream')
      c.header('Cache-Control', 'no-cache, no-transform')
      c.header('X-Accel-Buffering', 'no')

      try {
        await s.write(sse('tool', { label: 'Reading brief.json', status: 'start' }))
        await s.write(sse('tool', { label: 'Reading plan.json', status: 'start' }))
        await s.write(sse('tool', { label: 'Scanning posts + suggestions', status: 'start' }))
        const context = await buildContext(slug)
        await s.write(sse('tool', { label: 'Context ready', status: 'done' }))

        const systemBase = [
          `You are the Marketing Planner staging chatbot for client "${slug}".`,
          `You are READ-ONLY. You can read brief/plan/posts/suggestions and reason about them, but you cannot edit anything — refer the user to Viktor on Telegram (or the dashboard kanban) for any actual changes.`,
          `Keep answers tight. Cite post IDs (e.g. p014) when relevant. Match the language of the brief.`,
          `Today is ${new Date().toISOString().slice(0, 10)}.`,
          ``,
          context,
        ].join('\n')

        const systemPrompt = slash
          ? `${systemBase}\n\n=== SLASH COMMAND ===\nThe user invoked ${slash.userVisible}. Follow this instruction: ${SLASH[slash.userVisible.split(' ')[0] as keyof typeof SLASH] ?? slash.instruction}`
          : systemBase

        let assistantText = ''
        for await (const tok of streamOpenRouter({
          apiKey: env.openrouterApiKey,
          model: env.chatModel,
          system: systemPrompt,
          history,
          user: message,
        })) {
          assistantText += tok
          await s.write(sse('token', { text: tok }))
        }

        // Persist assistant message.
        try {
          const rec = await withPb((pb) =>
            pb.collection('chat_messages').create({
              slug,
              thread,
              role: 'assistant',
              content: assistantText,
              toolEvent: { actor },
            }),
          )
          await s.write(sse('done', { messageId: (rec as { id: string }).id }))
        } catch (err) {
          console.warn('[chat] persist assistant msg failed', err)
          await s.write(sse('done', { messageId: null }))
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown'
        await s.write(sse('error', { detail }))
      }
    })
  },
)

// ── Thread history fetch ────────────────────────────────────────────────────

chat.get('/clients/:slug/chat/messages', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  const thread = c.req.query('thread') ?? 'default'
  // PB v0.38 base collections don't auto-create a `created` field; sort on
  // id which is monotonic enough for chat order.
  const items = await withPb((pb) =>
    pb.collection('chat_messages').getList(1, 50, {
      filter: `slug="${slug}" && thread="${thread}"`,
      sort: 'id',
    }),
  )
  return c.json({ items: items.items })
})

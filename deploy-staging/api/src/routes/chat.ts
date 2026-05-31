// Phase 6 + agentic upgrade — POST /api/v1/clients/:slug/chat/stream.
//
// Real OpenAI-style tool-use loop against OpenRouter:
//   1. Send (system + history + user) with `tools: [...]` to OpenRouter
//   2. Stream the response back as SSE `token` events
//   3. If the assistant emitted `tool_calls`, run them locally against our
//      own API routes (no HTTP hop), emit `tool_call` + `tool_result` events,
//      append a `tool` message and loop.
//   4. When the assistant returns text without tool_calls, emit `done`.
//
// Tools (read + write parity with the Telegram bot, minus brief/plan rewrites):
//
//   read_brief           read_plan         read_posts        read_suggestions
//   set_approval(...)    patch_post(...)   patch_suggestion(...)
//
// Writes use the same audit pipeline as the dashboard kanban / drawer, so
// every chat-driven action shows up in the Recent Activity feed.
//
// Auth: dash_* or admin token. We deliberately keep brief/plan/goals/learnings
// PUT off the tool list — the LLM can read them but not rewrite strategy
// docs. Phase 8 work if needed.

import { OpenAPIHono } from '@hono/zod-openapi'
import { stream } from 'hono/streaming'
import { withPb } from '../pb.js'
import { requireAuth, requireRole, requireScope, type AppEnv, type TokenPrincipal } from '../auth.js'
import { audit } from '../audit.js'
import { disk } from '../diskData.js'
import {
  loadPostPatches,
  loadSuggestionStates,
  loadApprovalsV2,
  latestApprovalByPost,
} from '../overlays.js'
import { env } from '../env.js'
import { problem } from '../problem.js'
import { rateLimit } from '../rateLimit.js'

export const chat = new OpenAPIHono<AppEnv>()
chat.use('/clients/:slug/chat/*', rateLimit({ windowMs: 60_000, max: 10 }, 'chat'))
chat.use('*', requireAuth)

// ── Tool implementations (call our own routes' logic directly) ──────────────

interface PostShape {
  id: string
  title?: string
  copy?: string
  date?: string
  status?: string
  pillar?: string
  channel?: string
  approval?: { status?: string }
}

async function readPosts(slug: string, limit = 30): Promise<PostShape[]> {
  const idx = await disk.postsIndex(slug)
  const ids = idx?.posts ?? (await disk.listPostFiles(slug))
  const patches = await loadPostPatches(slug)
  const approvals = await latestApprovalByPost(slug)
  const out: PostShape[] = []
  for (const id of ids.slice(0, limit)) {
    const base = (await disk.post(slug, id)) as PostShape | null
    if (!base) continue
    const patch = patches.get(id) ?? {}
    const ap = approvals.get(id)
    out.push({
      ...base,
      ...patch,
      id,
      status: ap?.decision ?? base.status,
    })
  }
  return out
}

async function readSuggestions(slug: string): Promise<Array<Record<string, unknown>>> {
  const raw = (await disk.suggestions(slug)) as { items?: Array<Record<string, unknown>> } | null
  const items = raw?.items ?? []
  const states = await loadSuggestionStates(slug)
  return items.map((it) => {
    const id = String(it.id ?? '')
    const st = states.get(id)
    return { ...it, ...(st?.status ? { status: st.status } : {}) }
  })
}

async function toolSetApproval(
  principal: TokenPrincipal,
  slug: string,
  args: { postId: string; decision: string; note?: string },
): Promise<{ ok: boolean; detail?: string }> {
  const allowed = new Set(['in_review', 'approved', 'scheduled', 'rejected'])
  if (!args.postId || !allowed.has(args.decision)) {
    return { ok: false, detail: 'decision must be in_review|approved|scheduled|rejected' }
  }
  const row = {
    slug,
    postId: args.postId,
    decision: args.decision,
    note: args.note ?? '',
    actor: principal.label ?? principal.token.slice(0, 12),
    ts: new Date().toISOString(),
  }
  await withPb((pb) => pb.collection('approvals_v2').create(row))
  await audit(principal, {
    action: 'approval.decide',
    slug,
    resourceId: args.postId,
    after: { decision: args.decision, note: args.note, via: 'chat' },
  })
  return { ok: true }
}

async function toolPatchPost(
  principal: TokenPrincipal,
  slug: string,
  args: { postId: string; title?: string; copy?: string; date?: string },
): Promise<{ ok: boolean; detail?: string }> {
  if (!args.postId) return { ok: false, detail: 'postId required' }
  const patch: Record<string, unknown> = {}
  if (typeof args.title === 'string') patch.title = args.title
  if (typeof args.copy === 'string') patch.copy = args.copy
  if (typeof args.date === 'string') patch.date = args.date
  if (Object.keys(patch).length === 0) {
    return { ok: false, detail: 'provide at least one of title, copy, date' }
  }
  await withPb((pb) =>
    pb.collection('posts_patches').create({
      slug,
      postId: args.postId,
      patch,
      ts: new Date().toISOString(),
      actor: principal.label ?? principal.token.slice(0, 12),
    }),
  )
  await audit(principal, {
    action: 'post.patch',
    slug,
    resourceId: args.postId,
    after: { ...patch, via: 'chat' },
  })
  return { ok: true }
}

async function toolPatchSuggestion(
  principal: TokenPrincipal,
  slug: string,
  args: { suggestionId: string; status?: string; priority?: number; reason?: string },
): Promise<{ ok: boolean; detail?: string }> {
  if (!args.suggestionId) return { ok: false, detail: 'suggestionId required' }
  const payload = {
    slug,
    suggestionId: args.suggestionId,
    status: args.status ?? '',
    priority: typeof args.priority === 'number' ? args.priority : null,
    reason: args.reason ?? '',
    ts: new Date().toISOString(),
    actor: principal.label ?? principal.token.slice(0, 12),
  }
  await withPb(async (pb) => {
    try {
      const existing = await pb
        .collection('suggestion_states')
        .getFirstListItem<{ id: string }>(`slug="${slug}" && suggestionId="${args.suggestionId}"`)
      await pb.collection('suggestion_states').update(existing.id, payload)
    } catch {
      await pb.collection('suggestion_states').create(payload)
    }
  })
  await audit(principal, {
    action: 'suggestion.update',
    slug,
    resourceId: args.suggestionId,
    after: { ...args, via: 'chat' },
  })
  return { ok: true }
}

// ── Tool schema (OpenAI function-call format) ───────────────────────────────

const tools = [
  {
    type: 'function',
    function: {
      name: 'read_brief',
      description: 'Read the client brief (positioning, audience, voice, etc.). Use whenever the user asks about strategy, tone, or who the client is.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_plan',
      description: 'Read the quarterly content plan (pillars, themes, cadence).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_posts',
      description: 'List the most recent posts with their status, pillar, channel and title. Returns up to 30.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_post',
      description: 'Read a single post in full (title, copy, date, status). Use before editing.',
      parameters: {
        type: 'object',
        properties: { postId: { type: 'string' } },
        required: ['postId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_suggestions',
      description: 'Read open AI suggestions for new posts/themes.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_approval',
      description: 'Move a post into in_review | approved | scheduled | rejected. Equivalent to the Telegram bot commands `approve p014`, `reject p014`, etc. Writes to approvals_v2 and audit. Confirm with the user first only if they were not explicit.',
      parameters: {
        type: 'object',
        properties: {
          postId: { type: 'string', description: 'e.g. p014' },
          decision: { type: 'string', enum: ['in_review', 'approved', 'scheduled', 'rejected'] },
          note: { type: 'string', description: 'optional reason; recommended on reject' },
        },
        required: ['postId', 'decision'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_post',
      description: 'Edit a post — set any of title, copy, date. Stored in posts_patches overlay (the agent\'s on-disk JSON is untouched).',
      parameters: {
        type: 'object',
        properties: {
          postId: { type: 'string' },
          title: { type: 'string' },
          copy: { type: 'string' },
          date: { type: 'string', description: 'ISO date YYYY-MM-DD' },
        },
        required: ['postId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'patch_suggestion',
      description: 'Accept, dismiss or reprioritize a suggestion.',
      parameters: {
        type: 'object',
        properties: {
          suggestionId: { type: 'string' },
          status: { type: 'string', enum: ['open', 'accepted', 'dismissed'] },
          priority: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['suggestionId'],
      },
    },
  },
] as const

type ToolName =
  | 'read_brief'
  | 'read_plan'
  | 'read_posts'
  | 'read_post'
  | 'read_suggestions'
  | 'set_approval'
  | 'patch_post'
  | 'patch_suggestion'

async function runTool(
  name: ToolName,
  rawArgs: string,
  ctx: { principal: TokenPrincipal; slug: string },
): Promise<unknown> {
  let args: Record<string, unknown> = {}
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {}
  } catch {
    return { ok: false, detail: `invalid JSON arguments: ${rawArgs.slice(0, 200)}` }
  }
  switch (name) {
    case 'read_brief':
      return (await disk.brief(ctx.slug)) ?? { empty: true }
    case 'read_plan':
      return (await disk.plan(ctx.slug)) ?? { empty: true }
    case 'read_posts':
      return { items: await readPosts(ctx.slug) }
    case 'read_post': {
      const id = String(args.postId ?? '')
      if (!id) return { ok: false, detail: 'postId required' }
      const all = await readPosts(ctx.slug, 100)
      const p = all.find((q) => q.id === id)
      return p ?? { ok: false, detail: 'not found' }
    }
    case 'read_suggestions':
      return { items: await readSuggestions(ctx.slug) }
    case 'set_approval':
      return toolSetApproval(ctx.principal, ctx.slug, {
        postId: String(args.postId ?? ''),
        decision: String(args.decision ?? ''),
        note: typeof args.note === 'string' ? args.note : undefined,
      })
    case 'patch_post':
      return toolPatchPost(ctx.principal, ctx.slug, {
        postId: String(args.postId ?? ''),
        title: typeof args.title === 'string' ? args.title : undefined,
        copy: typeof args.copy === 'string' ? args.copy : undefined,
        date: typeof args.date === 'string' ? args.date : undefined,
      })
    case 'patch_suggestion':
      return toolPatchSuggestion(ctx.principal, ctx.slug, {
        suggestionId: String(args.suggestionId ?? ''),
        status: typeof args.status === 'string' ? args.status : undefined,
        priority: typeof args.priority === 'number' ? args.priority : undefined,
        reason: typeof args.reason === 'string' ? args.reason : undefined,
      })
  }
}

// ── SSE ─────────────────────────────────────────────────────────────────────

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

// ── OpenRouter streaming with tool-call collection ──────────────────────────

interface OrChunk {
  choices?: Array<{
    delta?: {
      content?: string
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    finish_reason?: string
  }>
}

interface CollectedToolCall {
  id: string
  name: string
  arguments: string
}

interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

async function streamModelTurn(args: {
  apiKey: string
  model: string
  messages: ChatMsg[]
  onToken: (t: string) => Promise<void>
}): Promise<{ text: string; toolCalls: CollectedToolCall[] }> {
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
      messages: args.messages,
      tools,
      tool_choice: 'auto',
    }),
  })
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${t.slice(0, 300)}`)
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let text = ''
  // Tool calls stream as deltas (index-keyed) per OpenAI's spec.
  const partial: Record<number, { id: string; name: string; arguments: string }> = {}
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
      if (payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload) as OrChunk
        const delta = j.choices?.[0]?.delta
        if (delta?.content) {
          text += delta.content
          await args.onToken(delta.content)
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            const cur = partial[idx] ?? { id: '', name: '', arguments: '' }
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) cur.name = tc.function.name
            if (tc.function?.arguments) cur.arguments += tc.function.arguments
            partial[idx] = cur
          }
        }
      } catch {
        // ignore non-JSON keepalives
      }
    }
  }
  const toolCalls = Object.values(partial).filter((c) => c.name)
  return { text, toolCalls }
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
    if (!message) return problem(c, { title: 'Bad Request', status: 400, detail: 'message required' })
    if (!env.openrouterApiKey) {
      return problem(c, {
        title: 'Misconfigured',
        status: 503,
        detail: 'OPENROUTER_API_KEY not set on mp-staging-api',
      })
    }

    const principal = c.get('principal')

    // Persist user message immediately.
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

      const systemPrompt = [
        `You are the Marketing Planner staging assistant for client "${slug}".`,
        `You have READ tools (read_brief, read_plan, read_posts, read_post, read_suggestions) and WRITE tools (set_approval, patch_post, patch_suggestion).`,
        `Match the Telegram bot's UX: when the user says "approve p014" or "reject p015 it's off-brand", call set_approval directly — do NOT ask for confirmation. The audit log catches everything; undo is just another command.`,
        `Cite post IDs (e.g. p014) in your answers. Match the brief's language.`,
        `When proposing edits or new drafts, briefly read the brief first if you have not already this session.`,
        `Today is ${new Date().toISOString().slice(0, 10)}.`,
      ].join(' ')

      const messages: ChatMsg[] = [
        { role: 'system', content: systemPrompt },
        ...history.map((h) => ({ role: h.role, content: h.content })),
        { role: 'user', content: message },
      ]

      let assistantFinalText = ''
      let safety = 0
      try {
        // Loop until the model returns no more tool calls (or a safety cap).
        while (safety++ < 6) {
          const turn = await streamModelTurn({
            apiKey: env.openrouterApiKey,
            model: env.chatModel,
            messages,
            onToken: async (t) => {
              await s.write(sse('token', { text: t }))
            },
          })

          if (turn.toolCalls.length === 0) {
            assistantFinalText = turn.text
            break
          }

          // Push the assistant's tool_call message into history.
          messages.push({
            role: 'assistant',
            content: turn.text || null,
            tool_calls: turn.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments },
            })),
          })

          // Execute each tool, emit events, append tool result messages.
          for (const tc of turn.toolCalls) {
            await s.write(
              sse('tool_call', {
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
              }),
            )
            let result: unknown
            try {
              result = await runTool(tc.name as ToolName, tc.arguments, {
                principal,
                slug,
              })
            } catch (err) {
              result = { ok: false, detail: err instanceof Error ? err.message : 'tool error' }
            }
            await s.write(sse('tool_result', { id: tc.id, name: tc.name, result }))
            messages.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.name,
              content: JSON.stringify(result),
            })
          }
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown'
        await s.write(sse('error', { detail }))
      }

      try {
        const rec = await withPb((pb) =>
          pb.collection('chat_messages').create({
            slug,
            thread,
            role: 'assistant',
            content: assistantFinalText,
            toolEvent: { actor: principal.label ?? principal.token.slice(0, 12) },
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

// ── Thread history fetch ────────────────────────────────────────────────────

chat.get('/clients/:slug/chat/messages', requireScope(), requireRole('dash', 'admin'), async (c) => {
  const slug = c.req.param('slug')
  const thread = c.req.query('thread') ?? 'default'
  // PB v0.38 base collections have no auto `created` — sort on id.
  const items = await withPb((pb) =>
    pb.collection('chat_messages').getList(1, 50, {
      filter: `slug="${slug}" && thread="${thread}"`,
      sort: 'id',
    }),
  )
  return c.json({ items: items.items })
})

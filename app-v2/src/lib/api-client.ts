/**
 * Phase 3 dashboard data layer — calls the staging REST API at /api/v1/*.
 *
 * Enabled when `VITE_API_BASE` is set at build time. The dashboard ships a
 * `VITE_API_TOKEN` bearer token (a dash_* admin scope) — for staging this is
 * acceptable because the whole site is behind basicauth at the edge.
 * Phase 7 will replace the build-time token with a runtime basicauth→token
 * exchange.
 */

import type {
  Brief,
  Plan,
  Goals,
  Learnings,
  ClientIndex,
  ClientIndexEntry,
  Performance,
  Post,
  ApprovalLogEntry,
  AssetsManifest,
  Suggestions,
} from '@/types'
import { normalizePost } from '@/lib/normalize-post'

const API_BASE = import.meta.env.VITE_API_BASE as string | undefined
// Build-time fallback for local dev / CI smoke tests. In production it's empty
// and the SPA exchanges its basicauth session for a runtime token at boot.
const API_TOKEN_FALLBACK = import.meta.env.VITE_API_TOKEN as string | undefined

export const isApiEnabled = !!API_BASE

// Phase 7: runtime token, populated by ensureApiToken() at app boot. Held in
// sessionStorage so refresh keeps the same token (cheaper than re-exchanging
// on every tab focus) but new tabs / new sessions get fresh ones.
const STORAGE_KEY = 'mp.dashToken'
let runtimeToken: string | null = null

function loadToken(): string | null {
  if (runtimeToken) return runtimeToken
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as { token: string; expiresAt: string }
      if (Date.parse(parsed.expiresAt) > Date.now() + 60_000) {
        runtimeToken = parsed.token
        return runtimeToken
      }
      sessionStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    // ignore parse errors
  }
  return null
}

function saveToken(token: string, expiresAt: string): void {
  runtimeToken = token
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ token, expiresAt }))
  } catch {
    // sessionStorage may be unavailable (private mode); fall back to memory only
  }
}

function clearToken(): void {
  runtimeToken = null
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Trade the active basicauth session for a short-lived dash_* token.
 * Idempotent and cached — safe to call from app boot and on 401 retries.
 */
export class ApiAuthError extends Error {
  status: number
  hint: string
  constructor(status: number, hint: string) {
    super(`Auth exchange failed: ${status} (${hint})`)
    this.status = status
    this.hint = hint
  }
}

export async function ensureApiToken(force = false): Promise<string | null> {
  if (!API_BASE) return null
  if (force) clearToken()
  const cached = loadToken()
  if (cached) return cached
  let res: Response
  try {
    res = await fetch(`${API_BASE}/auth/exchange`, {
      credentials: 'include',
      cache: 'no-store',
    })
  } catch (err) {
    console.warn('[api] /auth/exchange network error', err)
    if (API_TOKEN_FALLBACK) return API_TOKEN_FALLBACK
    throw new ApiAuthError(0, 'network error reaching /auth/exchange')
  }
  if (!res.ok) {
    console.warn('[api] /auth/exchange returned', res.status, res.statusText)
    if (API_TOKEN_FALLBACK) return API_TOKEN_FALLBACK
    const hint =
      res.status === 401
        ? 'browser basicauth credentials were not auto-attached. Try a hard refresh (Ctrl+Shift+R), then re-enter the basicauth prompt.'
        : `unexpected ${res.status} ${res.statusText}`
    throw new ApiAuthError(res.status, hint)
  }
  const data = (await res.json()) as { token: string; expiresAt: string }
  saveToken(data.token, data.expiresAt)
  return data.token
}

function currentToken(): string | undefined {
  return loadToken() ?? API_TOKEN_FALLBACK ?? undefined
}

function authHeaders(extra: Record<string, string> = {}): HeadersInit {
  const h: Record<string, string> = { ...extra }
  const t = currentToken()
  if (t) h.Authorization = `Bearer ${t}`
  return h
}

// Wraps a fetch so a 401 (the api forgot our ephemeral token across a
// restart) triggers exactly one forced re-exchange + retry. Anything else
// surfaces normally so callers can show the real error.
async function authedFetch(
  path: string,
  init: RequestInit,
  retried = false,
): Promise<Response> {
  await ensureApiToken(retried)
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...authHeaders() },
  })
  if (res.status === 401 && !retried) {
    console.warn('[api] 401, re-exchanging token and retrying', path)
    return authedFetch(path, init, true)
  }
  return res
}

async function apiGet<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE not set')
  const res = await authedFetch(path, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

async function apiSend<T>(method: 'PUT' | 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE not set')
  const res = await authedFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function apiLoadBrief(slug: string): Promise<Brief> {
  const r = await apiGet<{ data: Brief }>(`/clients/${slug}/brief`)
  return r.data
}

export async function apiLoadPlan(slug: string): Promise<Plan> {
  const r = await apiGet<{ data: Plan }>(`/clients/${slug}/plan`)
  return r.data
}

export async function apiLoadGoals(slug: string): Promise<Goals> {
  const r = await apiGet<{ data: Goals }>(`/clients/${slug}/goals`)
  return r.data
}

export async function apiLoadLearnings(slug: string): Promise<Learnings | null> {
  try {
    const r = await apiGet<{ data: Learnings | null }>(`/clients/${slug}/learnings`)
    return r.data
  } catch {
    return null
  }
}

export async function apiLoadClientIndex(): Promise<ClientIndex> {
  // Intentionally NOT swallowing: an empty list here used to render
  // "No clients yet. Add one by creating clients/<slug>/brief.json…",
  // which masked real auth failures (e.g. /auth/exchange returning 401
  // because the basicauth creds weren't auto-attached). Let the caller
  // see the error message — the home page already renders it.
  const r = await apiGet<{ items: ClientIndexEntry[] }>(`/clients`)
  return { clients: r.items.map((c) => ({ ...c, status: c.status || 'active' })) }
}

export async function apiLoadPerformance(slug: string): Promise<Performance | null> {
  try {
    return await apiGet<Performance>(`/clients/${slug}/performance`)
  } catch {
    return null
  }
}

export async function apiLoadPosts(slug: string): Promise<Post[]> {
  try {
    const r = await apiGet<{ items: unknown[] }>(`/clients/${slug}/posts`)
    return (r.items ?? []).map(normalizePost)
  } catch {
    return []
  }
}

export async function apiLoadSuggestions(slug: string): Promise<Suggestions | null> {
  try {
    return await apiGet<Suggestions>(`/clients/${slug}/suggestions`)
  } catch {
    return null
  }
}

export async function apiLoadAssetsManifest(slug: string): Promise<AssetsManifest | null> {
  try {
    return await apiGet<AssetsManifest>(`/clients/${slug}/assets/manifest`)
  } catch {
    return null
  }
}

export async function apiLoadApprovals(slug: string): Promise<ApprovalLogEntry[]> {
  try {
    const r = await apiGet<{ items: ApprovalLogEntry[] }>(`/clients/${slug}/approvals`)
    return r.items
  } catch {
    return []
  }
}

// ── Writes (user-owned) ──────────────────────────────────────────────────────

const FILE_TO_PATH: Record<string, string> = {
  brief: 'brief',
  plan: 'plan',
  goals: 'goals',
  learnings: 'learnings',
}

export async function apiSave(slug: string, file: string, data: unknown): Promise<void> {
  const seg = FILE_TO_PATH[file]
  if (!seg) throw new Error(`Cannot save Viktor-owned file "${file}" via API`)
  await apiSend('PUT', `/clients/${slug}/${seg}`, { data })
}

// ── Phase 4 mutations ────────────────────────────────────────────────────────

export type ApprovalDecision = 'in_review' | 'approved' | 'scheduled' | 'rejected'

export async function apiSetApproval(
  slug: string,
  postId: string,
  decision: ApprovalDecision,
  note?: string,
): Promise<void> {
  await apiSend('POST', `/clients/${slug}/approvals`, { postId, decision, note })
}

export type SuggestionPatch = {
  status?: 'open' | 'accepted' | 'dismissed'
  priority?: number
  reason?: string
}

export async function apiPatchSuggestion(
  slug: string,
  suggestionId: string,
  body: SuggestionPatch,
): Promise<void> {
  await apiSend('PATCH', `/clients/${slug}/suggestions/${suggestionId}`, body)
}

export async function apiPatchPost(
  slug: string,
  postId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await apiSend('PATCH', `/clients/${slug}/posts/${postId}`, patch)
}

// ── Inspiration assets (drag-drop image library) ────────────────────────────

export interface InspirationItem {
  id: string
  note: string
  filename: string
  url: string
  createdAt?: string
}

export async function apiListInspiration(slug: string): Promise<InspirationItem[]> {
  try {
    const r = await apiGet<{ items: InspirationItem[] }>(`/clients/${slug}/inspiration`)
    return r.items.map((it) => ({ ...it, url: absoluteUrl(it.url) }))
  } catch {
    return []
  }
}

export async function apiUploadInspiration(
  slug: string,
  file: File,
  note = '',
): Promise<InspirationItem> {
  const form = new FormData()
  form.append('file', file)
  form.append('note', note)
  const res = await authedFetch(`/clients/${slug}/inspiration`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  const it = (await res.json()) as InspirationItem
  return { ...it, url: absoluteUrl(it.url) }
}

export async function apiDeleteInspiration(slug: string, id: string): Promise<void> {
  const res = await authedFetch(`/clients/${slug}/inspiration/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
}

// The API returns same-origin absolute paths (/api/v1/...). When the SPA runs
// against a remote API_BASE in dev, prefix it; in prod they're same-origin.
function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  if (!API_BASE) return path
  try {
    return new URL(path, new URL(API_BASE)).toString()
  } catch {
    return path
  }
}

// ── Phase 6: chat streaming ──────────────────────────────────────────────────

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export type ChatStreamEvent =
  | { type: 'tool'; label: string; status: 'start' | 'done' }
  | { type: 'token'; text: string }
  // Phase 6+: real OpenAI-style tool-use events from the model.
  | { type: 'tool_call'; id: string; name: string; arguments: string }
  | { type: 'tool_result'; id: string; name: string; result: unknown }
  | { type: 'done'; messageId: string | null }
  | { type: 'error'; detail: string }

// Tool names that should trigger a dashboard refetch on completion.
// First group: the legacy in-process tool names (kept for backward compat in
// case any stale code paths still emit them). Second group: the Hermes tool
// names emitted by the new chat proxy — `terminal` is how Hermes runs curl
// against our own API, so we treat any successful terminal/file write as a
// hint that something user-visible may have changed. False positives just
// trigger a no-op refetch.
const WRITE_TOOLS = new Set([
  'set_approval',
  'patch_post',
  'patch_suggestion',
  'create_post',
  'delete_post',
  'patch_brief',
  'patch_plan',
  'patch_goals',
  'patch_learnings',
  'terminal',
  'write_file',
  'patch',
])
export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name)
}

export async function* apiChatStream(args: {
  slug: string
  thread: string
  message: string
  history: ChatTurn[]
  signal?: AbortSignal
}): AsyncGenerator<ChatStreamEvent> {
  if (!API_BASE) throw new Error('VITE_API_BASE not set')
  await ensureApiToken()
  const res = await fetch(`${API_BASE}/clients/${args.slug}/chat/stream`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
    body: JSON.stringify({ thread: args.thread, message: args.message, history: args.history }),
    signal: args.signal,
  })
  if (!res.ok || !res.body) {
    yield { type: 'error', detail: `Chat ${res.status}` }
    return
  }
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n\n')) >= 0) {
      const raw = buf.slice(0, nl)
      buf = buf.slice(nl + 2)
      let ev: string | null = null
      let data: string | null = null
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) ev = line.slice(6).trim()
        else if (line.startsWith('data:')) data = (data ?? '') + line.slice(5).trim()
      }
      if (!ev || !data) continue
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>
        yield { type: ev as ChatStreamEvent['type'], ...(parsed as object) } as ChatStreamEvent
      } catch {
        // skip malformed frame
      }
    }
  }
}

export interface IntegrationInfo {
  slug: string
  apiBase: string
  docsUrl: string
  openapiUrl: string
  agentToken: string | null
  tokenHint: string | null
  examples: {
    curlReadBrief: string
    curlPatchPost: string
    curlSetApproval: string
  }
  assetsDir: string
  assetsManifestPath: string
}

export async function apiLoadIntegration(slug: string): Promise<IntegrationInfo> {
  return apiGet<IntegrationInfo>(`/clients/${slug}/integration`)
}

// ── Sync / notify-viktor ─────────────────────────────────────────────────────

/**
 * Records a "platform changed" sync event that the dashboard's sync indicator
 * reads back via apiLoadSyncLog. Fire-and-forget — callers catch internally.
 */
export async function apiNotifyViktor(slug: string, summary: string, kind?: string): Promise<void> {
  await apiSend<{ ok: boolean; ts: string }>(
    'POST',
    `/clients/${slug}/notify-viktor`,
    { summary, kind },
  )
}

export interface SyncEvent {
  ts: string
  note: string
  actor?: string
}

/** Returns the most recent viktor.notify audit events for the sync indicator. */
export async function apiLoadSyncLog(slug: string, limit = 5): Promise<SyncEvent[]> {
  try {
    const r = await apiGet<{ items: Array<{ ts: string; note: string; actor?: string }> }>(
      `/clients/${slug}/audit?action=viktor.notify&limit=${limit}`,
    )
    return (r.items ?? []).map((row) => ({ ts: row.ts, note: row.note, actor: row.actor }))
  } catch {
    return []
  }
}

export async function apiLoadChatHistory(
  slug: string,
  thread = 'default',
): Promise<Array<{ id: string; role: 'user' | 'assistant' | 'tool'; content: string }>> {
  try {
    const r = await apiGet<{ items: Array<{ id: string; role: 'user' | 'assistant' | 'tool'; content: string }> }>(
      `/clients/${slug}/chat/messages?thread=${encodeURIComponent(thread)}`,
    )
    return r.items
  } catch {
    return []
  }
}

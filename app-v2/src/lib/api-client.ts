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
  Channel,
  PostStatus,
  ApprovalLogEntry,
  AssetsManifest,
  Suggestions,
  PostMedia,
} from '@/types'
import { normalizePost } from '@/lib/normalize-post'
import type { CalendarRangeConfig } from '@/lib/planning-range'

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

function requireObjectData<T>(data: T | null | undefined, label: string): T {
  if (!data || typeof data !== 'object') {
    throw new Error(`${label} returned empty data`)
  }
  return data
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
  return requireObjectData(r.data, 'brief')
}

export async function apiLoadPlan(slug: string): Promise<Plan> {
  const r = await apiGet<{ data: Plan }>(`/clients/${slug}/plan`)
  return requireObjectData(r.data, 'plan')
}

export async function apiLoadGoals(slug: string): Promise<Goals> {
  const r = await apiGet<{ data: Goals }>(`/clients/${slug}/goals`)
  return requireObjectData(r.data, 'goals')
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

// GF-23 — the full content workflow a dashboard user can set from the calendar
// or the kanban. Mirrors APPROVAL_DECISIONS on the API. `published` is omitted
// on purpose: it is derived from the Postiz publish result, not user-settable.
export type ApprovalDecision =
  | 'drafting'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'needs_revision'
  | 'rejected'

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

// GF-22 — soft-delete a post. The API appends a `{ status: 'deleted' }` patch
// and the list endpoint filters it out; recovery is a PATCH back to any status.
export async function apiDeletePost(slug: string, postId: string): Promise<void> {
  if (!API_BASE) throw new Error('VITE_API_BASE not set')
  const res = await authedFetch(`/clients/${slug}/posts/${postId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE /clients/${slug}/posts/${postId} failed: ${res.status}`)
}

// GF-15 — create a new dashboard-originated post. `date` + `title` are the only
// required fields (the backend coalesces the rest); the API returns the built
// Post (201), which we normalize like every other read.
export type CreatePostInput = {
  date: string
  title: string
  channel?: Channel
  format?: string
  pillar?: string
  status?: PostStatus
  copy?: string
}

export async function apiCreatePost(
  slug: string,
  input: CreatePostInput,
): Promise<Post> {
  const raw = await apiSend<unknown>('POST', `/clients/${slug}/posts`, input)
  return normalizePost(raw)
}

// GF-5 — delete a Viktor-owned manifest asset (soft-delete overlay on the backend).
export async function apiDeleteManifestAsset(slug: string, assetId: string): Promise<void> {
  if (!API_BASE) throw new Error('VITE_API_BASE not set')
  const res = await authedFetch(
    `/clients/${slug}/assets/${encodeURIComponent(assetId)}`,
    { method: 'DELETE' },
  )
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
}

export async function apiLoadCalendarRange(slug: string): Promise<CalendarRangeConfig | null> {
  try {
    const r = await apiGet<{ data: CalendarRangeConfig | null }>(`/clients/${slug}/config/calendar-range`)
    return r.data
  } catch {
    return null
  }
}

export async function apiSaveCalendarRange(
  slug: string,
  range: CalendarRangeConfig,
): Promise<CalendarRangeConfig> {
  const r = await apiSend<{ data: CalendarRangeConfig }>('PUT', `/clients/${slug}/config/calendar-range`, {
    data: range,
  })
  return r.data
}

export type InformationSourceType = 'website' | 'note' | 'news' | 'reference' | 'other'

export interface InformationSource {
  id: string
  slug: string
  title: string
  url?: string
  sourceType?: InformationSourceType
  summary?: string
  prompt?: string
  approved?: boolean
  approvedAt?: string
  lastImportedAt?: string
  tags?: string[]
  actor?: string
  createdAt?: string
  updatedAt?: string
}

export async function apiListInformationSources(
  slug: string,
  approvedOnly = false,
): Promise<InformationSource[]> {
  try {
    const query = approvedOnly ? '?approved=true' : ''
    const r = await apiGet<{ items: InformationSource[] }>(`/clients/${slug}/information-sources${query}`)
    return r.items ?? []
  } catch {
    return []
  }
}

export type InformationSourceInput = Pick<
  InformationSource,
  'title' | 'url' | 'sourceType' | 'summary' | 'prompt' | 'tags' | 'approved'
>

export async function apiCreateInformationSource(
  slug: string,
  input: InformationSourceInput,
): Promise<InformationSource> {
  return apiSend<InformationSource>('POST', `/clients/${slug}/information-sources`, input)
}

export async function apiPatchInformationSource(
  slug: string,
  id: string,
  patch: Partial<InformationSourceInput>,
): Promise<InformationSource> {
  return apiSend<InformationSource>('PATCH', `/clients/${slug}/information-sources/${id}`, patch)
}

export async function apiApproveInformationSource(slug: string, id: string): Promise<InformationSource> {
  return apiSend<InformationSource>('POST', `/clients/${slug}/information-sources/${id}/approve`, {})
}

// Max upload size for information-source files (transcripts/notes). Mirrors the
// server-side limit in the API's information-sources/upload route (GF-12).
export const INFO_SOURCE_MAX_BYTES = 15_000_000

// Drag-and-drop file upload: a text transcript/notes file becomes an
// information_sources record (text extracted into `summary` server-side).
export async function apiUploadInformationSourceFile(
  slug: string,
  file: File,
): Promise<InformationSource> {
  const form = new FormData()
  form.append('file', file)
  const res = await authedFetch(`/clients/${slug}/information-sources/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    let detail = `Upload failed: ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string; title?: string }
      detail = body.detail || body.title || detail
    } catch {
      /* keep default */
    }
    throw new Error(detail)
  }
  return (await res.json()) as InformationSource
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
  'image_generate',
  'video_generate',
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

/** Masked Postiz key status (GF-11). The raw key is never sent to the SPA. */
export interface PostizStatus {
  configured: boolean
  last4: string | null
  updatedAt: string | null
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
    curlAddSourceMaterial?: string
  }
  /**
   * GF-27: single machine-ingestible connection blob. The Integration screen
   * offers a one-click copy of JSON.stringify(agentConnection) so an external
   * agent can self-configure from one paste instead of 3 separate fields.
   */
  agentConnection?: {
    apiBase: string
    slug: string
    token: string
    authHeader: string
    openapiUrl: string
    docsUrl: string
    endpoints: Record<string, string>
    instructions: string
  }
  assetsDir: string
  assetsManifestPath: string
  postiz: PostizStatus
}

export async function apiLoadIntegration(slug: string): Promise<IntegrationInfo> {
  return apiGet<IntegrationInfo>(`/clients/${slug}/integration`)
}

/** Save / rotate the Postiz API key. Returns the masked status; never the key. */
export async function apiSavePostizKey(slug: string, apiKey: string): Promise<PostizStatus> {
  return apiSend<PostizStatus>('PUT', `/clients/${slug}/integration/postiz`, { apiKey })
}

/** Remove the stored Postiz API key. */
export async function apiDeletePostizKey(slug: string): Promise<PostizStatus> {
  if (!API_BASE) throw new Error('VITE_API_BASE not set')
  const res = await authedFetch(`/clients/${slug}/integration/postiz`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`DELETE /clients/${slug}/integration/postiz failed: ${res.status}`)
  return (await res.json()) as PostizStatus
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

export interface ChatThread {
  thread: string
  lastActivity: string
  title: string
  count: number
}

/** List a client's saved chat sessions (threads), newest activity first. */
export async function apiLoadChatThreads(slug: string): Promise<ChatThread[]> {
  try {
    const r = await apiGet<{ items: ChatThread[] }>(`/clients/${slug}/chat/threads`)
    return r.items
  } catch {
    return []
  }
}

export type AgentJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timed_out'
  | 'recovered'

export interface AgentJob {
  id: string
  slug: string
  thread: string
  source: string
  status: AgentJobStatus
  userMessageId?: string
  assistantMessageId?: string
  created?: string
  updated?: string
  completedAt?: string
}

export async function apiLoadAgentJobs(
  slug: string,
  thread = 'default',
  limit = 20,
): Promise<AgentJob[]> {
  try {
    const r = await apiGet<{ items: AgentJob[] }>(
      `/clients/${slug}/agent-jobs?thread=${encodeURIComponent(thread)}&limit=${limit}`,
    )
    return r.items
  } catch {
    return []
  }
}

// ── GF-4: Content Creation review links (collaboration layer) ────────────────

export interface ReviewLink {
  id: string
  publicId: string
  title: string
  rangeStart: string
  rangeEnd: string
  status: 'active' | 'revoked'
  state: 'active' | 'revoked' | 'expired'
  expiresAt: string | null
  createdBy: string | null
  createdAt: string | null
  revokedAt: string | null
  reviewPath: string
  /** Present only in the immediate create/rotate response — shown once. */
  code?: string
  /** Total comments on this link (list endpoint only). */
  commentCount?: number
}

export interface ReviewComment {
  id: string
  postId: string
  reviewerName: string
  body: string
  status: 'open' | 'resolved'
  source: 'reviewer' | 'dashboard'
  createdAt: string
}

export interface ReviewEvent {
  id: string
  slug: string
  linkId: string
  postId?: string
  kind: 'comment' | 'approved' | 'changes_requested'
  reviewerName?: string
  preview?: string
  read?: boolean
  createdAt?: string
}

export async function apiCreateReviewLink(
  slug: string,
  body: { title?: string; rangeStart: string; rangeEnd: string; ttlDays?: number },
): Promise<ReviewLink> {
  return apiSend<ReviewLink>('POST', `/clients/${slug}/review-links`, body)
}

export async function apiListReviewLinks(slug: string): Promise<ReviewLink[]> {
  try {
    const r = await apiGet<{ items: ReviewLink[] }>(`/clients/${slug}/review-links`)
    return r.items ?? []
  } catch {
    return []
  }
}

export async function apiRevokeReviewLink(slug: string, id: string): Promise<ReviewLink> {
  return apiSend<ReviewLink>('POST', `/clients/${slug}/review-links/${id}/revoke`, {})
}

export async function apiRotateReviewLink(slug: string, id: string): Promise<ReviewLink> {
  return apiSend<ReviewLink>('POST', `/clients/${slug}/review-links/${id}/rotate`, {})
}

export async function apiLoadReviewLinkComments(slug: string, id: string): Promise<ReviewComment[]> {
  try {
    const r = await apiGet<{ items: ReviewComment[] }>(`/clients/${slug}/review-links/${id}/comments`)
    return r.items ?? []
  } catch {
    return []
  }
}

export async function apiReplyReviewComment(
  slug: string,
  linkId: string,
  body: string,
  postId?: string,
): Promise<void> {
  await apiSend('POST', `/clients/${slug}/review-links/${linkId}/comments`, { body, postId })
}

export async function apiModerateReviewComment(
  slug: string,
  commentId: string,
  status: 'open' | 'resolved',
): Promise<void> {
  await apiSend('PATCH', `/clients/${slug}/review-comments/${commentId}`, { status })
}

export async function apiLoadReviewActivity(
  slug: string,
  opts: { unread?: boolean; limit?: number } = {},
): Promise<{ items: ReviewEvent[]; unreadCount: number }> {
  try {
    const qs = new URLSearchParams()
    if (opts.unread) qs.set('unread', 'true')
    if (opts.limit) qs.set('limit', String(opts.limit))
    const suffix = qs.toString() ? `?${qs}` : ''
    return await apiGet<{ items: ReviewEvent[]; unreadCount: number }>(
      `/clients/${slug}/review-activity${suffix}`,
    )
  } catch {
    return { items: [], unreadCount: 0 }
  }
}

export async function apiMarkReviewActivityRead(
  slug: string,
  arg: { ids?: string[]; all?: boolean },
): Promise<void> {
  await apiSend('POST', `/clients/${slug}/review-activity/read`, arg)
}

// Per-post external feedback for the whole client, indexed by postId. Backs the
// calendar badges + the "External feedback" thread in the post view (v3).
export interface ReviewFeedbackComment {
  id: string
  linkId: string
  postId?: string
  reviewerName?: string
  body: string
  status?: 'open' | 'resolved'
  source: 'reviewer' | 'dashboard'
  createdAt?: string
}

export interface ReviewPostFeedback {
  decisions: { decision: 'approved' | 'changes_requested' | string; reviewerName: string; createdAt: string }[]
  comments: ReviewFeedbackComment[]
}

export interface ReviewFeedback {
  byPost: Record<string, ReviewPostFeedback>
  general: { comments: ReviewFeedbackComment[] }
}

export async function apiLoadReviewFeedback(slug: string): Promise<ReviewFeedback> {
  try {
    return await apiGet<ReviewFeedback>(`/clients/${slug}/review-feedback`)
  } catch {
    return { byPost: {}, general: { comments: [] } }
  }
}

// ── GF-4: PUBLIC external-review client (no dashboard bearer token) ──────────
// These hit the code-gated /review/* endpoints. The reviewer is NOT logged into
// the platform; the only credential is the access code (exchanged for a rev_*
// session token returned by `open`). All calls go straight through fetch with
// that session token — never the dashboard bearer.

export interface PublicReviewPost {
  id: string
  date: string
  channel?: string
  format?: string
  pillar?: string
  campaign?: string
  title: string
  copy?: string
  hashtags?: string[]
  cta?: string
  image?: string
  slides?: Array<{ image: string; caption?: string }>
  media?: PostMedia[]
  statusLabel?: string
}

export interface PublicReviewBrand {
  name: string
  handle: string
  logoInitials: string
}

export interface PublicPostDecision {
  postId: string
  decision: 'approved' | 'changes_requested' | string
  reviewerName: string
  createdAt: string
}

export interface PublicReviewPayload {
  token?: string
  expiresAt?: string
  reviewerName: string
  canApprove: boolean
  link: { title: string; rangeStart: string; rangeEnd: string }
  brand?: PublicReviewBrand
  posts: PublicReviewPost[]
  postDecisions?: PublicPostDecision[]
  comments: ReviewComment[]
}

export class ReviewGateError extends Error {}

function reviewBase(): string {
  return API_BASE ?? ''
}

function reviewImageUrl(url: string | undefined): string | undefined {
  return url ? absoluteUrl(url) : url
}

function withAbsoluteImages(payload: PublicReviewPayload): PublicReviewPayload {
  return {
    ...payload,
    posts: payload.posts.map((p) => ({
      ...p,
      image: reviewImageUrl(p.image),
      slides: p.slides?.map((s) => ({ ...s, image: reviewImageUrl(s.image) ?? s.image })),
      media: p.media?.map((m) => ({
        ...m,
        url: reviewImageUrl(m.url) ?? m.url,
        thumbnail: reviewImageUrl(m.thumbnail) ?? m.thumbnail,
      })),
    })),
  }
}

export async function reviewOpen(
  publicId: string,
  code: string,
  name?: string,
): Promise<PublicReviewPayload> {
  const res = await fetch(`${reviewBase()}/review/${publicId}/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, name }),
  })
  if (res.status === 403) throw new ReviewGateError('This link is unavailable, or the code is incorrect.')
  if (!res.ok) throw new Error(`Could not open review link (${res.status})`)
  return withAbsoluteImages((await res.json()) as PublicReviewPayload)
}

export async function reviewRefresh(publicId: string, token: string): Promise<PublicReviewPayload> {
  const res = await fetch(`${reviewBase()}/review/${publicId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (res.status === 403) throw new ReviewGateError('Your review session expired. Re-enter the code.')
  if (!res.ok) throw new Error(`Could not refresh (${res.status})`)
  return withAbsoluteImages((await res.json()) as PublicReviewPayload)
}

export async function reviewComment(
  publicId: string,
  token: string,
  body: string,
  opts: { postId?: string; name?: string } = {},
): Promise<ReviewComment> {
  const res = await fetch(`${reviewBase()}/review/${publicId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ body, postId: opts.postId, name: opts.name }),
  })
  if (res.status === 403) throw new ReviewGateError('Your review session expired. Re-enter the code.')
  if (!res.ok) throw new Error(`Could not post comment (${res.status})`)
  return (await res.json()) as ReviewComment
}

export async function reviewDecision(
  publicId: string,
  token: string,
  decision: 'approved' | 'changes_requested',
  opts: { note?: string; name?: string; postId?: string } = {},
): Promise<void> {
  const res = await fetch(`${reviewBase()}/review/${publicId}/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ decision, note: opts.note, name: opts.name, postId: opts.postId }),
  })
  if (res.status === 403) throw new ReviewGateError('Your review session expired. Re-enter the code.')
  if (!res.ok) throw new Error(`Could not submit decision (${res.status})`)
}

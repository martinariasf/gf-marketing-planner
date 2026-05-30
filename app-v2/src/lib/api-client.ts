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

const API_BASE = import.meta.env.VITE_API_BASE as string | undefined
const API_TOKEN = import.meta.env.VITE_API_TOKEN as string | undefined

export const isApiEnabled = !!API_BASE

function authHeaders(extra: Record<string, string> = {}): HeadersInit {
  const h: Record<string, string> = { ...extra }
  if (API_TOKEN) h.Authorization = `Bearer ${API_TOKEN}`
  return h
}

async function apiGet<T>(path: string): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE not set')
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return (await res.json()) as T
}

async function apiSend<T>(method: 'PUT' | 'POST' | 'PATCH', path: string, body: unknown): Promise<T> {
  if (!API_BASE) throw new Error('VITE_API_BASE not set')
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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
  try {
    const r = await apiGet<{ items: ClientIndexEntry[] }>(`/clients`)
    return { clients: r.items.map((c) => ({ ...c, status: c.status || 'active' })) }
  } catch {
    return { clients: [] }
  }
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
    const r = await apiGet<{ items: Post[] }>(`/clients/${slug}/posts`)
    return r.items
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

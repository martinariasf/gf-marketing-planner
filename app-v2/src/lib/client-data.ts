/**
 * Data loaders for the marketing-planner dashboard.
 *
 * Dual-mode:
 *   - **File mode** (default / production today): fetches static JSON from
 *     /data/<slug>/<file>.json served by Caddy. No backend needed.
 *   - **PocketBase mode** (when VITE_PB_URL is set): user-owned data
 *     (brief, plan, goals, learnings, client index) is loaded from PocketBase.
 *     Viktor-owned data (posts, suggestions, performance, approvals.log,
 *     assets) is STILL fetched as static JSON — preserving literal-approval.
 *
 * The switch is at build time via the `VITE_PB_URL` env var. Pages don't
 * need to know which mode is active — they just call `loadClient(slug)`.
 */

import type {
  Brief,
  Plan,
  Goals,
  Performance,
  Post,
  Learnings,
  ApprovalLogEntry,
  AssetsManifest,
  ClientIndex,
  Suggestions,
} from '@/types'
import { parseApprovalLog } from '@/types'
import {
  isPocketBaseEnabled,
  pbLoadBrief,
  pbLoadPlan,
  pbLoadGoals,
  pbLoadLearnings,
  pbLoadClientIndex,
} from '@/lib/pocketbase'
import {
  isApiEnabled,
  apiLoadBrief,
  apiLoadPlan,
  apiLoadGoals,
  apiLoadLearnings,
  apiLoadClientIndex,
  apiLoadPerformance,
  apiLoadPosts,
  apiLoadSuggestions,
  apiLoadAssetsManifest,
  apiLoadApprovals,
} from '@/lib/api-client'

const DATA_ROOT = '/data'

// ── File-based helpers (unchanged from v1) ───────────────────────────────────

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${url}`)
  }
  return (await res.json()) as T
}

function clientPath(slug: string, file: string) {
  return `${DATA_ROOT}/${slug}/${file}`
}

function fileBrief(slug: string) {
  return fetchJson<Brief>(clientPath(slug, 'brief.json'))
}

function filePlan(slug: string) {
  return fetchJson<Plan>(clientPath(slug, 'plan.json'))
}

function fileGoals(slug: string) {
  return fetchJson<Goals>(clientPath(slug, 'goals.json'))
}

async function fileLearnings(slug: string): Promise<Learnings | null> {
  try {
    return await fetchJson<Learnings>(clientPath(slug, 'learnings.json'))
  } catch {
    return null
  }
}

function fileClientIndex(): Promise<ClientIndex> {
  return fetchJson<ClientIndex>(`${DATA_ROOT}/index.json`).catch(() => ({
    clients: [],
  }))
}

// ── Viktor-owned (always from files, both modes) ─────────────────────────────

export async function loadPerformance(
  slug: string,
): Promise<Performance | null> {
  if (isApiEnabled) return apiLoadPerformance(slug)
  try {
    return await fetchJson<Performance>(clientPath(slug, 'performance.json'))
  } catch {
    return null
  }
}

export async function loadPosts(slug: string): Promise<Post[]> {
  if (isApiEnabled) return apiLoadPosts(slug)
  try {
    const index = await fetchJson<{ posts: string[] }>(
      clientPath(slug, 'posts/index.json'),
    )
    const posts = await Promise.all(
      index.posts.map((id) =>
        fetchJson<Post>(clientPath(slug, `posts/${id}.json`)),
      ),
    )
    return posts
  } catch {
    return []
  }
}

export async function loadApprovalsLog(
  slug: string,
): Promise<ApprovalLogEntry[]> {
  if (isApiEnabled) return apiLoadApprovals(slug)
  try {
    const res = await fetch(clientPath(slug, 'approvals.log'), {
      cache: 'no-store',
    })
    if (!res.ok) return []
    return parseApprovalLog(await res.text())
  } catch {
    return []
  }
}

export async function loadAssetsManifest(
  slug: string,
): Promise<AssetsManifest | null> {
  if (isApiEnabled) return apiLoadAssetsManifest(slug)
  try {
    return await fetchJson<AssetsManifest>(
      clientPath(slug, 'assets/manifest.json'),
    )
  } catch {
    return null
  }
}

export async function loadSuggestions(
  slug: string,
): Promise<Suggestions | null> {
  if (isApiEnabled) return apiLoadSuggestions(slug)
  try {
    return await fetchJson<Suggestions>(clientPath(slug, 'suggestions.json'))
  } catch {
    return null
  }
}

// ── Public API (dual-mode) ───────────────────────────────────────────────────

export interface ClientBundle {
  slug: string
  brief: Brief
  plan: Plan
  goals: Goals
  performance: Performance | null
  posts: Post[]
  learnings: Learnings | null
  approvalsLog: ApprovalLogEntry[]
  assets: AssetsManifest | null
  suggestions: Suggestions | null
}

/**
 * Mode precedence: REST API (Phase 3+) > PocketBase (transitional) > files.
 * Production stays on file mode because no env vars are set on that build.
 */

export function loadBrief(slug: string): Promise<Brief> {
  if (isApiEnabled) return apiLoadBrief(slug)
  if (isPocketBaseEnabled) return pbLoadBrief(slug)
  return fileBrief(slug)
}

export function loadPlan(slug: string): Promise<Plan> {
  if (isApiEnabled) return apiLoadPlan(slug)
  if (isPocketBaseEnabled) return pbLoadPlan(slug)
  return filePlan(slug)
}

export function loadGoals(slug: string): Promise<Goals> {
  if (isApiEnabled) return apiLoadGoals(slug)
  if (isPocketBaseEnabled) return pbLoadGoals(slug)
  return fileGoals(slug)
}

export function loadLearnings(slug: string): Promise<Learnings | null> {
  if (isApiEnabled) return apiLoadLearnings(slug)
  if (isPocketBaseEnabled) return pbLoadLearnings(slug)
  return fileLearnings(slug)
}

export function loadClientIndex(): Promise<ClientIndex> {
  if (isApiEnabled) return apiLoadClientIndex()
  if (isPocketBaseEnabled) return pbLoadClientIndex()
  return fileClientIndex()
}

/** Load everything for one client. */
export async function loadClient(slug: string): Promise<ClientBundle> {
  const [
    brief,
    plan,
    goals,
    performance,
    posts,
    learnings,
    approvalsLog,
    assets,
    suggestions,
  ] = await Promise.all([
    loadBrief(slug),
    loadPlan(slug),
    loadGoals(slug),
    loadPerformance(slug),
    loadPosts(slug),
    loadLearnings(slug),
    loadApprovalsLog(slug),
    loadAssetsManifest(slug),
    loadSuggestions(slug),
  ])
  return {
    slug,
    brief,
    plan,
    goals,
    performance,
    posts,
    learnings,
    approvalsLog,
    assets,
    suggestions,
  }
}

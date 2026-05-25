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
  try {
    return await fetchJson<Performance>(clientPath(slug, 'performance.json'))
  } catch {
    return null
  }
}

export async function loadPosts(slug: string): Promise<Post[]> {
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

/** Load brief — PocketBase if enabled, else static JSON. */
export function loadBrief(slug: string): Promise<Brief> {
  return isPocketBaseEnabled ? pbLoadBrief(slug) : fileBrief(slug)
}

/** Load plan — PocketBase if enabled, else static JSON. */
export function loadPlan(slug: string): Promise<Plan> {
  return isPocketBaseEnabled ? pbLoadPlan(slug) : filePlan(slug)
}

/** Load goals — PocketBase if enabled, else static JSON. */
export function loadGoals(slug: string): Promise<Goals> {
  return isPocketBaseEnabled ? pbLoadGoals(slug) : fileGoals(slug)
}

/** Load learnings — PocketBase if enabled, else static JSON. */
export function loadLearnings(slug: string): Promise<Learnings | null> {
  return isPocketBaseEnabled ? pbLoadLearnings(slug) : fileLearnings(slug)
}

/** Load client index — PocketBase if enabled, else static JSON. */
export function loadClientIndex(): Promise<ClientIndex> {
  return isPocketBaseEnabled ? pbLoadClientIndex() : fileClientIndex()
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

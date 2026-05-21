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

const DATA_ROOT = '/data'

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${url}`)
  }
  return (await res.json()) as T
}

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

function clientPath(slug: string, file: string) {
  return `${DATA_ROOT}/${slug}/${file}`
}

export function loadBrief(slug: string) {
  return fetchJson<Brief>(clientPath(slug, 'brief.json'))
}

export function loadPlan(slug: string) {
  return fetchJson<Plan>(clientPath(slug, 'plan.json'))
}

export function loadGoals(slug: string) {
  return fetchJson<Goals>(clientPath(slug, 'goals.json'))
}

export async function loadPerformance(slug: string): Promise<Performance | null> {
  try {
    return await fetchJson<Performance>(clientPath(slug, 'performance.json'))
  } catch {
    return null
  }
}

export async function loadLearnings(slug: string): Promise<Learnings | null> {
  try {
    return await fetchJson<Learnings>(clientPath(slug, 'learnings.json'))
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

export async function loadApprovalsLog(slug: string): Promise<ApprovalLogEntry[]> {
  try {
    const res = await fetch(clientPath(slug, 'approvals.log'), { cache: 'no-store' })
    if (!res.ok) return []
    return parseApprovalLog(await res.text())
  } catch {
    return []
  }
}

export async function loadClientIndex(): Promise<ClientIndex> {
  try {
    return await fetchJson<ClientIndex>(`${DATA_ROOT}/index.json`)
  } catch {
    return { clients: [] }
  }
}

export async function loadAssetsManifest(slug: string): Promise<AssetsManifest | null> {
  try {
    return await fetchJson<AssetsManifest>(clientPath(slug, 'assets/manifest.json'))
  } catch {
    return null
  }
}

export async function loadSuggestions(slug: string): Promise<Suggestions | null> {
  try {
    return await fetchJson<Suggestions>(clientPath(slug, 'suggestions.json'))
  } catch {
    return null
  }
}

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

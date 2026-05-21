import type {
  Brief,
  Plan,
  Goals,
  Performance,
  Post,
  Learnings,
} from '@/types'

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

export async function loadClient(slug: string): Promise<ClientBundle> {
  const [brief, plan, goals, performance, posts, learnings] = await Promise.all([
    loadBrief(slug),
    loadPlan(slug),
    loadGoals(slug),
    loadPerformance(slug),
    loadPosts(slug),
    loadLearnings(slug),
  ])
  return { slug, brief, plan, goals, performance, posts, learnings }
}

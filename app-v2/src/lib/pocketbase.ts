/**
 * PocketBase client + typed helpers for the marketing-planner.
 *
 * The PB_URL is set at build time via VITE_PB_URL. When absent (production
 * today), the PocketBase client is never instantiated and the file-based
 * data layer is used instead — see `client-data.ts`.
 */

import PocketBase from 'pocketbase'
import type {
  Brief,
  Plan,
  Goals,
  Learnings,
  ClientIndex,
  ClientIndexEntry,
} from '@/types'

// ── PocketBase instance (singleton) ──────────────────────────────────────────

const PB_URL = import.meta.env.VITE_PB_URL as string | undefined

/** `true` when the build was configured to use PocketBase. */
export const isPocketBaseEnabled = !!PB_URL

let _pb: PocketBase | null = null

export function getPB(): PocketBase {
  if (!_pb) {
    if (!PB_URL) throw new Error('VITE_PB_URL not set — PocketBase disabled')
    _pb = new PocketBase(PB_URL)
    // Disable auto-cancellation — we manage our own fetch lifecycle.
    _pb.autoCancellation(false)
  }
  return _pb
}

// ── Generic document fetcher ─────────────────────────────────────────────────

interface DocRecord {
  id: string
  slug: string
  data: unknown
}

async function getDocBySlug<T>(collection: string, slug: string): Promise<T> {
  const pb = getPB()
  const record = await pb
    .collection(collection)
    .getFirstListItem<DocRecord>(`slug="${slug}"`)
  return record.data as T
}

async function getDocBySlugOrNull<T>(
  collection: string,
  slug: string,
): Promise<T | null> {
  try {
    return await getDocBySlug<T>(collection, slug)
  } catch {
    return null
  }
}

// ── Typed loaders (mirror the file-based API in client-data.ts) ──────────────

export function pbLoadBrief(slug: string): Promise<Brief> {
  return getDocBySlug<Brief>('briefs', slug)
}

export function pbLoadPlan(slug: string): Promise<Plan> {
  return getDocBySlug<Plan>('plans', slug)
}

export function pbLoadGoals(slug: string): Promise<Goals> {
  return getDocBySlug<Goals>('goals', slug)
}

export function pbLoadLearnings(slug: string): Promise<Learnings | null> {
  return getDocBySlugOrNull<Learnings>('learnings', slug)
}

export async function pbLoadClientIndex(): Promise<ClientIndex> {
  const pb = getPB()
  const records = await pb.collection('clients').getFullList<{
    id: string
    slug: string
    name: string
    industry: string
    logoInitials: string
    quarter: string
    headline: string
    status: string
  }>({ sort: 'slug' })

  const clients: ClientIndexEntry[] = records.map((r) => ({
    slug: r.slug,
    name: r.name,
    industry: r.industry,
    logoInitials: r.logoInitials,
    quarter: r.quarter,
    headline: r.headline,
    status: (r.status as ClientIndexEntry['status']) || 'active',
  }))

  return { clients }
}

// ── Save (upsert) ────────────────────────────────────────────────────────────

/**
 * Save user-owned data back to PocketBase. Upserts by slug.
 *
 * Only the user-owned collections are writable:
 *   brief → briefs, plan → plans, goals → goals, learnings → learnings
 *
 * Viktor-owned data (posts, suggestions, performance, approvals) is NOT saved
 * via this path.
 */
const FILE_TO_COLLECTION: Record<string, string> = {
  brief: 'briefs',
  plan: 'plans',
  goals: 'goals',
  learnings: 'learnings',
}

export async function pbSave(
  slug: string,
  file: string,
  data: unknown,
): Promise<void> {
  const collection = FILE_TO_COLLECTION[file]
  if (!collection) {
    throw new Error(`Cannot save Viktor-owned file "${file}" to PocketBase`)
  }

  const pb = getPB()

  // Find existing record by slug
  try {
    const existing = await pb
      .collection(collection)
      .getFirstListItem<DocRecord>(`slug="${slug}"`)

    // Update
    await pb.collection(collection).update(existing.id, { data })
  } catch {
    // Not found — create
    await pb.collection(collection).create({ slug, data })
  }
}

/**
 * Save client index entry (for the client picker).
 */
export async function pbSaveClient(
  entry: ClientIndexEntry,
): Promise<void> {
  const pb = getPB()
  try {
    const existing = await pb
      .collection('clients')
      .getFirstListItem<{ id: string }>(`slug="${entry.slug}"`)
    await pb.collection('clients').update(existing.id, entry)
  } catch {
    await pb.collection('clients').create(entry)
  }
}

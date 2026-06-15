// Shared post assembly: merge Viktor's on-disk JSON with the dashboard PB
// overlays (created posts, patches, approvals) into the canonical post shape the
// dashboard and the external review page both render.
//
// This logic used to live inside routes/viktorOwned.ts. It was lifted here so
// the public GF-4 review route can reuse the exact same merge + normalization +
// coalesce pipeline (and therefore can never accidentally expose a different,
// less-sanitized view of a post than the dashboard sees).

import { withPb } from './pb.js'
import { disk } from './diskData.js'
import { loadPostPatches, loadCreatedPosts, latestApprovalByPost } from './overlays.js'
import { coalescePost } from './schemas/post.js'

export type PostBase = {
  id: string
  status?: string
  pillar?: string
  date?: string
  approval?: { status?: string }
} & Record<string, unknown>

// The chat agent doesn't always write the full image URL — it sometimes PATCHes
// a relative path like "assets/p002_cover.png", a bare filename, or even an
// absolute container path. Any of those break the dashboard <img>. Normalize to
// our public, basicauth-bypassing file route (root-relative so it works on any
// host). Leaves real absolute URLs (Unsplash, or the already-correct full URL)
// untouched.
export function normalizeImageUrl(slug: string, image: unknown): unknown {
  if (typeof image !== 'string') return image
  const v = image.trim()
  if (!v) return v
  if (/^https?:\/\//i.test(v) || v.startsWith('/api/v1/')) return v
  const name = v.split('/').filter(Boolean).pop() ?? v
  return `/api/v1/clients/${slug}/assets/files/${name}`
}

export async function buildPost(slug: string, id: string): Promise<PostBase | null> {
  // Try disk first, then fall back to dashboard/chat-created posts in PB.
  let base = (await disk.post(slug, id)) as PostBase | null
  if (!base) {
    const created = await loadCreatedPosts(slug)
    const c = created.get(id)
    if (!c) return null
    base = { ...(c as PostBase), id }
  }
  const patches = await loadPostPatches(slug)
  const approvals = await latestApprovalByPost(slug)
  const patch = patches.get(id) ?? {}
  const approval = approvals.get(id)
  const next: PostBase = { ...base, ...patch, id }
  if ('image' in next) next.image = normalizeImageUrl(slug, next.image)
  if (Array.isArray((next as Record<string, unknown>).slides)) {
    const slides = (next as Record<string, unknown>).slides as Array<Record<string, unknown>>
    ;(next as Record<string, unknown>).slides = slides.map((s) =>
      s && typeof s === 'object' ? { ...s, image: normalizeImageUrl(slug, s.image) } : s,
    )
  }
  if (approval) {
    next.approval = {
      ...(base.approval ?? {}),
      ...(typeof patch.approval === 'object' && patch.approval !== null ? patch.approval : {}),
      status: approval.decision,
    }
  }
  return coalescePost(next)
}

/** All post ids for a client (disk index/files + dashboard-created), deduped. */
export async function listPostIds(slug: string): Promise<string[]> {
  const idsFromIndex = (await disk.postsIndex(slug))?.posts
  const diskIds = idsFromIndex ?? (await disk.listPostFiles(slug))
  const created = await loadCreatedPosts(slug)
  return [...diskIds, ...Array.from(created.keys()).filter((id) => !diskIds.includes(id))]
}

export interface ListPostsOptions {
  includeDeleted?: boolean
  status?: string
  pillar?: string
}

/** Build every post for a client, applying the same filters the dashboard uses. */
export async function listPosts(slug: string, opts: ListPostsOptions = {}): Promise<PostBase[]> {
  const allIds = await listPostIds(slug)
  const items: PostBase[] = []
  for (const id of allIds) {
    const post = await buildPost(slug, id)
    if (!post) continue
    if (!opts.includeDeleted && post.status === 'deleted') continue
    if (opts.status && post.approval?.status !== opts.status && post.status !== opts.status) continue
    if (opts.pillar && post.pillar !== opts.pillar) continue
    items.push(post)
  }
  return items
}

/** YYYY-MM month key for a post's date, or '' if unparseable. */
export function monthKeyOf(iso: unknown): string {
  if (typeof iso !== 'string' || !iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Posts whose date falls within [rangeStart, rangeEnd] inclusive (month keys). */
export async function listPostsInRange(
  slug: string,
  rangeStart: string,
  rangeEnd: string,
): Promise<PostBase[]> {
  const all = await listPosts(slug)
  return all
    .filter((p) => {
      const key = monthKeyOf(p.date)
      return key !== '' && key >= rangeStart && key <= rangeEnd
    })
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))
}

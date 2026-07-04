// GF-64 — the Assets tab renders ONLY manifest.json, but media can reach a
// post without a manifest row (the agent composes a file by hand and PATCHes
// post.image / slides / media, or a historical row was lost). The API cannot
// write rows back: /data/clients is a read-only bind mount, and a second
// writer would race the agent. Instead the manifest READ path derives a
// virtual row for every post-referenced asset file that exists on disk but
// has no manifest entry, so the gallery can never silently diverge again.

import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { disk } from './diskData.js'
import { listPosts, type PostBase } from './posts.js'

export type ManifestItem = { id?: string; filename?: string } & Record<string, unknown>
export type AssetManifest = { items?: ManifestItem[] } & Record<string, unknown>

const DATA_ROOT = process.env.DATA_ROOT ?? '/data'

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v'])

// Post statuses whose media we treat as approved for the gallery badge.
const APPROVED_STATUSES = new Set(['approved', 'programmed', 'rechecked', 'scheduled', 'published'])

/** Filename for a URL pointing at THIS client's served assets, else null.
 *  Post URLs are already normalized by buildPost (normalizeAssetUrl), so own
 *  assets always contain the /clients/<slug>/assets/files/ marker — foreign
 *  hosts (e.g. Unsplash) and other clients' assets never match. */
export function assetFilenameFromUrl(slug: string, value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const marker = `/clients/${slug}/assets/files/`
  const at = value.indexOf(marker)
  if (at === -1) return null
  const raw = value.slice(at + marker.length).split('?')[0]
  if (!raw || raw.includes('/')) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function kindOf(filename: string): 'image' | 'video' {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image'
}

function* assetUrlsOf(post: PostBase): Generator<unknown> {
  yield post.image
  const slides = (post as Record<string, unknown>).slides
  if (Array.isArray(slides)) {
    for (const s of slides) {
      if (s && typeof s === 'object') yield (s as Record<string, unknown>).image
    }
  }
  const media = (post as Record<string, unknown>).media
  if (Array.isArray(media)) {
    for (const m of media) {
      if (m && typeof m === 'object') yield (m as Record<string, unknown>).url
      else yield m
    }
  }
}

/** Disk manifest items + one derived row per post-referenced asset file that
 *  has no manifest row and exists on disk. Pure: posts and the existence
 *  check are injected so it unit-tests without PB or a filesystem. */
export function mergePostReferencedAssets(
  slug: string,
  manifestItems: ManifestItem[],
  posts: PostBase[],
  fileExists: (filename: string) => boolean,
): ManifestItem[] {
  const known = new Set(
    manifestItems.map((it) => (typeof it.filename === 'string' ? it.filename : '')).filter(Boolean),
  )
  // filename -> { postIds in first-seen order, approved flag }
  const refs = new Map<string, { postIds: string[]; approved: boolean }>()
  for (const post of posts) {
    for (const url of assetUrlsOf(post)) {
      const filename = assetFilenameFromUrl(slug, url)
      if (!filename || known.has(filename)) continue
      let ref = refs.get(filename)
      if (!ref) {
        ref = { postIds: [], approved: false }
        refs.set(filename, ref)
      }
      if (!ref.postIds.includes(post.id)) ref.postIds.push(post.id)
      if (APPROVED_STATUSES.has(String(post.status ?? ''))) ref.approved = true
    }
  }
  const derived: ManifestItem[] = []
  for (const [filename, ref] of [...refs.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!fileExists(filename)) continue
    derived.push({
      id: `ref-${filename}`,
      filename,
      url: `/api/v1/clients/${slug}/assets/files/${encodeURIComponent(filename)}`,
      kind: kindOf(filename),
      source: 'post-reference (derived)',
      usedInPosts: ref.postIds,
      owner: 'Viktor',
      finalApproved: ref.approved,
    })
  }
  return [...manifestItems, ...derived]
}

/** The merged manifest both the dedicated manifest route and the client
 *  hydrate route serve: disk rows + derived post-referenced rows. Existence
 *  checks read the ro-mounted assets dir; any fs error just drops the row. */
export async function buildMergedManifest(slug: string): Promise<AssetManifest> {
  const manifest = ((await disk.assetsManifest(slug)) ?? { items: [] }) as AssetManifest
  const items = Array.isArray(manifest.items) ? manifest.items : []
  let posts: PostBase[] = []
  try {
    posts = await listPosts(slug)
  } catch {
    // PB unavailable — serve the disk manifest rather than failing the read.
    return { ...manifest, items }
  }
  const assetsDir = join(DATA_ROOT, 'clients', slug, 'assets')
  // Existence must be checked before the pure merge (it is sync-injected);
  // probe every candidate filename once, in parallel.
  const candidates = new Set<string>()
  for (const post of posts) {
    for (const url of assetUrlsOf(post)) {
      const filename = assetFilenameFromUrl(slug, url)
      if (filename) candidates.add(filename)
    }
  }
  const present = new Set<string>()
  await Promise.all(
    [...candidates].map(async (filename) => {
      try {
        await access(join(assetsDir, filename))
        present.add(filename)
      } catch {
        /* missing or unreadable — skip */
      }
    }),
  )
  return { ...manifest, items: mergePostReferencedAssets(slug, items, posts, (f) => present.has(f)) }
}

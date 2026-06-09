// Disk + PB overlay merging for Phase 4 dashboard-driven writes.
//
// Viktor still owns the on-disk JSON (posts/*.json, suggestions.json,
// approvals.log). Staging-only dashboard writes land in PB overlay
// collections (posts_patches, suggestion_states, approvals_v2), and read
// endpoints merge the two so the dashboard sees its own optimistic state
// reflected back. Phase 5+ will fold these back into Viktor's writes.

import { withPb } from './pb.js'

interface PostCreatedRow {
  postId: string
  data: Record<string, unknown>
  ts: string
  actor?: string
}

export async function loadCreatedPosts(slug: string): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>()
  try {
    const rows = await withPb((pb) =>
      pb.collection('posts_created').getFullList<PostCreatedRow>({
        filter: `slug="${slug}"`,
        sort: 'ts',
      }),
    )
    for (const r of rows) {
      map.set(r.postId, { ...(r.data ?? {}), id: r.postId })
    }
  } catch {
    /* collection missing or empty */
  }
  return map
}

interface PostPatchRow {
  postId: string
  patch: Record<string, unknown>
  ts: string
}

export async function loadPostPatches(slug: string): Promise<Map<string, Record<string, unknown>>> {
  const merged = new Map<string, Record<string, unknown>>()
  try {
    const rows = await withPb((pb) =>
      pb.collection('posts_patches').getFullList<PostPatchRow>({
        filter: `slug="${slug}"`,
        sort: 'ts',
      }),
    )
    for (const r of rows) {
      const prev = merged.get(r.postId) ?? {}
      merged.set(r.postId, { ...prev, ...(r.patch ?? {}) })
    }
  } catch {
    /* empty overlay */
  }
  return merged
}

interface SuggestionStateRow {
  suggestionId: string
  status?: string
  priority?: number
  reason?: string
}

export async function loadSuggestionStates(
  slug: string,
): Promise<Map<string, SuggestionStateRow>> {
  const map = new Map<string, SuggestionStateRow>()
  try {
    const rows = await withPb((pb) =>
      pb.collection('suggestion_states').getFullList<SuggestionStateRow>({
        filter: `slug="${slug}"`,
      }),
    )
    for (const r of rows) map.set(r.suggestionId, r)
  } catch {
    /* empty overlay */
  }
  return map
}

interface AssetStateRow {
  assetId: string
  status?: 'active' | 'deleted'
}

export async function loadDeletedAssetIds(slug: string): Promise<Set<string>> {
  const deleted = new Set<string>()
  try {
    const rows = await withPb((pb) =>
      pb.collection('asset_states').getFullList<AssetStateRow>({
        filter: `slug="${slug}"`,
      }),
    )
    for (const r of rows) {
      if (r.status === 'deleted') deleted.add(r.assetId)
      else deleted.delete(r.assetId)
    }
  } catch {
    /* empty overlay */
  }
  return deleted
}

interface ApprovalV2Row {
  postId: string
  decision: 'in_review' | 'approved' | 'scheduled' | 'rejected'
  note?: string
  actor?: string
  ts?: string
}

export async function loadApprovalsV2(slug: string): Promise<ApprovalV2Row[]> {
  try {
    return await withPb((pb) =>
      pb.collection('approvals_v2').getFullList<ApprovalV2Row>({
        filter: `slug="${slug}"`,
        sort: 'ts',
      }),
    )
  } catch {
    return []
  }
}

/** Latest decision per post from approvals_v2. */
export async function latestApprovalByPost(slug: string): Promise<Map<string, ApprovalV2Row>> {
  const map = new Map<string, ApprovalV2Row>()
  for (const row of await loadApprovalsV2(slug)) map.set(row.postId, row)
  return map
}

// GF-58 — tenancy helpers shared by auth + the clients route.
//
// A dashboard user belongs to one or more agencies (via `memberships`). They may
// see a client only if that client's agency is one of theirs (platform admins
// see all). Everything is keyed by *slug text* to match the rest of the schema:
//   - a client's agency comes from clients/index.json `agency` (disk clients) or
//     the PB `clients.agency_slug` field (PB-created clients).
//   - a user's agencies come from `memberships.agency_slug`.

import { withPb } from './pb.js'
import { disk } from './diskData.js'

/** Agency slugs the given user belongs to. Empty = no agency memberships. */
export async function resolveUserScope(userId: string): Promise<string[]> {
  try {
    return await withPb(async (pb) => {
      const rows = await pb
        .collection('memberships')
        .getFullList<{ agency_slug: string }>({ filter: `user="${userId}"` })
      return rows.map((r) => r.agency_slug).filter((s): s is string => !!s)
    })
  } catch {
    return []
  }
}

const agencyCache = new Map<string, { agency: string | null; at: number }>()
const AGENCY_TTL_MS = 30_000

/** The agency slug that owns a client, or null if unknown/unassigned. */
export async function agencyForClient(slug: string): Promise<string | null> {
  const cached = agencyCache.get(slug)
  if (cached && Date.now() - cached.at < AGENCY_TTL_MS) return cached.agency

  let agency: string | null = null
  try {
    const idx = (await disk.clientIndex()) as { clients?: Array<{ slug: string; agency?: string }> } | null
    const entry = (idx?.clients ?? []).find((c) => c.slug === slug)
    if (entry?.agency) agency = entry.agency
  } catch {
    /* fall through to PB */
  }
  if (!agency) {
    try {
      const rec = await withPb((pb) =>
        pb.collection('clients').getFirstListItem<{ agency_slug?: string }>(`slug="${slug}"`),
      )
      if (rec.agency_slug) agency = rec.agency_slug
    } catch {
      /* unknown */
    }
  }
  agencyCache.set(slug, { agency, at: Date.now() })
  return agency
}

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

/**
 * GF-116 — whether a client with this slug exists at all, checking the same two
 * sources the client list does (disk `clients/index.json` + the PB `clients`
 * collection, see routes/clients.ts).
 *
 * Returns `null` when neither lookup could answer, so a caller never turns a
 * PocketBase outage into a confident "no such client".
 */
export async function clientExists(slug: string): Promise<boolean | null> {
  // Disk and PB are co-sources, not fallbacks: routes/clients.ts unions them, so
  // a slug missing from one may still exist in the other. `false` therefore
  // requires BOTH to have answered — one source replying 'not mine' is not an
  // absence, and treating it as one is how a lookup outage turns into a
  // confident, wrong 'no such client'.
  let diskAnswered = false
  let pbAnswered = false
  try {
    const idx = (await disk.clientIndex()) as { clients?: Array<{ slug?: string }> } | null
    if (idx) {
      diskAnswered = true
      if ((idx.clients ?? []).some((entry) => entry.slug === slug)) return true
    }
  } catch {
    /* disk unreadable — PB may still answer */
  }
  try {
    const rows = await withPb((pb) =>
      pb.collection('clients').getFullList<{ slug?: string }>({ filter: `slug="${slug}"` }),
    )
    pbAnswered = true
    if (rows.length > 0) return true
  } catch {
    /* PB unreachable or collection absent */
  }
  return diskAnswered && pbAnswered ? false : null
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

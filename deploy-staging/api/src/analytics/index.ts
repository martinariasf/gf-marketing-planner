// GF-113 — analytics provider selection.
//
// Mirrors `scheduling/index.ts` exactly: the provider comes from per-client
// config, defaulting to Postiz, and a client "has" analytics when a Postiz key is
// configured under Integrations (GF-11). Returning null means "not configured" —
// the caller turns that into `status: "no_key"`, which the tab shows as a real
// explanation instead of a blank panel full of zeros.

import { withPb } from '../pb.js'
import { loadPostizApiKey } from '../scheduling/postiz.js'
import { PostizAnalyticsProvider } from './postiz.js'
import { AnalyticsError, type AnalyticsProvider } from './provider.js'

export * from './provider.js'

type OrgConfigRec = { schedulingProvider?: string }

/** Read the client's configured provider. Analytics deliberately follows the
 *  SAME `schedulingProvider` field rather than introducing a second one: a client
 *  publishes and measures through one account, and two independent switches would
 *  let them drift into a state where we schedule on one backend and read numbers
 *  from another. */
async function readConfiguredProviderName(slug: string): Promise<string | null> {
  try {
    const rec = await withPb((pb) =>
      pb.collection('org_configs').getFirstListItem<OrgConfigRec>(`slug="${slug}"`),
    )
    const name = typeof rec.schedulingProvider === 'string' ? rec.schedulingProvider.trim() : ''
    return name || null
  } catch {
    return null
  }
}

/** Resolve the analytics provider for a client, or null when none is configured. */
export async function getAnalyticsProvider(slug: string): Promise<AnalyticsProvider | null> {
  const preferred = (await readConfiguredProviderName(slug)) ?? 'postiz'
  switch (preferred) {
    case 'postiz': {
      const apiKey = await loadPostizApiKey(slug)
      if (!apiKey) return null
      return new PostizAnalyticsProvider(apiKey)
    }
    default:
      throw new AnalyticsError(
        preferred,
        `Unknown analytics provider "${preferred}" configured for client "${slug}".`,
      )
  }
}

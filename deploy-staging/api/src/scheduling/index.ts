// GF-26 — scheduling provider selection.
//
// The selected provider comes from per-client config/integration, NOT a
// hard-wired backend. Today the only provider is Postiz, and a client "has"
// Postiz when an API key is configured for it under Integrations (GF-11). The
// `provider` field on org_configs lets a future deploy pin a different backend
// per client without touching route code; when unset we default to Postiz.

import { withPb } from '../pb.js'
import { PostizProvider, loadPostizApiKey } from './postiz.js'
import { SchedulingError, type SchedulingProvider } from './provider.js'

export * from './provider.js'
export { loadPostizApiKey } from './postiz.js'

type OrgConfigRec = { schedulingProvider?: string }

/** Read the client's preferred scheduling provider from org_configs, if any. */
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

/**
 * Resolve the scheduling provider for a client, or null if none is configured
 * (e.g. no Postiz key saved). Returning null lets the caller treat scheduling
 * as unavailable and surface a clear "configure an integration first" error,
 * rather than guessing.
 */
export async function getSchedulingProvider(slug: string): Promise<SchedulingProvider | null> {
  const preferred = (await readConfiguredProviderName(slug)) ?? 'postiz'
  switch (preferred) {
    case 'postiz': {
      const apiKey = await loadPostizApiKey(slug)
      if (!apiKey) return null
      return new PostizProvider(apiKey)
    }
    default:
      throw new SchedulingError(
        preferred,
        `Unknown scheduling provider "${preferred}" configured for client "${slug}".`,
      )
  }
}

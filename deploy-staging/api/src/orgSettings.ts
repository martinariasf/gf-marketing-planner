// GF-92 (B) — per-client dashboard configuration toggles, stored on the
// existing org_configs collection's `settings` json field.
//
// loadOrgSettings() is the single place that reads this value: it NEVER
// throws into a request path — on a DB miss, error, or malformed stored
// value it falls back to DEFAULTS. This is reused by the config GET route
// and by the approvals auto-schedule path (viktorOwned.ts).

import { withPb } from './pb.js'

export type OrgSettings = {
  showAiGeneratedLabel: boolean
  autoScheduleOnApprove: boolean
}

// showAiGeneratedLabel defaults to TRUE — GF-65 already shipped the "AI
// generated" badge on by default; this toggle must not silently regress it.
export const DEFAULTS: OrgSettings = {
  showAiGeneratedLabel: true,
  autoScheduleOnApprove: false,
}

function coerce(raw: unknown): Partial<OrgSettings> {
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const out: Partial<OrgSettings> = {}
  if (typeof obj.showAiGeneratedLabel === 'boolean') out.showAiGeneratedLabel = obj.showAiGeneratedLabel
  if (typeof obj.autoScheduleOnApprove === 'boolean') out.autoScheduleOnApprove = obj.autoScheduleOnApprove
  return out
}

export async function loadOrgSettings(slug: string): Promise<OrgSettings> {
  try {
    const rec = await withPb((pb) =>
      pb.collection('org_configs').getFirstListItem<{ settings?: unknown }>(`slug="${slug}"`),
    )
    return { ...DEFAULTS, ...coerce(rec.settings) }
  } catch {
    return { ...DEFAULTS }
  }
}

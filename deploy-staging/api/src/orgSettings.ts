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
  // GF-37 residual — per-client IANA timezone (e.g. "Europe/Berlin"). Used to
  // classify a post date as past/today/future by the CLIENT's calendar day
  // instead of the server's UTC day. Defaults to "UTC" so an existing client
  // that has never set this keeps exactly the UTC-based behavior it has
  // today — additive, not a breaking change.
  timezone: string
}

// showAiGeneratedLabel defaults to TRUE — GF-65 already shipped the "AI
// generated" badge on by default; this toggle must not silently regress it.
export const DEFAULTS: OrgSettings = {
  showAiGeneratedLabel: true,
  autoScheduleOnApprove: false,
  timezone: 'UTC',
}

// A timezone string is only trusted once Intl can actually resolve it —
// this is the single gate both the lenient reader (coerce, below) and the
// strict PUT validator (routes/planningConfig.ts) use, so a malformed or
// made-up zone name can never reach the calendar-day comparison in
// scheduling/sync.ts.
export function isValidIanaTimezone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz.trim()) return false
  try {
    // eslint-disable-next-line no-new -- constructed only to validate the zone
    new Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function coerce(raw: unknown): Partial<OrgSettings> {
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const out: Partial<OrgSettings> = {}
  if (typeof obj.showAiGeneratedLabel === 'boolean') out.showAiGeneratedLabel = obj.showAiGeneratedLabel
  if (typeof obj.autoScheduleOnApprove === 'boolean') out.autoScheduleOnApprove = obj.autoScheduleOnApprove
  // A stored value that fails validation (bad data, or a zone Node's ICU
  // no longer recognizes) falls back to DEFAULTS.timezone rather than
  // poisoning every date comparison for this client.
  if (isValidIanaTimezone(obj.timezone)) out.timezone = obj.timezone
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

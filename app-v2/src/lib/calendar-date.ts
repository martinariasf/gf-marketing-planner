/**
 * Shared helpers for post dates, which are plain calendar days
 * ("2026-09-01"), not instants. `new Date('2026-09-01')` parses a date-only
 * string as UTC midnight, and reading it back with LOCAL getters
 * (getFullYear/getMonth/getDate) rolls the date back one day for any client
 * west of Greenwich — Parque Biomas (Uruguay, UTC-3) hits this on every
 * month boundary, so a post on the 1st silently drops into the previous
 * month's bucket and vanishes from the calendar.
 *
 * SCOPE (GF-137 Layer-5 finding 2): these helpers read the LITERAL Y/M/D digits
 * and deliberately ignore any time/offset component. For the date-only values
 * this codebase actually stores that is exactly right. For a full-ISO value they
 * differ from `monthKeyFromIso`, which resolves the instant's calendar day in
 * the client's configured timezone — so a timestamped post could in principle
 * bucket into month M while displaying a day in M+1. No stored data hits this
 * today; if timestamped post dates are ever introduced, reconcile the two.
 *
 * These helpers parse the ISO string's Y/M/D fields directly instead of
 * routing through `new Date(iso)`, so they are immune to that failure
 * regardless of host timezone.
 */

/**
 * Parse a plain calendar day off the ISO string's Y/M/D fields and rebuild
 * it in LOCAL time. Never route a post date through `new Date(iso)` — see
 * file header.
 */
export function parseIsoDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const month = Number(m[2])
  // Reject an out-of-range month rather than letting Date roll it over:
  // "2026-13-01" would otherwise silently become Jan 2027 (GF-137 Layer-5
  // round 2, note 1). The pre-GF-137 monthKeyFromIso returned '' for this,
  // so rolling over would be a behavior change, not a fix.
  if (month < 1 || month > 12) return null
  const d = new Date(Number(m[1]), month - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** "YYYY-MM" straight off the ISO string prefix, never via `new Date(iso)`. */
export function monthKeyOfIsoDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(iso)
  if (!m) return ''
  const month = Number(m[2])
  if (month < 1 || month > 12) return ''
  return `${m[1]}-${m[2]}`
}

/**
 * Day-of-month straight off the ISO string, never via `new Date(iso)`.
 *
 * A post date is a plain calendar day ("2026-09-01"), but `new Date()` parses a
 * date-only string as UTC midnight and `.getDate()` then reads it in LOCAL time.
 * For any client west of Greenwich that rolls the date back one day — a post on
 * the 1st becomes the 31st of the previous month, which is not a day a calendar
 * grid renders at all, so the chip would silently vanish. Parque Biomas (Uruguay,
 * UTC-3) would hit this on every month boundary.
 */
export function dayOfIsoDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const day = Number(m[3])
  return day >= 1 && day <= 31 ? day : null
}

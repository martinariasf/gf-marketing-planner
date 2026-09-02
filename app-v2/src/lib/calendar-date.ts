/**
 * Shared helpers for post dates, which are plain calendar days
 * ("2026-09-01"), not instants. `new Date('2026-09-01')` parses a date-only
 * string as UTC midnight, and reading it back with LOCAL getters
 * (getFullYear/getMonth/getDate) rolls the date back one day for any client
 * west of Greenwich — Parque Biomas (Uruguay, UTC-3) hits this on every
 * month boundary, so a post on the 1st silently drops into the previous
 * month's bucket and vanishes from the calendar.
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
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** "YYYY-MM" straight off the ISO string prefix, never via `new Date(iso)`. */
export function monthKeyOfIsoDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(iso)
  return m ? `${m[1]}-${m[2]}` : ''
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

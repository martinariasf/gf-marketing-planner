import { getFormatLocale } from './format.ts'

export interface CalendarRangeConfig {
  startMonth: string
  endMonth: string
}

export interface PlanningMonth {
  key: string
  name: string
  label: string
  date: Date
  isCurrent: boolean
  isPast: boolean
  isFuture: boolean
}

export function monthKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function monthKeyFromIso(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '' : monthKeyFromDate(date)
}

export function defaultCalendarRange(now = new Date()): CalendarRangeConfig {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = addMonths(start, 2)
  return { startMonth: monthKeyFromDate(start), endMonth: monthKeyFromDate(end) }
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

export function parseMonthKey(key: string): Date | null {
  const match = key.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return new Date(year, month - 1, 1)
}

export function monthDiff(startKey: string, endKey: string): number {
  const start = parseMonthKey(startKey)
  const end = parseMonthKey(endKey)
  if (!start || !end) return Number.NaN
  return (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()
}

export function normalizeCalendarRange(
  range: CalendarRangeConfig | null | undefined,
  now = new Date(),
): CalendarRangeConfig {
  const fallback = defaultCalendarRange(now)
  if (!range) return fallback
  const diff = monthDiff(range.startMonth, range.endMonth)
  if (!Number.isFinite(diff) || diff < 0) return fallback
  if (diff > 5) {
    return { startMonth: range.startMonth, endMonth: monthKeyFromDate(addMonths(parseMonthKey(range.startMonth)!, 5)) }
  }
  return range
}

export function monthsInRange(range: CalendarRangeConfig, now = new Date()): PlanningMonth[] {
  const normalized = normalizeCalendarRange(range, now)
  const start = parseMonthKey(normalized.startMonth)!
  const diff = monthDiff(normalized.startMonth, normalized.endMonth)
  const currentKey = monthKeyFromDate(now)
  const locale = getFormatLocale()
  return Array.from({ length: diff + 1 }, (_, index) => {
    const date = addMonths(start, index)
    const key = monthKeyFromDate(date)
    return {
      key,
      name: date.toLocaleString(locale, { month: 'long' }),
      label: date.toLocaleString(locale, { month: 'short', year: 'numeric' }),
      date,
      isCurrent: key === currentKey,
      isPast: key < currentKey,
      isFuture: key > currentKey,
    }
  })
}

export function isIsoInMonthRange(iso: string, range: CalendarRangeConfig): boolean {
  const key = monthKeyFromIso(iso)
  if (!key) return false
  return key >= range.startMonth && key <= range.endMonth
}

// GF-37 residual — active per-client timezone for dateTiming()'s calendar-day
// comparison. Mirrors format.ts's `currentLocale`: a module-level value set
// once by ClientLayout (the single place that loads a client's OrgSettings)
// so the many scattered dateTiming() call sites across calendar.tsx and
// approval-kanban.tsx don't each need a timezone prop threaded down through
// StatusSelect / CompactPostCard / the kanban card.
//
// Left `undefined` until a client bundle loads (or for a caller — e.g. a
// test — that never wires this up at all), which falls back to dateTiming's
// original browser-local-day comparison. In the running app this is only a
// startup gap: ClientLayout always calls setDateTimingTimezone with a
// concrete value once data loads (settings.timezone itself defaults to
// 'UTC' — see api-client.ts), so in practice every real dateTiming() call
// after the first render uses either the client's configured timezone or
// 'UTC', matching the API's own default. That is an intentional change from
// "whoever's browser is viewing this" to "the client's configured zone,
// defaulting to UTC" — see the Layer-5 review round 1, finding 2 note on
// OrgSettings.timezone in api-client.ts for why that's the fix, not a
// regression.
let activeTimezone: string | undefined

/** Called by ClientLayout whenever the loaded client's settings change. */
export function setDateTimingTimezone(timezone: string | undefined | null): void {
  const trimmed = timezone?.trim()
  activeTimezone = trimmed ? trimmed : undefined
}

/** Exposed for tests that want to assert on the currently-active value. */
export function getDateTimingTimezone(): string | undefined {
  return activeTimezone
}

/**
 * Format `date` as the `YYYY-MM-DD` calendar day it falls on within
 * `timezone`. `en-CA` is the standard trick for getting `Intl.DateTimeFormat`
 * to emit an ISO-shaped (and therefore lexicographically sortable) string.
 *
 * Falls back to UTC if `timezone` isn't resolvable by this browser's ICU
 * (Layer-5 review round 1 finding 6 — mirrors sync.ts's server-side
 * fallback). `dateTiming` runs inside render and drag/drop event handlers,
 * so an uncaught `Intl` RangeError here would crash the React tree, not just
 * fail one request.
 */
function calendarDayKeyInTimezone(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date)
  }
}

/** A stored date carrying no time component, e.g. `2026-06-15` (GF-16).
 *  Mirrors deploy-staging/api/src/scheduling/sync.ts's DATE_ONLY exactly —
 *  the two must agree on which values get calendar-day vs exact-instant
 *  treatment, or the client and server disagree about "past" (see below). */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * GF-37 — classify a post date as past/today/future by CALENDAR DAY.
 *
 * Read the Y-M-D straight off the string rather than via `new Date(iso)`.
 * A stored date may be a plain `YYYY-MM-DD` (GF-16 — that is exactly what the
 * calendar's date input writes), and `new Date('2026-06-15')` is parsed as UTC
 * midnight. Read back with the local getters in any UTC-negative zone that
 * becomes the 14th, so *today's* post reported 'past' and the Programmed
 * control was disabled with a misleading error. The prefix regex handles both
 * `2026-06-15` and `2026-06-15T09:00:00Z`, matching the normalization idiom
 * GF-16 already uses in `toDateInputValue`.
 *
 * GF-37 residual, closed: "today" is computed in the CLIENT's configured
 * timezone (`timezone`, default the module-level `activeTimezone` set by
 * ClientLayout from the loaded OrgSettings) rather than whoever's browser
 * happens to be viewing the dashboard. When no timezone is available at all
 * (param omitted AND activeTimezone unset) this falls back to the original
 * local-getters comparison, so existing callers/tests that don't pass one
 * keep their exact prior behavior.
 *
 * Layer-5 review round 1 finding 3 — a value that carries a real time
 * component (not `DATE_ONLY`) commits to an exact instant, so "past" must
 * mean "that instant has already happened" — exactly the API's
 * `isPastDate()` rule (`ts <= now`) — not "earlier calendar day". Before this
 * fix, a full-ISO post timestamped earlier today (e.g. 09:00, viewed at
 * 15:00) still read as 'today' here, so Programmed stayed enabled in the UI
 * while the API rejected the same post with a 422 — precisely the "client
 * says allowed, API answers 422" symptom this whole fix exists to eliminate.
 * A future instant still falls through to the calendar-day comparison below
 * for the 'today' vs 'future' distinction (styling only, never blocking).
 *
 * Layer-5 review round 2, finding 1 — that calendar-day comparison must use
 * the calendar day the INSTANT falls on in `timezone`, not the Y-M-D digits
 * literally written in the string. A full-ISO string's date portion denotes
 * a day in whatever offset it was written with (typically UTC, via a `Z`
 * suffix) — for a client far enough ahead of that offset, the instant can
 * already be a different calendar day locally. Repro that was wrong before
 * this fix: `now = 2026-08-31T23:30:00Z`, timezone Australia/Sydney (UTC+10,
 * no DST in August), post dated `2026-08-31T23:45:00Z` (15 minutes in the
 * future). The exact-instant check above correctly does not call it 'past';
 * but Sydney's calendar day for that instant is already Sep 1, matching
 * Sydney's `now`-derived "today" — so it must read 'today', not fall back
 * one day short by reusing the string's literal "Aug 31". A date-only value
 * has no instant to convert (the string itself IS the client's calendar
 * day), so this only applies to full-ISO values.
 */
export function dateTiming(
  iso: string,
  now = new Date(),
  timezone: string | undefined = activeTimezone,
): 'past' | 'today' | 'future' {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return 'future'
  const isDateOnly = DATE_ONLY.test(iso ?? '')
  let instant: Date | null = null
  if (!isDateOnly) {
    const ts = new Date(iso).getTime()
    if (!Number.isNaN(ts)) {
      if (ts <= now.getTime()) return 'past'
      instant = new Date(ts)
    }
  }

  if (timezone) {
    const todayKey = calendarDayKeyInTimezone(now, timezone)
    const whenKey = instant ? calendarDayKeyInTimezone(instant, timezone) : `${m[1]}-${m[2]}-${m[3]}`
    if (whenKey < todayKey) return 'past'
    if (whenKey === todayKey) return 'today'
    return 'future'
  }
  const whenDate = instant ?? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const day = new Date(whenDate.getFullYear(), whenDate.getMonth(), whenDate.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (day < today) return 'past'
  if (day === today) return 'today'
  return 'future'
}

import { getFormatLocale } from './format'

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
// StatusSelect / CompactPostCard / the kanban card. Left `undefined` until a
// client bundle loads, which preserves dateTiming's original browser-local-day
// behavior for any caller (e.g. a future test) that never wires this up.
let activeTimezone: string | undefined

/** Called by ClientLayout whenever the loaded client's settings change. */
export function setDateTimingTimezone(timezone: string | undefined | null): void {
  activeTimezone = timezone && timezone.trim() ? timezone : undefined
}

/** Exposed for tests that want to assert on the currently-active value. */
export function getDateTimingTimezone(): string | undefined {
  return activeTimezone
}

/**
 * Format `date` as the `YYYY-MM-DD` calendar day it falls on within
 * `timezone`. `en-CA` is the standard trick for getting `Intl.DateTimeFormat`
 * to emit an ISO-shaped (and therefore lexicographically sortable) string.
 */
function calendarDayKeyInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

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
 */
export function dateTiming(
  iso: string,
  now = new Date(),
  timezone: string | undefined = activeTimezone,
): 'past' | 'today' | 'future' {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  if (!m) return 'future'
  const whenKey = `${m[1]}-${m[2]}-${m[3]}`
  if (timezone) {
    const todayKey = calendarDayKeyInTimezone(now, timezone)
    if (whenKey < todayKey) return 'past'
    if (whenKey === todayKey) return 'today'
    return 'future'
  }
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (day < today) return 'past'
  if (day === today) return 'today'
  return 'future'
}

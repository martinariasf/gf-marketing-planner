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
  return Array.from({ length: diff + 1 }, (_, index) => {
    const date = addMonths(start, index)
    const key = monthKeyFromDate(date)
    return {
      key,
      name: date.toLocaleString('en-US', { month: 'long' }),
      label: date.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
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

export function dateTiming(iso: string, now = new Date()): 'past' | 'today' | 'future' {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'future'
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (day < today) return 'past'
  if (day === today) return 'today'
  return 'future'
}

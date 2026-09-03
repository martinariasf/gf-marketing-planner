import { describe, expect, it } from 'vitest'
import { fmtCalendarDay, fmtCalendarDayShort } from './format'

// These formatters must render a post's plain calendar day (`date`, e.g.
// "2026-09-01") from its Y/M/D fields directly (via parseIsoDay), never via
// `new Date(iso)` + local getters — that path rolls the day back for any host
// west of Greenwich. Pinning the exact day here is the point of the test.

describe('fmtCalendarDay', () => {
  it('formats a date-only value as its own calendar day', () => {
    expect(fmtCalendarDay('2026-09-01')).toBe('Sep 1, 2026')
  })

  it('formats the last day of a month correctly', () => {
    expect(fmtCalendarDay('2026-09-30')).toBe('Sep 30, 2026')
  })

  it('returns the raw string unchanged for an unparseable value', () => {
    expect(fmtCalendarDay('not-a-date')).toBe('not-a-date')
  })
})

describe('fmtCalendarDayShort', () => {
  it('formats a date-only value as its own calendar day', () => {
    expect(fmtCalendarDayShort('2026-09-01')).toBe('Sep 1')
  })

  it('returns the raw string unchanged for an unparseable value', () => {
    expect(fmtCalendarDayShort('not-a-date')).toBe('not-a-date')
  })
})

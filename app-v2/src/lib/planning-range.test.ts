import { afterEach, describe, expect, it } from 'vitest'
import { getDateTimingTimezone, monthKeyFromIso, setDateTimingTimezone } from './planning-range'

// GF-137 — monthKeyFromIso follows the same DATE_ONLY vs exact-instant split
// GF-37 established for dateTiming in this file. See monthKeyFromIso's own
// comment block for why `new Date(iso)` + local getters is the wrong tool for
// a plain calendar day.
describe('monthKeyFromIso', () => {
  const originalTimezone = getDateTimingTimezone()
  afterEach(() => {
    setDateTimingTimezone(originalTimezone)
  })

  it('reads the month straight off a date-only value on the 1st of the month', () => {
    expect(monthKeyFromIso('2026-09-01')).toBe('2026-09')
  })

  it('reads the month straight off a date-only value on the last day of the month', () => {
    expect(monthKeyFromIso('2026-09-30')).toBe('2026-09')
  })

  it('resolves a full-ISO instant to the calendar day it falls on, in the active timezone', () => {
    setDateTimingTimezone('UTC')
    expect(monthKeyFromIso('2026-09-01T00:00:00.000Z')).toBe('2026-09')
  })

  it('falls back to UTC for a full-ISO instant when no timezone is configured', () => {
    setDateTimingTimezone(undefined)
    expect(monthKeyFromIso('2026-08-31T23:30:00.000Z')).toBe('2026-08')
  })

  it('returns empty string for unparseable input', () => {
    expect(monthKeyFromIso('not-a-date')).toBe('')
  })
})

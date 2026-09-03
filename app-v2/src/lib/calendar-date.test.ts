import { describe, expect, it } from 'vitest'
import { dayOfIsoDay, monthKeyOfIsoDay, parseIsoDay } from './calendar-date'

describe('monthKeyOfIsoDay', () => {
  it('reads the month straight off the string', () => {
    expect(monthKeyOfIsoDay('2026-09-01')).toBe('2026-09')
  })

  it('handles a full ISO timestamp input', () => {
    expect(monthKeyOfIsoDay('2026-09-01T00:00:00.000Z')).toBe('2026-09')
  })

  it('returns empty string for an unparseable value', () => {
    expect(monthKeyOfIsoDay('not-a-date')).toBe('')
  })
})

describe('dayOfIsoDay', () => {
  it('reads the day straight off the string', () => {
    expect(dayOfIsoDay('2026-09-01')).toBe(1)
  })

  it('handles the first day of a month', () => {
    expect(dayOfIsoDay('2026-09-01')).toBe(1)
    expect(monthKeyOfIsoDay('2026-09-01')).toBe('2026-09')
  })

  it('handles the last day of a month', () => {
    expect(dayOfIsoDay('2026-09-30')).toBe(30)
    expect(monthKeyOfIsoDay('2026-09-30')).toBe('2026-09')
  })

  it('handles a full ISO timestamp input', () => {
    expect(dayOfIsoDay('2026-09-01T00:00:00.000Z')).toBe(1)
  })

  it('returns null for an unparseable value', () => {
    expect(dayOfIsoDay('not-a-date')).toBeNull()
  })
})

describe('parseIsoDay', () => {
  it('rebuilds the date in local time regardless of host timezone', () => {
    const d = parseIsoDay('2026-09-01')
    expect(d).not.toBeNull()
    // Assert on local getters — this is exactly what would break under the
    // UTC-parse bug (e.g. Aug 31 for a UTC-3 host), so pinning these values
    // is the point of the test.
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(8) // 0-indexed: September
    expect(d?.getDate()).toBe(1)
  })

  it('keeps working for a full ISO timestamp input', () => {
    const d = parseIsoDay('2026-09-01T00:00:00.000Z')
    expect(d).not.toBeNull()
    expect(d?.getFullYear()).toBe(2026)
    expect(d?.getMonth()).toBe(8)
    expect(d?.getDate()).toBe(1)
  })

  it('returns null for an unparseable value', () => {
    expect(parseIsoDay('not-a-date')).toBeNull()
  })
})

// GF-137 Layer-5 round 2, note 1 — an out-of-range month must not roll over.
// The pre-GF-137 monthKeyFromIso returned '' here, so rolling "2026-13-01"
// into Jan 2027 would be a behavior change introduced by the de-duplication.
describe('out-of-range month', () => {
  it('monthKeyOfIsoDay returns empty for month 13', () => {
    expect(monthKeyOfIsoDay('2026-13-01')).toBe('')
  })
  it('monthKeyOfIsoDay returns empty for month 00', () => {
    expect(monthKeyOfIsoDay('2026-00-10')).toBe('')
  })
  it('parseIsoDay returns null for month 13 instead of rolling to Jan 2027', () => {
    expect(parseIsoDay('2026-13-01')).toBeNull()
  })
  it('still accepts a valid December date', () => {
    expect(monthKeyOfIsoDay('2026-12-31')).toBe('2026-12')
    expect(parseIsoDay('2026-12-31')?.getMonth()).toBe(11)
  })
})

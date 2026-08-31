// GF-37 follow-up, Layer-5 review round 1 finding 7a — app-v2 has no test
// runner (no vitest/jest in package.json), so `dateTiming()` has never had
// committed, repeatable coverage; PR #52's own verification for it was an ad
// hoc manual check, not a test. This script is the checked-in equivalent:
// plain assertions against the REAL module (not a reimplementation), runnable
// with Node's native TypeScript support — no new dependency.
//
// Run: node --experimental-strip-types app-v2/scripts/check-date-timing.ts
// Exits non-zero on any failure, so it can be wired into CI later without
// adding a test framework first.

import { dateTiming, setDateTimingTimezone, getDateTimingTimezone } from '../src/lib/planning-range.ts'

let failures = 0

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    failures++
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  } else {
    console.log(`ok   ${label}`)
  }
}

// ── No timezone wired up at all: original browser-local-day behavior ───────
setDateTimingTimezone(undefined)
assertEqual(getDateTimingTimezone(), undefined, 'getDateTimingTimezone reflects an explicit reset to undefined')
{
  const now = new Date(2026, 7, 31) // Aug 31 2026, local
  assertEqual(dateTiming('2026-08-31', now), 'today', 'no timezone: local-getters today')
  assertEqual(dateTiming('2026-08-30', now), 'past', 'no timezone: local-getters past')
  assertEqual(dateTiming('2026-09-01', now), 'future', 'no timezone: local-getters future')
}

// ── Explicit timezone param overrides the module-level default ─────────────
{
  // Same negative-offset case as the API's sync.test.ts, so client and
  // server logic are checked against the same scenario.
  const now = new Date('2026-08-31T01:30:00Z')
  assertEqual(
    dateTiming('2026-08-30', now, 'America/Montevideo'),
    'today',
    'explicit timezone param: Montevideo negative-offset "today" is not past',
  )
  assertEqual(
    dateTiming('2026-08-30', now, 'UTC'),
    'past',
    'sanity: naive UTC comparison would (wrongly) call the same post past',
  )
}

// ── setDateTimingTimezone (what ClientLayout actually calls) ───────────────
{
  setDateTimingTimezone('Australia/Sydney')
  assertEqual(getDateTimingTimezone(), 'Australia/Sydney', 'setDateTimingTimezone stores the active zone')
  const now = new Date('2026-08-31T23:30:00Z') // Sydney local: 2026-09-01T09:30, AEST no-DST in August
  assertEqual(
    dateTiming('2026-08-31', now),
    'past',
    'module-level timezone: Sydney positive-offset "yesterday" (UTC still shows today) is past',
  )
  assertEqual(dateTiming('2026-09-01', now), 'today', 'module-level timezone: Sydney\'s actual today')
  setDateTimingTimezone(undefined)
}

// ── Layer-5 review round 1 finding 3: date-only vs full-ISO must not agree
//    with the API's isPastDate on WHETHER something is past, or the client
//    can show "Programmed" enabled for a post the API 422s. ─────────────────
{
  const now = new Date('2026-06-15T12:00:00Z')
  setDateTimingTimezone('UTC')
  assertEqual(
    dateTiming('2026-06-15T09:00:00Z', now),
    'past',
    'full-ISO earlier today (09:00, now is 12:00) is past by EXACT INSTANT, not just calendar day',
  )
  assertEqual(
    dateTiming('2026-06-15T15:00:00Z', now),
    'today',
    'full-ISO later today (15:00, now is 12:00) is still today, not blocked',
  )
  assertEqual(
    dateTiming('2026-06-15', now),
    'today',
    'date-only "today" keeps calendar-day semantics (no time-of-day commitment)',
  )
  setDateTimingTimezone(undefined)
}

// ── Layer-5 review round 1 finding 6: an unresolvable timezone must not
//    throw inside dateTiming (would crash the React tree mid-render). ──────
{
  const now = new Date('2026-08-31T12:00:00Z')
  let threw = false
  try {
    dateTiming('2026-08-31', now, 'Not/A_Real_Zone')
  } catch {
    threw = true
  }
  assertEqual(threw, false, 'an unresolvable timezone falls back to UTC instead of throwing')
}

// ── DST spring-forward, Europe/Berlin 2026-03-29 (matches sync.test.ts) ────
{
  const justBefore = new Date('2026-03-29T00:59:00Z') // 01:59 CET local
  const justAfter = new Date('2026-03-29T01:01:00Z') // 03:01 CEST local
  for (const now of [justBefore, justAfter]) {
    assertEqual(
      dateTiming('2026-03-29', now, 'Europe/Berlin'),
      'today',
      `DST transition (${now.toISOString()}): Berlin's calendar day is still March 29`,
    )
    assertEqual(
      dateTiming('2026-03-28', now, 'Europe/Berlin'),
      'past',
      `DST transition (${now.toISOString()}): March 28 is past either side of the transition`,
    )
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`)
  process.exit(1)
}
console.log('\nAll dateTiming checks passed.')

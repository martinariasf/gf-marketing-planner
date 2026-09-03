import { test } from 'node:test'
import assert from 'node:assert/strict'
import { monthKeyOf } from './posts.js'

// GF-137 — timezone rollback regression test.
//
// WHY THIS EXISTS: post dates are stored date-only ("2026-09-01"). `new
// Date(iso)` parses that as UTC midnight, but reading it back with LOCAL
// getters (getFullYear/getMonth) rolled a post dated the 1st into the previous
// month on any server west of Greenwich. monthKeyOf now derives the key from
// the string prefix instead. These tests lock that fix.

test('monthKeyOf buckets a date-only string to its own month', () => {
  assert.equal(monthKeyOf('2026-09-01'), '2026-09')
})

test('monthKeyOf buckets a date-only string on a month boundary correctly', () => {
  assert.equal(monthKeyOf('2026-08-31'), '2026-08')
})

test('monthKeyOf buckets a full ISO timestamp to its UTC calendar month', () => {
  assert.equal(monthKeyOf('2026-09-01T10:00:00Z'), '2026-09')
})

test('monthKeyOf returns empty string for unparseable input', () => {
  assert.equal(monthKeyOf('not-a-date'), '')
  assert.equal(monthKeyOf(''), '')
  assert.equal(monthKeyOf(undefined), '')
  assert.equal(monthKeyOf(null), '')
})

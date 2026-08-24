// GF-110 — the reconcile pass that raises `max` on live PocketBase text fields.
//
// The bug these guard against: six fields were declared `{ type: 'text',
// maxSize: N }`. `maxSize` is not a `text` option, so PB dropped it, left
// `max: 0`, and enforced its own 5000-character default — while ensureCollections
// only ever appended MISSING fields and so never revisited an existing one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { textMaxRaises, PB_DEFAULT_TEXT_MAX, type LiveField } from './ensureCollections.js'

const live = (over: Partial<LiveField> & { name: string }): LiveField => ({
  id: `f_${over.name}`,
  type: 'text',
  max: 0,
  ...over,
})

test('raises a text field left at PB default up to the declared max', () => {
  const raises = textMaxRaises(
    [{ name: 'summary', type: 'text', max: 1_000_000 }],
    [live({ name: 'summary' })],
  )
  assert.equal(raises.length, 1)
  assert.equal(raises[0].name, 'summary')
  assert.equal(raises[0].from, PB_DEFAULT_TEXT_MAX)
  assert.equal(raises[0].to, 1_000_000)
  assert.equal(raises[0].field.max, 1_000_000)
})

test('preserves the live field id and every other option when patching max', () => {
  // PB treats a field arriving without its original id as a NEW column, which
  // would drop the existing data. The patched object must be the live one.
  const raises = textMaxRaises(
    [{ name: 'body', type: 'text', required: true, max: 20_000 }],
    [live({ name: 'body', id: 'text999', required: true, pattern: '^x', min: 3 })],
  )
  assert.equal(raises.length, 1)
  assert.equal(raises[0].field.id, 'text999')
  assert.equal(raises[0].field.required, true)
  assert.equal(raises[0].field.pattern, '^x')
  assert.equal(raises[0].field.min, 3)
})

test('leaves an already-correct field alone, so repeated boots write nothing', () => {
  const raises = textMaxRaises(
    [{ name: 'summary', type: 'text', max: 1_000_000 }],
    [live({ name: 'summary', max: 1_000_000 })],
  )
  assert.deepEqual(raises, [])
})

test('never lowers an existing larger max', () => {
  const raises = textMaxRaises(
    [{ name: 'summary', type: 'text', max: 1_000 }],
    [live({ name: 'summary', max: 50_000 })],
  )
  assert.deepEqual(raises, [])
})

test('treats a declared max at or below the PB default as no change needed', () => {
  // postizApiKeyEnc declares 5000, which is exactly the default already in
  // force — correcting the spelling should not produce a pointless write.
  const raises = textMaxRaises(
    [{ name: 'postizApiKeyEnc', type: 'text', max: 5_000 }],
    [live({ name: 'postizApiKeyEnc' })],
  )
  assert.deepEqual(raises, [])
})

test('ignores non-text live fields and fields absent from the spec', () => {
  const raises = textMaxRaises(
    [{ name: 'toolEvent', type: 'json', maxSize: 1_000_000 }],
    [
      live({ name: 'toolEvent', type: 'json' }),
      live({ name: 'undeclared' }),
    ],
  )
  assert.deepEqual(raises, [])
})

test('raises only the fields that need it within one collection', () => {
  const raises = textMaxRaises(
    [
      { name: 'summary', type: 'text', max: 1_000_000 },
      { name: 'prompt', type: 'text', max: 1_000_000 },
      { name: 'title', type: 'text', max: 300 },
    ],
    [
      live({ name: 'summary' }),
      live({ name: 'prompt', max: 1_000_000 }),
      live({ name: 'title', max: 300 }),
    ],
  )
  assert.deepEqual(
    raises.map((r) => r.name),
    ['summary'],
  )
})

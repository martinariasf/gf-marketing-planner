// GF-110 — mapping a PocketBase error onto an actionable problem+json response.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { asPbError } from './pbError.js'

/** Shaped exactly like the ClientResponseError captured from the prod logs
 *  when a >5000-character Markdown upload was rejected. */
const pbValidationError = () =>
  Object.assign(new Error('Failed to create record.'), {
    url: 'http://mp-prod-pb:8090/api/collections/information_sources/records',
    status: 400,
    response: {
      data: {
        summary: {
          code: 'validation_max_text_constraint',
          message: 'Must be no more than 5000 character(s).',
        },
      },
      message: 'Failed to create record.',
      status: 400,
    },
  })

test('names the offending field and its reason in the detail', () => {
  const p = asPbError(pbValidationError())
  assert.ok(p)
  assert.equal(p.status, 400)
  assert.equal(p.title, 'Bad Request')
  assert.match(p.detail, /summary/)
  assert.match(p.detail, /no more than 5000 character/)
  assert.equal(p.fields.summary, 'Must be no more than 5000 character(s).')
})

test('does not leak the internal PocketBase host into the response', () => {
  const p = asPbError(pbValidationError())
  assert.ok(p)
  assert.doesNotMatch(p.detail, /mp-prod-pb|8090/)
})

test('passes a PB 403 through as 403 rather than flattening to 400', () => {
  const err = Object.assign(new Error('Only superusers can perform this action.'), {
    status: 403,
    response: { data: {}, message: 'Only superusers can perform this action.', status: 403 },
  })
  const p = asPbError(err)
  assert.ok(p)
  assert.equal(p.status, 403)
  assert.equal(p.title, 'Forbidden')
})

test('reports a PB 5xx as our 500 — the caller did nothing wrong', () => {
  const err = Object.assign(new Error('Something went wrong.'), {
    status: 502,
    response: { data: {}, message: 'Something went wrong.', status: 502 },
  })
  const p = asPbError(err)
  assert.ok(p)
  assert.equal(p.status, 500)
})

test('returns null for an ordinary error so the 500 path still handles it', () => {
  assert.equal(asPbError(new Error('boom')), null)
  assert.equal(asPbError('boom'), null)
  assert.equal(asPbError(null), null)
  assert.equal(asPbError({ status: 400 }), null) // no response envelope
})

test('falls back to the bare message when PB sends no field errors', () => {
  const err = Object.assign(new Error('Failed to create record.'), {
    status: 400,
    response: { data: {}, message: 'Failed to create record.', status: 400 },
  })
  const p = asPbError(err)
  assert.ok(p)
  assert.equal(p.detail, 'Failed to create record.')
  assert.deepEqual(p.fields, {})
})

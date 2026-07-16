import { test } from 'node:test'
import assert from 'node:assert/strict'
import { approvalDecisionForPatch } from './approvalFromPatch.js'

// GF-73 — a status PATCH must surface as an approval decision, because the
// displayed lane prefers approval.status over status. These cases pin the
// contract: workflow keys map to a decision, terminal/unknown statuses don't,
// and a PATCH that doesn't change the visible lane records nothing.

test('workflow status differing from the approval lane → decision', () => {
  const current = { status: 'published', approval: { status: 'approved' } }
  assert.equal(approvalDecisionForPatch(current, 'in_review'), 'in_review')
})

test('every workflow key is accepted when it changes the lane', () => {
  const current = { status: 'idea', approval: { status: 'approved' } }
  for (const d of ['drafting', 'in_review', 'scheduled', 'needs_revision', 'rejected']) {
    assert.equal(approvalDecisionForPatch(current, d), d)
  }
})

test('decision equal to the current approval lane → null (idempotent PATCH)', () => {
  const current = { status: 'idea', approval: { status: 'in_review' } }
  assert.equal(approvalDecisionForPatch(current, 'in_review'), null)
})

test('no approval history: lane falls back to status', () => {
  assert.equal(approvalDecisionForPatch({ status: 'drafting' }, 'drafting'), null)
  assert.equal(approvalDecisionForPatch({ status: 'drafting' }, 'in_review'), 'in_review')
})

test('non-workflow statuses never record a decision', () => {
  const current = { status: 'idea', approval: { status: 'approved' } }
  for (const s of ['published', 'deleted', 'idea', 'nonsense', '', undefined, null, 42]) {
    assert.equal(approvalDecisionForPatch(current, s), null)
  }
})

test('malformed current post shapes are tolerated', () => {
  assert.equal(approvalDecisionForPatch({}, 'approved'), 'approved')
  assert.equal(approvalDecisionForPatch({ approval: {} }, 'approved'), 'approved')
  assert.equal(
    approvalDecisionForPatch({ status: 7 as unknown, approval: { status: [] as unknown } }, 'approved'),
    'approved',
  )
})

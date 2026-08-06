import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coalescePost } from './post.js'

// GF-92 (A2) — an `approval` block without a `status` key (the shape Viktor
// writes) must inherit the post's top-level `status`, not silently default to
// 'idea'. Defaulting to 'idea' put scheduled/approved posts back in Draft
// because laneFor() prefers approval.status over status.

test('approval without a status key inherits the post status', () => {
  const post = coalescePost({ status: 'scheduled', approval: { version: 2 } })
  assert.equal((post.approval as { status: unknown }).status, 'scheduled')
})

test('approval already carrying a status is left untouched', () => {
  const post = coalescePost({ status: 'scheduled', approval: { status: 'approved' } })
  assert.equal((post.approval as { status: unknown }).status, 'approved')
})

test('missing approval object defaults status from the post status', () => {
  const post = coalescePost({ status: 'approved' })
  assert.equal((post.approval as { status: unknown }).status, 'approved')
})

test('missing approval and missing status both default to idea', () => {
  const post = coalescePost({})
  assert.equal((post.approval as { status: unknown }).status, 'idea')
})

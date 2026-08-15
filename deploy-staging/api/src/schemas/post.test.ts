import { test } from 'node:test'
import assert from 'node:assert/strict'
import { coalescePost, postCreateSchema, postPatchSchema } from './post.js'

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

// GF-69 (Layer-5 review, finding 2) — a story has exactly one image, the same
// shape as a single-image post, so the structural format derivation below can
// never infer it. An explicit format:"story" must survive coalescePost
// untouched, even when the post also happens to carry a single slide (which
// on its own would never make it a carousel either — length must be > 1).

test('coalescePost keeps an explicit "story" format untouched, even with a slide present', () => {
  const post = coalescePost({ format: 'story', slides: [{ image: 'https://example.com/a.png' }] })
  assert.equal(post.format, 'story')
})

test('coalescePost derives "carousel" only for an EMPTY format with >1 slides', () => {
  const post = coalescePost({
    slides: [{ image: 'https://example.com/a.png' }, { image: 'https://example.com/b.png' }],
  })
  assert.equal(post.format, 'carousel')
})

test('coalescePost derives "single image" for an empty/missing format with <=1 slides', () => {
  assert.equal(coalescePost({}).format, 'single image')
  assert.equal(coalescePost({ slides: [{ image: 'https://example.com/a.png' }] }).format, 'single image')
})

// GF-69 (Layer-5 review, finding 2) — `format` stays free-form on the wire on
// purpose (a strict enum would 422 legacy rows and third-party writes). These
// tests lock that contract so a future "let's tighten format into an enum"
// change gets caught here instead of silently 422ing real data.

test('postCreateSchema accepts format:"story"', () => {
  const parsed = postCreateSchema.parse({ date: '2026-08-20', title: 'A story post', format: 'story' })
  assert.equal(parsed.format, 'story')
})

test('postCreateSchema accepts an arbitrary non-canonical format string', () => {
  const parsed = postCreateSchema.parse({ date: '2026-08-20', title: 'A reel post', format: 'reel' })
  assert.equal(parsed.format, 'reel')
})

test('postPatchSchema accepts format:"story"', () => {
  const parsed = postPatchSchema.parse({ format: 'story' })
  assert.equal(parsed.format, 'story')
})

test('postPatchSchema accepts an arbitrary non-canonical format string', () => {
  const parsed = postPatchSchema.parse({ format: 'reel' })
  assert.equal(parsed.format, 'reel')
})

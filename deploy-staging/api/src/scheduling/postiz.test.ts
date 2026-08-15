import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toPostizPayload } from './postiz.js'

// GF-69 — toPostizPayload must tell Postiz's Instagram provider whether a post
// is a Story or a feed post, WITHOUT restructuring the existing flat payload
// (that restructuring is GF-26's problem). Verified contract (instagram.dto.ts):
// `settings: { __type: 'instagram', post_type: 'post' | 'story' }`.

test('story post targeting instagram sends settings.post_type = "story"', () => {
  const post = {
    id: 'p1',
    slug: 'acme',
    title: 'Behind the scenes',
    channels: ['instagram'],
    format: 'story',
  }
  const payload = toPostizPayload(post, '2026-08-20T09:00:00Z')
  assert.deepEqual(payload.settings, { __type: 'instagram', post_type: 'story' })
})

test('story post NOT targeting instagram sends no instagram settings block', () => {
  const post = {
    id: 'p2',
    slug: 'acme',
    title: 'LinkedIn-only story-labelled post',
    channels: ['linkedin'],
    format: 'story',
  }
  const payload = toPostizPayload(post, '2026-08-20T09:00:00Z')
  assert.equal('settings' in payload, false)
})

test('non-story instagram post sends explicit settings.post_type = "post"', () => {
  const post = {
    id: 'p3',
    slug: 'acme',
    title: 'Regular feed post',
    channels: ['instagram'],
    format: 'single image',
  }
  const payload = toPostizPayload(post, '2026-08-20T09:00:00Z')
  assert.deepEqual(payload.settings, { __type: 'instagram', post_type: 'post' })
})

// Existing (pre-GF-69) fields stay byte-identical for a non-story post.
test('other payload fields are unchanged for a non-story post', () => {
  const post = {
    id: 'p4',
    slug: 'acme',
    title: 'Regular feed post',
    copy: 'Some copy',
    channel: 'instagram',
    image: 'https://example.com/img.png',
  }
  const payload = toPostizPayload(post, '2026-08-20T09:00:00Z')
  assert.equal(payload.type, 'scheduled')
  assert.equal(payload.date, new Date('2026-08-20T09:00:00Z').toISOString())
  assert.deepEqual(payload.channels, ['instagram'])
  assert.equal(payload.content, 'Regular feed post\n\nSome copy')
  assert.deepEqual(payload.media, ['https://example.com/img.png'])
})

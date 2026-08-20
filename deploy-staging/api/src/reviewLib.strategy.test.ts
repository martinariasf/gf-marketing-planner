import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizePost, stripVisuals, parseLinkView } from './reviewLib.js'

// GF-105 — Share Strategy.
//
// A strategy link is a PLAN review: the client signs off pillar / format /
// platforms / visual description / date BEFORE any creative is produced. The
// "no pictures" rule is enforced server-side, in stripVisuals, precisely so
// that no image URL is ever handed to an unauthenticated party — hiding images
// in CSS would still ship them. These tests are the lock on that guarantee.

const FULL_POST = {
  id: 'p1',
  date: '2026-09-04',
  channel: 'instagram',
  channels: ['instagram', 'linkedin', 'facebook'],
  format: 'carousel',
  pillar: 'Education',
  title: 'Five ways to cut your planning time',
  copy: 'Long form copy the reviewer may still read.',
  cta: 'Learn more',
  hashtags: ['#planning'],
  image: 'https://cdn.example.com/cover.png',
  slides: [
    { image: 'https://cdn.example.com/s1.png', caption: 'Cover: bold number five on brand green.' },
    { image: 'https://cdn.example.com/s2.png' },
  ],
  media: [
    {
      type: 'video',
      url: 'https://cdn.example.com/clip.mp4',
      thumbnail: 'https://cdn.example.com/thumb.jpg',
      assetId: 'asset_123',
      caption: 'Close crop of the terminal mid-scan.',
    },
  ],
}

// ── parseLinkView ───────────────────────────────────────────────────────────

test('parseLinkView defaults to content for absent, empty and junk values', () => {
  // Every pre-GF-105 link has no `view` at all; it must keep behaving as a
  // content review rather than silently becoming a different kind of review.
  assert.equal(parseLinkView(undefined), 'content')
  assert.equal(parseLinkView(null), 'content')
  assert.equal(parseLinkView(''), 'content')
  assert.equal(parseLinkView('Strategy'), 'content')
  assert.equal(parseLinkView('nonsense'), 'content')
  assert.equal(parseLinkView(42), 'content')
  assert.equal(parseLinkView({}), 'content')
  assert.equal(parseLinkView('content'), 'content')
})

test('parseLinkView passes strategy through', () => {
  assert.equal(parseLinkView('strategy'), 'strategy')
})

// ── sanitizePost: all target platforms ──────────────────────────────────────

test('sanitizePost emits every channel, with the primary first', () => {
  const out = sanitizePost(FULL_POST)
  assert.deepEqual(out.channels, ['instagram', 'linkedin', 'facebook'])
  assert.equal(out.channel, 'instagram')
})

test('sanitizePost derives channels from a single-channel post', () => {
  const out = sanitizePost({ id: 'p2', date: '2026-09-05', title: 'x', channel: 'linkedin' })
  assert.deepEqual(out.channels, ['linkedin'])
  assert.equal(out.channel, 'linkedin')
})

test('sanitizePost de-duplicates channels and drops non-strings', () => {
  const out = sanitizePost({
    id: 'p3',
    date: '2026-09-06',
    title: 'x',
    channel: 'instagram',
    channels: ['instagram', 'instagram', 7, '', 'linkedin'],
  })
  assert.deepEqual(out.channels, ['instagram', 'linkedin'])
  assert.equal(out.channel, 'instagram')
})

test('sanitizePost never flips the stored primary channel (L5 #1)', () => {
  // coalescePost() keeps `channel` == `channels[0]`, so this shape should not
  // occur in practice — but sanitizePost must not DEPEND on the caller having
  // coalesced. Taking channels[0] as the primary here would have silently
  // changed the primary channel on existing CONTENT links too, since the
  // sanitizer runs for both views.
  const out = sanitizePost({
    id: 'p_flip',
    date: '2026-09-09',
    title: 'x',
    channel: 'instagram',
    channels: ['linkedin', 'facebook'],
  })
  assert.equal(out.channel, 'instagram', 'the stored primary must survive')
  assert.equal(out.channels?.[0], 'instagram', 'the primary must lead the list')
  // …and nothing the post targeted may be dropped.
  assert.deepEqual(out.channels, ['instagram', 'linkedin', 'facebook'])
})

test('sanitizePost moves the primary to the front without duplicating it', () => {
  const out = sanitizePost({
    id: 'p_order',
    date: '2026-09-10',
    title: 'x',
    channel: 'facebook',
    channels: ['linkedin', 'facebook'],
  })
  assert.deepEqual(out.channels, ['facebook', 'linkedin'])
  assert.equal(out.channel, 'facebook')
})

test('sanitizePost omits channels entirely when the post has none', () => {
  const out = sanitizePost({ id: 'p4', date: '2026-09-07', title: 'x' })
  assert.equal(out.channels, undefined)
  assert.equal(out.channel, undefined)
})

// ── stripVisuals: the "no pictures" guarantee ───────────────────────────────

test('stripVisuals removes every image-bearing field', () => {
  const out = stripVisuals(sanitizePost(FULL_POST))
  assert.equal(out.image, undefined)
  assert.ok(out.slides)
  for (const s of out.slides!) {
    assert.equal((s as { image?: string }).image, undefined)
  }
  assert.ok(out.media)
  for (const m of out.media!) {
    assert.equal(m.url, undefined)
    assert.equal(m.thumbnail, undefined)
    assert.equal(m.assetId, undefined)
  }
})

test('stripVisuals keeps the plan: captions, pillar, format, platforms, date, copy', () => {
  const out = stripVisuals(sanitizePost(FULL_POST))
  assert.equal(out.slides?.[0]?.caption, 'Cover: bold number five on brand green.')
  assert.equal(out.media?.[0]?.caption, 'Close crop of the terminal mid-scan.')
  assert.equal(out.media?.[0]?.type, 'video')
  assert.equal(out.pillar, 'Education')
  assert.equal(out.format, 'carousel')
  assert.deepEqual(out.channels, ['instagram', 'linkedin', 'facebook'])
  assert.equal(out.date, '2026-09-04')
  assert.equal(out.copy, 'Long form copy the reviewer may still read.')
  assert.equal(out.title, 'Five ways to cut your planning time')
})

test('stripVisuals keeps captionless slides so a carousel still reports its length', () => {
  const out = stripVisuals(sanitizePost(FULL_POST))
  assert.equal(out.slides?.length, 2)
  assert.equal(out.slides?.[1]?.caption, undefined)
})

test('no URL survives stripVisuals anywhere in the serialized payload', () => {
  // The blunt instrument: whatever the shape, nothing that looks like a media
  // URL may appear in what actually goes over the wire. This is the test that
  // catches a NEW image-bearing field being added to PublicPost later without
  // stripVisuals being taught about it.
  const wire = JSON.stringify(stripVisuals(sanitizePost(FULL_POST)))
  assert.ok(!wire.includes('cdn.example.com'), `leaked a media host: ${wire}`)
  assert.ok(!wire.includes('asset_123'), `leaked an asset id: ${wire}`)
  assert.ok(!/https?:\/\//.test(wire), `leaked a URL: ${wire}`)
})

test('stripVisuals leaves a post with no visuals at all untouched in substance', () => {
  const out = stripVisuals(sanitizePost({ id: 'p5', date: '2026-09-08', title: 'text only', pillar: 'News' }))
  assert.equal(out.image, undefined)
  assert.equal(out.slides, undefined)
  assert.equal(out.media, undefined)
  assert.equal(out.pillar, 'News')
})

test('sanitizePost (content link) still carries images through untouched', () => {
  // The other half of the guarantee: a CONTENT link must be unaffected by
  // GF-105. Everything the creative review renders is still there.
  const out = sanitizePost(FULL_POST)
  assert.equal(out.image, 'https://cdn.example.com/cover.png')
  assert.equal(out.slides?.[0]?.image, 'https://cdn.example.com/s1.png')
  assert.equal(out.media?.[0]?.url, 'https://cdn.example.com/clip.mp4')
  assert.equal(out.media?.[0]?.thumbnail, 'https://cdn.example.com/thumb.jpg')
})

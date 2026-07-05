import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assetFilenameFromUrl,
  mergePostReferencedAssets,
  type ManifestItem,
} from './assetsManifest.js'
import type { PostBase } from './posts.js'

const SLUG = 'staging-demo'
const fileUrl = (name: string) => `/api/v1/clients/${SLUG}/assets/files/${name}`

// --- assetFilenameFromUrl ----------------------------------------------------
test('assetFilenameFromUrl: root-relative and absolute own-asset URLs resolve', () => {
  assert.equal(assetFilenameFromUrl(SLUG, fileUrl('a.png')), 'a.png')
  assert.equal(
    assetFilenameFromUrl(SLUG, `https://staging.marketing.gfinnov.com/api/v1/clients/${SLUG}/assets/files/v.mp4`),
    'v.mp4',
  )
})

test('assetFilenameFromUrl: URL-encoded names decode', () => {
  assert.equal(assetFilenameFromUrl(SLUG, fileUrl('my%20file.png')), 'my file.png')
})

test('assetFilenameFromUrl: foreign hosts and other clients are ignored', () => {
  assert.equal(assetFilenameFromUrl(SLUG, 'https://images.unsplash.com/photo-123'), null)
  assert.equal(assetFilenameFromUrl(SLUG, '/api/v1/clients/other-client/assets/files/x.png'), null)
  assert.equal(assetFilenameFromUrl(SLUG, ''), null)
  assert.equal(assetFilenameFromUrl(SLUG, undefined), null)
})

// --- mergePostReferencedAssets ----------------------------------------------
const exists = () => true

test('merge: post cover image missing from manifest gains a derived row', () => {
  const posts = [{ id: 'p001', status: 'draft', image: fileUrl('cover.png') } as PostBase]
  const items = mergePostReferencedAssets(SLUG, [], posts, exists)
  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'ref-cover.png')
  assert.equal(items[0].filename, 'cover.png')
  assert.equal(items[0].kind, 'image')
  assert.deepEqual(items[0].usedInPosts, ['p001'])
})

test('merge: filenames already in the manifest are never duplicated', () => {
  const manifest: ManifestItem[] = [{ id: 'a001', filename: 'cover.png', kind: 'image' }]
  const posts = [{ id: 'p001', image: fileUrl('cover.png') } as PostBase]
  const items = mergePostReferencedAssets(SLUG, manifest, posts, exists)
  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'a001')
})

test('merge: files missing on disk are skipped', () => {
  const posts = [{ id: 'p001', image: fileUrl('gone.png') } as PostBase]
  const items = mergePostReferencedAssets(SLUG, [], posts, () => false)
  assert.equal(items.length, 0)
})

test('merge: media[].url videos derive kind=video', () => {
  const posts = [
    { id: 'p001', media: [{ type: 'video', url: fileUrl('reel_10s.mp4') }] } as unknown as PostBase,
  ]
  const items = mergePostReferencedAssets(SLUG, [], posts, exists)
  assert.equal(items.length, 1)
  assert.equal(items[0].kind, 'video')
  assert.equal(items[0].id, 'ref-reel_10s.mp4')
})

test('merge: slides and repeated references aggregate usedInPosts once per post', () => {
  const posts = [
    { id: 'p001', image: fileUrl('s1.png'), slides: [{ image: fileUrl('s1.png') }, { image: fileUrl('s2.png') }] } as unknown as PostBase,
    { id: 'p002', image: fileUrl('s2.png') } as PostBase,
  ]
  const items = mergePostReferencedAssets(SLUG, [], posts, exists)
  const byName = new Map(items.map((i) => [i.filename, i]))
  assert.deepEqual(byName.get('s1.png')?.usedInPosts, ['p001'])
  assert.deepEqual(byName.get('s2.png')?.usedInPosts, ['p001', 'p002'])
})

test('merge: finalApproved derives from any referencing post status', () => {
  const posts = [
    { id: 'p001', status: 'draft', image: fileUrl('d.png') } as PostBase,
    { id: 'p002', status: 'published', image: fileUrl('pub.png') } as PostBase,
  ]
  const items = mergePostReferencedAssets(SLUG, [], posts, exists)
  const byName = new Map(items.map((i) => [i.filename, i]))
  assert.equal(byName.get('d.png')?.finalApproved, false)
  assert.equal(byName.get('pub.png')?.finalApproved, true)
})

test('merge: repeated calls are deterministic (same ids, same order)', () => {
  const posts = [
    { id: 'p001', image: fileUrl('b.png') } as PostBase,
    { id: 'p002', image: fileUrl('a.png') } as PostBase,
  ]
  const a = mergePostReferencedAssets(SLUG, [], posts, exists)
  const b = mergePostReferencedAssets(SLUG, [], posts, exists)
  assert.deepEqual(a, b)
})

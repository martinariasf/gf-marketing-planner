import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sizeLimitFor, isAllowedVideoMime, safeFilenameFor } from './inspiration.js'

// --- sizeLimitFor -------------------------------------------------------------
test('sizeLimitFor: image gets the 15 MB cap', () => {
  assert.equal(sizeLimitFor('image/png', 'photo.png'), 15_000_000)
})

test('sizeLimitFor: video/* mime gets the 100 MB cap', () => {
  assert.equal(sizeLimitFor('video/mp4', 'clip.mp4'), 100_000_000)
})

test('sizeLimitFor: video-looking extension gets the 100 MB cap even with a generic mime', () => {
  assert.equal(sizeLimitFor('application/octet-stream', 'clip.webm'), 100_000_000)
  assert.equal(sizeLimitFor('application/octet-stream', 'clip.mov'), 100_000_000)
})

test('sizeLimitFor: mime is authoritative over a misleading video-like extension (defect B)', () => {
  // scan.mov is really a PNG per its mime — must get the image cap, not the video cap.
  assert.equal(sizeLimitFor('image/png', 'scan.mov'), 15_000_000)
})

test('sizeLimitFor: explicit video/mp4 mime with no/unusual extension still gets the video cap', () => {
  assert.equal(sizeLimitFor('video/mp4', 'upload'), 100_000_000)
})

// --- isAllowedVideoMime --------------------------------------------------------
// NOTE: signature changed from isAllowedVideoMime(mime) to
// isAllowedVideoMime(mime, filename) — refusing an upload now also depends
// on whether the extension can resolve a kind when the mime is generic.
test('isAllowedVideoMime: the three servable video types pass', () => {
  assert.equal(isAllowedVideoMime('video/mp4', 'clip.mp4'), true)
  assert.equal(isAllowedVideoMime('video/webm', 'clip.webm'), true)
  assert.equal(isAllowedVideoMime('video/quicktime', 'clip.mov'), true)
})

test('isAllowedVideoMime: a disallowed explicit video mime is rejected even with a plausible extension', () => {
  assert.equal(isAllowedVideoMime('video/x-msvideo', 'clip.avi'), false)
})

test('isAllowedVideoMime: non-video mimes are not subject to the allow-list', () => {
  assert.equal(isAllowedVideoMime('image/png', 'photo.png'), true)
})

test('isAllowedVideoMime: unrecognized mime + unrecognized extension is refused (defect A)', () => {
  assert.equal(isAllowedVideoMime('application/octet-stream', 'movie.avi'), false)
  assert.equal(isAllowedVideoMime('', 'clip.mkv'), false)
})

// --- safeFilenameFor -----------------------------------------------------------
test('safeFilenameFor: extensionless mp4 gets .mp4 from its mime type', () => {
  assert.equal(safeFilenameFor('video/mp4', 'upload'), 'upload.mp4')
})

test('safeFilenameFor: extensionless png gets .png from its mime type', () => {
  assert.equal(safeFilenameFor('image/png', 'upload'), 'upload.png')
})

test('safeFilenameFor: a filename with a valid extension is kept as-is', () => {
  assert.equal(safeFilenameFor('image/jpeg', 'photo.jpg'), 'photo.jpg')
})

test('safeFilenameFor: unknown mime with no extension falls back to .png', () => {
  assert.equal(safeFilenameFor('application/octet-stream', 'blob'), 'blob.png')
})

test('safeFilenameFor: a .txt name with a video/mp4 mime is not kept — assetFiles.ts cannot serve .txt as video', () => {
  assert.equal(safeFilenameFor('video/mp4', 'clip.txt'), 'clip.mp4')
})

test('safeFilenameFor: a .mp4 name with a video/mp4 mime is kept as-is', () => {
  assert.equal(safeFilenameFor('video/mp4', 'clip.mp4'), 'clip.mp4')
})

test('safeFilenameFor: a .jpg name with an image/jpeg mime is kept as-is', () => {
  assert.equal(safeFilenameFor('image/jpeg', 'photo.jpg'), 'photo.jpg')
})

test('safeFilenameFor: an unknown extension with an unknown mime falls back to .png', () => {
  assert.equal(safeFilenameFor('application/octet-stream', 'weird.xyz'), 'weird.png')
})

test('safeFilenameFor: an image mime keeps precedence over a misleading video-like extension (defect B)', () => {
  assert.equal(safeFilenameFor('image/png', 'scan.mov'), 'scan.png')
})

test('safeFilenameFor: a .mov name with a video/quicktime mime is kept as-is', () => {
  assert.equal(safeFilenameFor('video/quicktime', 'clip.mov'), 'clip.mov')
})

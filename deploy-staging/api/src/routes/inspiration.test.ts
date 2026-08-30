import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sizeLimitFor, isAcceptableUpload, safeFilenameFor } from './inspiration.js'

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

// --- isAcceptableUpload --------------------------------------------------------
// NOTE: signature changed from isAcceptableUpload(mime) to
// isAcceptableUpload(mime, filename) — refusing an upload now also depends
// on whether the extension can resolve a kind when the mime is generic.
test('isAcceptableUpload: the three servable video types pass', () => {
  assert.equal(isAcceptableUpload('video/mp4', 'clip.mp4'), true)
  assert.equal(isAcceptableUpload('video/webm', 'clip.webm'), true)
  assert.equal(isAcceptableUpload('video/quicktime', 'clip.mov'), true)
})

test('isAcceptableUpload: a disallowed explicit video mime is rejected even with a plausible extension', () => {
  assert.equal(isAcceptableUpload('video/x-msvideo', 'clip.avi'), false)
})

test('isAcceptableUpload: non-video mimes are not subject to the allow-list', () => {
  assert.equal(isAcceptableUpload('image/png', 'photo.png'), true)
})

test('isAcceptableUpload: unrecognized mime + unrecognized extension is refused (defect A)', () => {
  assert.equal(isAcceptableUpload('application/octet-stream', 'movie.avi'), false)
  assert.equal(isAcceptableUpload('', 'clip.mkv'), false)
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

// --- Round 3: regression fix (defect A widened too far) ------------------------
// An explicit image/* mime must resolve to 'image' even when unrecognized —
// other upload screens (assets.tsx, context.tsx, references.tsx) send
// accept="image/*" and rely on formats like bmp/avif/heic working, because
// assetFiles.ts falls back to PB's stored Content-Type when the extension is
// unknown. Only refuse when NEITHER mime nor extension identifies anything.

test('sizeLimitFor: an unrecognized but explicit image/* mime still gets the image cap', () => {
  assert.equal(sizeLimitFor('image/bmp', 'photo.bmp'), 15_000_000)
})

test('isAcceptableUpload: an unrecognized but explicit image/* mime is accepted', () => {
  assert.equal(isAcceptableUpload('image/bmp', 'photo.bmp'), true)
})

test('isAcceptableUpload: an unrecognized image/* mime with no extension is accepted', () => {
  assert.equal(isAcceptableUpload('image/bmp', 'photo'), true)
})

test('isAcceptableUpload: movie.avi + application/octet-stream is still refused (round 2 fix must hold)', () => {
  assert.equal(isAcceptableUpload('application/octet-stream', 'movie.avi'), false)
})

test('safeFilenameFor: an unrecognized image/* mime KEEPS the existing extension (photo.bmp stays .bmp)', () => {
  assert.equal(safeFilenameFor('image/bmp', 'photo.bmp'), 'photo.bmp')
})

test('safeFilenameFor: an unrecognized image/* mime with no extension at all falls back to .png', () => {
  assert.equal(safeFilenameFor('image/bmp', 'photo'), 'photo.png')
})

test('safeFilenameFor: scan.mov + image/png is still stored as .png (round 2 fix must not regress)', () => {
  assert.equal(safeFilenameFor('image/png', 'scan.mov'), 'scan.png')
})

test('safeFilenameFor: a recognized image/* mime still overrides a misleading video-like extension', () => {
  // image/png is a KNOWN EXT_BY_MIME key, so today's override behaviour holds.
  assert.equal(safeFilenameFor('image/png', 'clip.mov'), 'clip.png')
})

test('safeFilenameFor: clip.mov + video/quicktime is kept as-is (video cap, unaffected by the image fix)', () => {
  assert.equal(safeFilenameFor('video/quicktime', 'clip.mov'), 'clip.mov')
})

// --- Round 3: check-order fix (type check before size check) -------------------
// A 20 MB .txt must be refused as an unsupported TYPE, not as oversize — pin
// the ordering by asserting on the helper that decides it, independent of
// which check the route runs first.
test('isAcceptableUpload: a 20 MB-class .txt with a generic mime is refused as unsupported type', () => {
  assert.equal(isAcceptableUpload('text/plain', 'notes.txt'), false)
})

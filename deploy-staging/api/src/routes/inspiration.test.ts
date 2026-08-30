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

// --- isAllowedVideoMime --------------------------------------------------------
test('isAllowedVideoMime: the three servable video types pass', () => {
  assert.equal(isAllowedVideoMime('video/mp4'), true)
  assert.equal(isAllowedVideoMime('video/webm'), true)
  assert.equal(isAllowedVideoMime('video/quicktime'), true)
})

test('isAllowedVideoMime: a disallowed video mime is rejected', () => {
  assert.equal(isAllowedVideoMime('video/x-msvideo'), false)
})

test('isAllowedVideoMime: non-video mimes are not subject to the allow-list', () => {
  assert.equal(isAllowedVideoMime('image/png'), true)
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

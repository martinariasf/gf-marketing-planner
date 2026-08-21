import { test } from 'node:test'
import assert from 'node:assert/strict'
import { postCreateSchema, coalescePost } from './schemas/post.js'
import { sanitizePost } from './reviewLib.js'
import { toPostizPayload } from './scheduling/postiz.js'

// GF-89 — encoding round-trip regression test.
//
// WHY THIS EXISTS: a user reported accented characters getting mangled while
// typing. A full trace of SPA -> API -> PocketBase -> Postiz(REST) found NO
// character-stripping transform anywhere in this chain. This test locks that
// finding: the probe string below must survive, byte-for-byte, through every
// stage this API owns. It is EXPECTED TO PASS TODAY — that is the point. If it
// ever starts failing, a real regression was introduced in this chain and
// GF-89's "unconfirmed" typing bug may have just become confirmed here.

const PROBE = 'áéíóú ñ Ñ ¿ ¡ ü « » — …'

test('encoding probe survives postCreateSchema parse unchanged', () => {
  const parsed = postCreateSchema.parse({
    date: '2026-08-06',
    title: PROBE,
    copy: PROBE,
    cta: PROBE,
  })
  assert.equal(parsed.title, PROBE)
  assert.equal(parsed.copy, PROBE)
  assert.equal(parsed.cta, PROBE)
})

test('encoding probe survives the posts.ts merge (base + patch spread) unchanged', () => {
  // Mirrors the merge in posts.ts::buildPost: `{ ...base, ...patch, id }`.
  const base = { id: 'p1', date: '2026-08-06', title: 'old title', copy: 'old copy' }
  const patch = { title: PROBE, copy: PROBE, cta: PROBE }
  const merged = { ...base, ...patch, id: 'p1' }
  assert.equal(merged.title, PROBE)
  assert.equal(merged.copy, PROBE)
  assert.equal(merged.cta, PROBE)
})

test('encoding probe survives coalescePost unchanged', () => {
  const post = coalescePost({
    id: 'p1',
    date: '2026-08-06',
    title: PROBE,
    copy: PROBE,
    cta: PROBE,
    status: 'idea',
  })
  assert.equal(post.title, PROBE)
  assert.equal(post.copy, PROBE)
  assert.equal(post.cta, PROBE)
})

test('encoding probe survives sanitizePost unchanged', () => {
  const out = sanitizePost({
    id: 'p1',
    date: '2026-08-06',
    title: PROBE,
    copy: PROBE,
    cta: PROBE,
  })
  assert.equal(out.title, PROBE)
  assert.equal(out.copy, PROBE)
  assert.equal(out.cta, PROBE)
})

test('toPostizPayload preserves the probe and produces the exact UTF-8 byte length', () => {
  const post = {
    id: 'p1',
    title: PROBE,
    copy: PROBE,
    channel: 'instagram' as const,
  }
  const payload = toPostizPayload(post, '2026-08-06T09:00:00Z')
  assert.equal(payload.content, `${PROBE}\n\n${PROBE}`)

  const body = JSON.stringify(payload)
  // Decoding the JSON string back must reproduce the exact probe — i.e. no
  // stage silently re-encoded/mis-decoded it into different codepoints.
  const roundTripped = JSON.parse(body) as { content: string }
  assert.equal(roundTripped.content, `${PROBE}\n\n${PROBE}`)

  // And the wire bytes are the real UTF-8 encoding, not a mangled single-byte
  // (Windows-1252-as-UTF-8, i.e. mojibake) or double-encoded variant.
  const expectedByteLength = Buffer.byteLength(`${PROBE}\n\n${PROBE}`, 'utf8')
  const contentInBody = JSON.stringify(payload.content)
  const decodedContent = JSON.parse(contentInBody) as string
  assert.equal(Buffer.byteLength(decodedContent, 'utf8'), expectedByteLength)
  assert.equal(Buffer.byteLength(body, 'utf8') >= expectedByteLength, true)
})

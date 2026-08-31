import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// GF-29 — generated assets are NOT immutable. The image-generation skill tells
// the agent, for PIL edits of an existing picture, to save over the same path
// ("the file overwrites in place"). The route used to answer
// `Cache-Control: public, max-age=86400` on the claim that filenames are
// unique, which pinned the stale bytes in the browser for a day: refetching the
// post returned the same (correct) URL and the <img> re-rendered from cache, so
// neither the automatic refetch nor the reload button could surface the edit.
//
// DATA_ROOT is read at module load, so it must be set before the import.

const root = await mkdtemp(join(tmpdir(), 'gf29-assets-'))
await mkdir(join(root, 'clients', 'acme', 'assets'), { recursive: true })
const file = join(root, 'clients', 'acme', 'assets', 'p1.png')
await writeFile(file, 'AAAA')
process.env.DATA_ROOT = root

const { assetFiles } = await import('./assetFiles.js')
const URL_ = 'http://x/clients/acme/assets/files/p1.png'

test('GF-29: an asset is served revalidatable, not cached as immutable', async () => {
  const res = await assetFiles.request(URL_)
  assert.equal(res.status, 200)
  const cc = res.headers.get('cache-control') ?? ''
  assert.match(cc, /no-cache/, 'assets must be revalidated, never pinned for a day')
  assert.doesNotMatch(cc, /max-age=8640{2}/, 'the 24h immutable cache is the GF-29 bug')
  assert.ok(res.headers.get('etag'), 'a validator is required or revalidation costs a full re-download')
})

test('GF-29: an unchanged asset revalidates to a cheap 304', async () => {
  const first = await assetFiles.request(URL_)
  const etag = first.headers.get('etag')!
  const again = await assetFiles.request(URL_, { headers: { 'if-none-match': etag } })
  assert.equal(again.status, 304)
})

test('GF-29: overwriting an asset in place makes the new bytes visible', async () => {
  const first = await assetFiles.request(URL_)
  const stale = first.headers.get('etag')!

  // Same byte count as the original ('AAAA' -> 'BBBB'): this isolates the
  // mtime component of the ETag. A same-size overwrite is exactly the case
  // where dropping mtimeMs from the validator would silently regress (the
  // size component alone would tie), so unlike an overwrite that also
  // changes length, this proves mtime is actually load-bearing.
  await new Promise((r) => setTimeout(r, 20))
  await writeFile(file, 'BBBB')

  const after = await assetFiles.request(URL_, { headers: { 'if-none-match': stale } })
  assert.equal(after.status, 200, 'a stale validator must not win after an in-place edit')
  assert.notEqual(after.headers.get('etag'), stale)
  assert.equal(await after.text(), 'BBBB')
})

test('GF-29: If-Modified-Since is honored when the client has no ETag yet', async () => {
  const first = await assetFiles.request(URL_)
  const lastModified = first.headers.get('last-modified')!
  assert.ok(lastModified, 'Last-Modified must be set for IMS-only clients/intermediaries to revalidate against')

  const notYetModified = await assetFiles.request(URL_, {
    headers: { 'if-modified-since': lastModified },
  })
  assert.equal(notYetModified.status, 304)
  assert.equal(notYetModified.headers.get('last-modified'), lastModified, '304 responses must carry Last-Modified too')

  // An in-place overwrite after that Last-Modified must be visible even to a
  // client that only sends If-Modified-Since (no ETag support).
  await new Promise((r) => setTimeout(r, 1100)) // IMS is second-resolution (HTTP-date)
  await writeFile(file, 'CCCC')
  const after = await assetFiles.request(URL_, { headers: { 'if-modified-since': lastModified } })
  assert.equal(after.status, 200, 'a stale If-Modified-Since date must not win after an in-place edit')
  assert.equal(await after.text(), 'CCCC')
})

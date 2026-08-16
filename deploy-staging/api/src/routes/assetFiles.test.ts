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

  // Exactly what the agent's PIL edit path does: same filename, new content.
  await new Promise((r) => setTimeout(r, 20))
  await writeFile(file, 'BBBBBB')

  const after = await assetFiles.request(URL_, { headers: { 'if-none-match': stale } })
  assert.equal(after.status, 200, 'a stale validator must not win after an in-place edit')
  assert.notEqual(after.headers.get('etag'), stale)
  assert.equal(await after.text(), 'BBBBBB')
})

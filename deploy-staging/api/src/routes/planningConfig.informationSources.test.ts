import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-116 — GET /clients/:slug/information-sources.
//
// This is the read that makes an uploaded document reach the agent. The bug it
// closes was not in this handler: the endpoint worked, nothing ever told Viktor
// it existed. What IS tested here is the diagnostic added alongside that fix —
// an empty list caused by querying the wrong workspace must not look identical
// to an empty list caused by a client having no source material, because those
// two being indistinguishable is why the failure read as "the file does not
// exist". `clientExists` runs for real; only PocketBase and the disk index are
// faked.

process.env.BOOTSTRAP_TOKENS = 'admin_test:admin:*,agent_test:agent:acme'

/** slug -> information_sources rows the fake PB holds. */
let sources: Record<string, Array<Record<string, unknown>>> = {}
/** Slugs the fake PB `clients` collection knows about. */
let pbClients: string[] = []
/** Slugs the fake disk index knows about, or null for "index unreadable". */
let diskClients: string[] | null = []
/** Every filter string the fake PB was asked for, in order. */
const filtersSeen: Array<{ collection: string; filter: string }> = []

/** Pull the slug out of the `slug="x"`-style filters these routes build. */
function slugFromFilter(filter: string): string {
  return filter.match(/slug="([^"]*)"/)?.[1] ?? ''
}

mock.module('../audit.js', { namedExports: { audit: async () => {} } })

mock.module('../diskData.js', {
  namedExports: {
    disk: {
      clientIndex: async () =>
        diskClients === null ? null : { clients: diskClients.map((slug) => ({ slug })) },
    },
  },
})

mock.module('../pb.js', {
  namedExports: {
    withPb: async (fn: (pb: unknown) => unknown) =>
      fn({
        collection: (name: string) => ({
          getFullList: async (opts?: { filter?: string }) => {
            const filter = opts?.filter ?? ''
            filtersSeen.push({ collection: name, filter })
            const slug = slugFromFilter(filter)
            if (name === 'clients') {
              return pbClients.includes(slug) ? [{ slug }] : []
            }
            if (name === 'information_sources') {
              const rows = sources[slug] ?? []
              return filter.includes('approved=true') ? rows.filter((r) => r.approved) : rows
            }
            return []
          },
        }),
      }),
    verifyUserToken: async () => null,
    pb: {},
  },
})

const { planningConfig } = await import('./planningConfig.js')

function reset() {
  sources = {}
  pbClients = []
  diskClients = []
  filtersSeen.length = 0
}

async function get(path: string, token = 'admin_test') {
  const res = await planningConfig.request(path, { headers: { Authorization: `Bearer ${token}` } })
  return { res, body: (await res.json()) as Record<string, unknown> }
}

test('a real client with no source material returns a plain empty list, no warning', async () => {
  reset()
  diskClients = ['acme']
  const { res, body } = await get('/clients/acme/information-sources')
  assert.equal(res.status, 200)
  assert.deepEqual(body.items, [])
  assert.equal(body.warning, undefined, 'a known-but-empty client must not be flagged as unknown')
})

test('a slug no client owns says so instead of looking like an empty workspace', async () => {
  reset()
  diskClients = ['acme']
  const { res, body } = await get('/clients/ghost/information-sources')
  assert.equal(res.status, 200, 'stays 200 — a slug can be live without a clients row')
  assert.deepEqual(body.items, [])
  assert.equal(body.slug, 'ghost')
  assert.match(String(body.warning), /No client "ghost" exists/)
  assert.match(String(body.warning), /workspace is wrong/)
})

test('a client known only to PocketBase is not reported as unknown', async () => {
  // The staging agent's own slug is a PB-created client absent from the disk
  // index (routes/clients.ts merges both). Flagging it would have made this
  // diagnostic fire on exactly the workspace GF-116 is about.
  reset()
  diskClients = ['acme']
  pbClients = ['staging-demo']
  const { body } = await get('/clients/staging-demo/information-sources')
  assert.deepEqual(body.items, [])
  assert.equal(body.warning, undefined)
})

test('neither lookup answering yields no warning rather than a confident wrong one', async () => {
  reset()
  diskClients = null // index unreadable; fake PB still answers, so this stays determinable
  pbClients = ['acme']
  const { body } = await get('/clients/acme/information-sources')
  assert.equal(body.warning, undefined)
})

test('an uploaded document comes back with its full text in summary', async () => {
  reset()
  diskClients = ['acme']
  const longText = 'A'.repeat(16_819) // the GF-110 fixture size
  sources.acme = [{ id: 's1', title: 'transcript.md', summary: longText, approved: true }]
  const { res, body } = await get('/clients/acme/information-sources')
  assert.equal(res.status, 200)
  const items = body.items as Array<Record<string, unknown>>
  assert.equal(items.length, 1)
  assert.equal((items[0]!.summary as string).length, 16_819)
  assert.equal(body.warning, undefined)
})

test('?approved=true filters to sources the client has cleared for the agent', async () => {
  reset()
  diskClients = ['acme']
  sources.acme = [
    { id: 's1', title: 'cleared', summary: 'yes', approved: true },
    { id: 's2', title: 'withheld', summary: 'no', approved: false },
  ]
  const { body } = await get('/clients/acme/information-sources?approved=true')
  const items = body.items as Array<Record<string, unknown>>
  assert.equal(items.length, 1)
  assert.equal(items[0]!.title, 'cleared')
  const srcFilter = filtersSeen.find((f) => f.collection === 'information_sources')!.filter
  assert.match(srcFilter, /approved=true/, 'the approved filter must reach PocketBase, not be applied after')
})

test('the unknown-client lookup is skipped entirely when the list is non-empty', async () => {
  reset()
  diskClients = ['acme']
  sources.acme = [{ id: 's1', title: 't', summary: 'x', approved: true }]
  await get('/clients/acme/information-sources')
  assert.equal(
    filtersSeen.filter((f) => f.collection === 'clients').length,
    0,
    'the normal path must not pay for the diagnostic',
  )
})

test('an agent token still cannot read another client’s sources', async () => {
  reset()
  diskClients = ['acme', 'other']
  const { res } = await get('/clients/other/information-sources', 'agent_test')
  assert.equal(res.status, 403, 'a wrong slug is a 403, which is why 200+empty meant the slug was right')
})

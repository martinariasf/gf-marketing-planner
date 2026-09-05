import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-142 — uploading a Markdown knowledge file failed with PocketBase's own
// validation sentence ("summary must be no more than 1,000,000 characters"),
// which reads as a lie: the document Pilar dropped looked like a few pages.
//
// It was not. The real file is 3,787,205 characters, of which 3,555,674 (94%)
// are ten images that the Google Docs -> Markdown export inlined as base64
// text. The 1,000,000 cap (ensureCollections.ts, raised there by GF-110) was
// enforced correctly; nothing told the person WHY a short-looking document is
// enormous, so the message was unactionable.
//
// What is asserted here is the pre-flight check: the route must reject an
// over-cap document itself, with a message that names both sizes and points at
// embedded images, and must not spend a round trip on a create PocketBase is
// certain to reject.

process.env.BOOTSTRAP_TOKENS = 'admin_test:admin:*'

/** Every collection PocketBase was asked to create a record in, in order. */
let createsSeen: string[] = []

mock.module('../audit.js', { namedExports: { audit: async () => {} } })

mock.module('../diskData.js', {
  namedExports: {
    disk: { clientIndex: async () => ({ clients: [{ slug: 'acme' }] }) },
  },
})

mock.module('../pb.js', {
  namedExports: {
    withPb: async (fn: (pb: unknown) => unknown) =>
      fn({
        collection: (name: string) => ({
          getFullList: async () => [],
          create: async (data: Record<string, unknown>) => {
            createsSeen.push(name)
            return { id: 'rec_new', ...data }
          },
        }),
      }),
    verifyUserToken: async () => null,
    pb: {},
    PbUnavailableError: class PbUnavailableError extends Error {
      constructor(cause?: unknown) {
        super('PocketBase is unavailable')
        this.name = 'PbUnavailableError'
        if (cause !== undefined) (this as { cause?: unknown }).cause = cause
      }
    },
  },
})

const { planningConfig } = await import('./planningConfig.js')

function reset() {
  createsSeen = []
}

/** Post `content` as an uploaded .md file to the information-sources endpoint. */
async function upload(content: string, name = 'notes.md') {
  const form = new FormData()
  form.append('file', new File([content], name, { type: 'text/markdown' }))
  const res = await planningConfig.request('/clients/acme/information-sources/upload', {
    method: 'POST',
    headers: { Authorization: 'Bearer admin_test' },
    body: form,
  })
  return { res, body: (await res.json()) as Record<string, unknown> }
}

/** A document just over the cap, shaped like the real one: a little prose and
 *  a base64 image reference definition that dwarfs it. Sized to an exact,
 *  distinctive character count so the reported size can be asserted against
 *  something that is not the limit. */
const OVER_CAP_CHARS = 1_234_567
function overCapDocument(): string {
  const prose = '# Buyer Persona\n\nAcme targets Mittelstand operations leads.\n\n'
  const prefix = '[image1]: data:image/png;base64,'
  const payload = 'A'.repeat(OVER_CAP_CHARS - prose.length - prefix.length)
  return `${prose}${prefix}${payload}`
}

test('an over-cap document is rejected by the route, not by PocketBase', async () => {
  reset()
  const doc = overCapDocument()
  assert.equal(doc.length, OVER_CAP_CHARS, 'fixture is the size the assertions assume')
  const { res } = await upload(doc)
  assert.equal(res.status, 413)
  assert.deepEqual(createsSeen, [], 'must not attempt a create PB is certain to reject')
})

test('the rejection names the actual size, the limit, and embedded images', async () => {
  reset()
  const { body } = await upload(overCapDocument())
  const detail = String(body.detail)
  // The ACTUAL size is the point: "too large" alone is what GF-142 already had.
  // It must be asserted against a number that is NOT the limit — an earlier
  // version of this test matched /1,000,00[01]/, which the limit itself
  // satisfies, so it passed without ever checking the reported size.
  assert.match(detail, /1,234,567/, 'states the actual size of the document')
  assert.match(detail, /1,000,000/, 'states the limit')
  assert.match(detail, /image/i, 'explains that embedded images count toward the size')
})

test('size is measured in code points, as PocketBase measures it', async () => {
  // PB's text validator counts runes; `String.length` counts UTF-16 units and
  // reports 2 per emoji. Measuring in UTF-16 units would refuse this document —
  // 600,000 code points, comfortably legal — at an apparent 1,200,000.
  reset()
  const { res } = await upload('\u{1F600}'.repeat(600_000))
  assert.equal(res.status, 201, 'an emoji document under the rune cap must be accepted')
  assert.deepEqual(createsSeen, ['information_sources'])
})

test('a document exactly at the cap is still accepted', async () => {
  reset()
  // Off-by-one here would reject a legitimate document, so pin the boundary.
  const { res } = await upload('x'.repeat(1_000_000))
  assert.equal(res.status, 201)
  assert.deepEqual(createsSeen, ['information_sources'])
})

test('an ordinary short Markdown file is unaffected', async () => {
  reset()
  const { res, body } = await upload('# Content Pillars\n\nThree pillars: proof, people, process.\n')
  assert.equal(res.status, 201)
  assert.equal(createsSeen.length, 1)
  assert.match(String(body.summary), /Three pillars/)
})

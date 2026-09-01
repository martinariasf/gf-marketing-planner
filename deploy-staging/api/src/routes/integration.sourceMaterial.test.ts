import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// GF-116 — the one-click connection payload on the Integration tab.
//
// This blob is what an external agent self-configures from, so whatever it does
// NOT mention is, in practice, something that agent will never do. It described
// information-sources only as a place to POST grounding, which is half of why
// uploaded documents went unread. These tests pin the read half in place.

process.env.BOOTSTRAP_TOKENS = 'dash_test:dash:acme,agent_acme_2026:agent:acme'

mock.module('../audit.js', { namedExports: { audit: async () => {} } })
mock.module('../secrets.js', {
  namedExports: {
    decryptSecret: (v: string) => v,
    encryptSecret: (v: string) => v,
    last4: (v: string) => v.slice(-4),
  },
})
mock.module('../pb.js', {
  namedExports: {
    withPb: async (fn: (pb: unknown) => unknown) =>
      fn({
        collection: () => ({
          getFirstListItem: async () => {
            throw new Error('not found')
          },
        }),
      }),
    verifyUserToken: async () => null,
    pb: {},
    // GF-126 — mirror the real pb.js module shape so this mock doesn't
    // silently diverge (auth.ts's requireAuth imports this from '../pb.js').
    PbUnavailableError: class PbUnavailableError extends Error {
      constructor(cause?: unknown) {
        super('PocketBase is unavailable')
        this.name = 'PbUnavailableError'
        if (cause !== undefined) (this as { cause?: unknown }).cause = cause
      }
    },
  },
})

const { integration } = await import('./integration.js')

async function payload() {
  const res = await integration.request('/clients/acme/integration', {
    headers: { Authorization: 'Bearer dash_test' },
  })
  assert.equal(res.status, 200)
  return (await res.json()) as {
    agentConnection: { endpoints: Record<string, string>; instructions: string }
  }
}

test('the connection payload exposes the source-material READ, not only the write', async () => {
  const { agentConnection } = await payload()
  assert.ok(
    agentConnection.endpoints.readSourceMaterial,
    'an agent that never sees a read endpoint will never read uploaded documents',
  )
  assert.match(agentConnection.endpoints.readSourceMaterial, /\/clients\/acme\/information-sources/)
  assert.match(
    agentConnection.endpoints.readSourceMaterial,
    /approved=true/,
    'the read must be pre-filtered to sources the client cleared for the agent',
  )
})

test('the write endpoints are still there', async () => {
  const { agentConnection } = await payload()
  assert.equal(
    agentConnection.endpoints.sourceMaterial,
    'http://localhost/api/v1/clients/acme/information-sources',
  )
  assert.match(agentConnection.endpoints.sourceMaterialUpload, /information-sources\/upload$/)
})

test('the instructions tell an ingesting agent to read sources before drafting', async () => {
  const { agentConnection } = await payload()
  assert.match(agentConnection.instructions, /information-sources\?approved=true/)
  assert.match(agentConnection.instructions, /BEFORE drafting/i)
  assert.match(
    agentConnection.instructions,
    /summary/,
    'an agent needs to be told which field carries the document text',
  )
})

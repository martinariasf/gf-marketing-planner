import { test } from 'node:test'
import assert from 'node:assert/strict'

// GF-104 rework — clients must never see or set their own OpenRouter key
// hash / guardrail id; Martin wires this map server-side via
// OPENROUTER_CLIENTS_JSON. env.ts reads process.env once at
// module-evaluation time, so set the var BEFORE the dynamic import (a static
// import would hoist and evaluate env.ts first). This lives in its own file
// so it gets a fresh process / module cache, independent of env.test.ts
// (which imports env.js with a different env) — same reasoning as
// env.drive.test.ts.

test('resolveOpenRouterClient: valid entries resolve; malformed entries dropped; unknown slug → undefined', async () => {
  process.env.OPENROUTER_CLIENTS_JSON = JSON.stringify({
    biomas: { keyHash: 'sha256-abc123', guardrailId: 'guardrail-uuid-1' },
    'gf-internal': { keyHash: 'sha256-def456', guardrailId: 'guardrail-uuid-2' },
    'missing-guardrail': { keyHash: 'sha256-only-hash' }, // dropped — no guardrailId
    'empty-key': { keyHash: '', guardrailId: 'guardrail-uuid-3' }, // dropped — empty string
    'not-an-object': 'sha256-loose-string', // dropped — not an object
  })
  const { resolveOpenRouterClient } = await import('./env.js')

  assert.deepEqual(resolveOpenRouterClient('biomas'), { keyHash: 'sha256-abc123', guardrailId: 'guardrail-uuid-1' })
  assert.deepEqual(resolveOpenRouterClient('gf-internal'), {
    keyHash: 'sha256-def456',
    guardrailId: 'guardrail-uuid-2',
  })
  assert.equal(resolveOpenRouterClient('missing-guardrail'), undefined)
  assert.equal(resolveOpenRouterClient('empty-key'), undefined)
  assert.equal(resolveOpenRouterClient('not-an-object'), undefined)
  assert.equal(resolveOpenRouterClient('never-configured'), undefined) // absent → undefined
})

// Layer-5 review (round 2) finding 3 — `slug` comes straight off a URL path
// param, so a caller can pass a name that collides with a property every
// plain object inherits from Object.prototype. A bracket lookup that doesn't
// guard with Object.hasOwn would return that inherited function instead of
// undefined, and the /usage route would treat it as "configured".
test('resolveOpenRouterClient: prototype-chain slugs never resolve to an inherited value', async () => {
  process.env.OPENROUTER_CLIENTS_JSON = JSON.stringify({
    biomas: { keyHash: 'sha256-abc123', guardrailId: 'guardrail-uuid-1' },
  })
  const { resolveOpenRouterClient } = await import('./env.js')

  assert.equal(resolveOpenRouterClient('constructor'), undefined)
  assert.equal(resolveOpenRouterClient('toString'), undefined)
})

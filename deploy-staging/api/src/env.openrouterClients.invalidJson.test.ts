import { test } from 'node:test'
import assert from 'node:assert/strict'

// GF-104 rework. env.ts reads process.env once at module-evaluation time, so
// set the var BEFORE the dynamic import (a static import would hoist and
// evaluate env.ts first). This lives in its own file so it gets a fresh
// process / module cache, independent of env.test.ts's valid-map coverage —
// same reasoning as env.drive.test.ts.

test('resolveOpenRouterClient: invalid JSON in OPENROUTER_CLIENTS_JSON logs a warning and yields an empty map, never throws', async () => {
  process.env.OPENROUTER_CLIENTS_JSON = '{not valid json'
  const { resolveOpenRouterClient } = await import('./env.js')

  assert.equal(resolveOpenRouterClient('biomas'), undefined)
  assert.equal(resolveOpenRouterClient('anything'), undefined)
})

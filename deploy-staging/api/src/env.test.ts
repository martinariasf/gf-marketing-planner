import { test } from 'node:test'
import assert from 'node:assert/strict'

// env.ts reads process.env once at module-evaluation time, so we set the vars
// BEFORE the dynamic import below (a static import would be hoisted and evaluate
// env.ts before these assignments land). node --test runs each test file in its
// own process, so mutating process.env here doesn't bleed into other suites.

test('resolveClientLang: per-client map wins; absent slug → DEFAULT_LANG', async () => {
  process.env.CLIENT_LANGS_JSON = JSON.stringify({
    'gf-internal': 'es',
    biomas: 'es-UY', // regional code normalizes to 'es'
    demo: 'klingon', // unrecognized value normalizes to 'en'
  })
  process.env.DEFAULT_LANG = 'de'
  const { resolveClientLang } = await import('./env.js')

  assert.equal(resolveClientLang('gf-internal'), 'es')
  assert.equal(resolveClientLang('biomas'), 'es')
  assert.equal(resolveClientLang('demo'), 'en') // present-but-garbage → en, not default
  assert.equal(resolveClientLang('fitvibe-demo'), 'de') // absent → DEFAULT_LANG
  assert.equal(resolveClientLang('another-absent'), 'de')
})

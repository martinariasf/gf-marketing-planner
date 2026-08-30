import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resolveBrand } from './reviewLib.js'

// GF-108 — the brand block an external reviewer sees.
//
// The bug: buildBrand() read the client's name from plan.json on disk and never
// consulted PocketBase, so a workspace seeded by copying another one showed the
// WRONG company's name on the strategy page an external reviewer was asked to
// sign off. Confirmed live on staging 2026-08-20: clients/staging-demo/plan.json
// carried 'GF Innovative Solutions' while PocketBase listed 'Staging Demo'.
//
// Second half of the bug: with no name anywhere, the fallback was the raw slug,
// which put an internal identifier ('gf-internal') in front of a client.

test('GF-108: the PocketBase name wins over a drifted plan.json name', () => {
  const brand = resolveBrand({
    slug: 'staging-demo',
    pbClient: { name: 'Staging Demo' },
    planClient: { name: 'GF Innovative Solutions', handle: '@gf-innovative', logoInitials: 'GF' },
  })
  assert.equal(brand.name, 'Staging Demo')
})

test('GF-108: plan.json supplies the name when PocketBase has none', () => {
  assert.equal(resolveBrand({ slug: 'acme', pbClient: null, planClient: { name: 'Acme AG' } }).name, 'Acme AG')
  assert.equal(
    resolveBrand({ slug: 'acme', pbClient: {}, planClient: { name: 'Acme AG' } }).name,
    'Acme AG',
    'a PB record that exists but carries no name must still fall through to disk',
  )
})

test('GF-108: an unresolvable name is empty and NEVER the internal slug', () => {
  for (const args of [
    { slug: 'gf-internal', pbClient: null, planClient: null },
    { slug: 'gf-internal', pbClient: {}, planClient: {} },
    { slug: 'gf-internal', pbClient: { name: '' }, planClient: { name: '   ' } },
    { slug: 'gf-internal', pbClient: { name: 42 }, planClient: { name: null } },
  ]) {
    const brand = resolveBrand(args)
    assert.equal(brand.name, '', `expected an empty name for ${JSON.stringify(args)}`)
    assert.doesNotMatch(brand.name, /gf-internal/)
  }
})

test('GF-108: a blank-but-present name falls through instead of winning', () => {
  // '  ' is truthy. Without the trim it would beat the real disk name and
  // render an empty H1 with no link-title fallback to catch it.
  const brand = resolveBrand({
    slug: 'acme',
    pbClient: { name: '   ' },
    planClient: { name: 'Acme AG' },
  })
  assert.equal(brand.name, 'Acme AG')
})

test('GF-108: the name is trimmed', () => {
  assert.equal(resolveBrand({ slug: 'acme', pbClient: { name: '  Acme AG  ' }, planClient: null }).name, 'Acme AG')
})

test('GF-108: handle still resolves from plan.json, then the slug', () => {
  // PocketBase has no handle field at all (ClientRecord in routes/clients.ts),
  // so disk stays the source and the slug fallback must survive — the channel
  // mockups render this.
  assert.equal(
    resolveBrand({ slug: 'acme', pbClient: { name: 'Acme AG' }, planClient: { handle: '@acme_ag' } }).handle,
    '@acme_ag',
  )
  assert.equal(resolveBrand({ slug: 'acme', pbClient: null, planClient: null }).handle, '@acme')
  assert.equal(
    resolveBrand({ slug: 'acme', pbClient: null, planClient: { handle: '  ' } }).handle,
    '@acme',
    'a blank handle must fall through to the slug, not render empty',
  )
})

test('GF-108: logoInitials resolve PB, then plan.json, then the slug prefix', () => {
  assert.equal(
    resolveBrand({ slug: 'acme', pbClient: { logoInitials: 'AA' }, planClient: { logoInitials: 'ZZ' } }).logoInitials,
    'AA',
  )
  assert.equal(
    resolveBrand({ slug: 'acme', pbClient: null, planClient: { logoInitials: 'ZZ' } }).logoInitials,
    'ZZ',
  )
  assert.equal(resolveBrand({ slug: 'acme', pbClient: null, planClient: null }).logoInitials, 'AC')
})

test('GF-108: every client always gets a non-empty handle and logoInitials', () => {
  // Criterion 3 — the mockups must keep working for every client, including one
  // that resolves no name at all.
  const brand = resolveBrand({ slug: 'x', pbClient: null, planClient: null })
  assert.ok(brand.handle.length > 0)
  assert.ok(brand.logoInitials.length > 0)
  assert.equal(brand.name, '')
})

test('GF-108: the payload shape is exactly the three brand fields', () => {
  const brand = resolveBrand({ slug: 'acme', pbClient: { name: 'Acme AG' }, planClient: null })
  assert.deepEqual(Object.keys(brand).sort(), ['handle', 'logoInitials', 'name'])
})

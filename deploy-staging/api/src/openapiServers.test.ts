import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildApiServers, originFromApiBase } from './openapiServers.js'

// GF-123 regression. Production and staging ship the SAME api image, so the
// spec's `servers` list has to come from PUBLIC_API_BASE. When it was hardcoded
// to staging, prod's openapi.json told every spec-driven integration to send
// prod agent tokens to staging, which answered 401 "Unknown or revoked token"
// because main-only clients don't exist in staging's PocketBase.

test('originFromApiBase strips the /api/v1 suffix and trailing slashes', () => {
  assert.equal(
    originFromApiBase('https://marketing.gfinnov.com/api/v1'),
    'https://marketing.gfinnov.com',
  )
  assert.equal(
    originFromApiBase('https://marketing.gfinnov.com/api/v1/'),
    'https://marketing.gfinnov.com',
  )
  // Already an origin — must be left alone, not mangled.
  assert.equal(originFromApiBase('https://marketing.gfinnov.com'), 'https://marketing.gfinnov.com')
})

test('prod spec advertises prod, never staging', () => {
  const servers = buildApiServers('https://marketing.gfinnov.com/api/v1')

  assert.equal(servers[0].url, 'https://marketing.gfinnov.com')
  assert.ok(
    !servers.some((s) => s.url.includes('staging')),
    'prod spec must not offer the staging origin — that is the GF-123 bug',
  )
})

test('staging spec advertises staging', () => {
  const servers = buildApiServers('https://staging.marketing.gfinnov.com/api/v1')

  assert.equal(servers[0].url, 'https://staging.marketing.gfinnov.com')
})

test('the deployment origin is always first so generated clients default to it', () => {
  for (const base of [
    'https://marketing.gfinnov.com/api/v1',
    'https://staging.marketing.gfinnov.com/api/v1',
  ]) {
    assert.equal(buildApiServers(base)[0].description, 'this deployment')
  }
})

test('localhost is offered for dev but never duplicated', () => {
  const remote = buildApiServers('https://marketing.gfinnov.com/api/v1')
  assert.deepEqual(
    remote.map((s) => s.url),
    ['https://marketing.gfinnov.com', 'http://localhost:8080'],
  )

  // env.ts falls back to the localhost base in dev; the list must not repeat it.
  const local = buildApiServers('http://localhost:8080/api/v1')
  assert.deepEqual(
    local.map((s) => s.url),
    ['http://localhost:8080'],
  )
})

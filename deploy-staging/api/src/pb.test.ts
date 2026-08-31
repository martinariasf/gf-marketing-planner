// GF-126 — verifyUserToken must distinguish "PB reached and genuinely
// rejected the token" (a real HTTP 4xx from authRefresh(), return null,
// unchanged) from "PB itself is the problem" (network failure, timeout, or
// any error without a real HTTP status — SDK default `status: 0` — or a 5xx
// from PB itself; throw PbUnavailableError instead).
//
// verifyUserToken constructs `new PocketBase(env.pbUrl)` directly rather than
// using pb.ts's own exported singleton, so the mock boundary here is the
// 'pocketbase' package itself (its default export), not '../pb.js'.

import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

let authRefreshImpl: () => Promise<{ record: Record<string, unknown> }> = async () => {
  throw new Error('authRefreshImpl not configured for this test')
}

class FakeAuthStore {
  token = ''
  model: unknown = null
  get isValid(): boolean {
    return this.token.length > 0
  }
  save(token: string, model: unknown): void {
    this.token = token
    this.model = model
  }
}

class FakePocketBase {
  authStore = new FakeAuthStore()
  autoCancellation(_enabled: boolean): void {}
  collection(_name: string) {
    return { authRefresh: () => authRefreshImpl() }
  }
}

mock.module('pocketbase', { defaultExport: FakePocketBase })

const { verifyUserToken, PbUnavailableError } = await import('./pb.js')

test('verifyUserToken returns null when PB genuinely rejects the token (real 4xx)', async () => {
  authRefreshImpl = async () => {
    throw Object.assign(new Error('Failed to authenticate.'), { status: 400 })
  }
  assert.equal(await verifyUserToken('a.b.c'), null)
})

test('verifyUserToken returns null on a real 401 from PB', async () => {
  authRefreshImpl = async () => {
    throw Object.assign(new Error('Token is invalid or expired.'), { status: 401 })
  }
  assert.equal(await verifyUserToken('a.b.c'), null)
})

test('verifyUserToken throws PbUnavailableError on a plain network-failure error (no status at all)', async () => {
  authRefreshImpl = async () => {
    throw new Error('fetch failed')
  }
  await assert.rejects(() => verifyUserToken('a.b.c'), PbUnavailableError)
})

test('verifyUserToken throws PbUnavailableError on status 0 (SDK default when PB is unreachable)', async () => {
  authRefreshImpl = async () => {
    throw Object.assign(new Error('fetch failed'), { status: 0 })
  }
  await assert.rejects(() => verifyUserToken('a.b.c'), PbUnavailableError)
})

test('verifyUserToken throws PbUnavailableError on a 5xx from PB itself', async () => {
  authRefreshImpl = async () => {
    throw Object.assign(new Error('Something went wrong.'), { status: 502 })
  }
  await assert.rejects(() => verifyUserToken('a.b.c'), PbUnavailableError)
})

test('verifyUserToken returns the verified user on success', async () => {
  authRefreshImpl = async () => ({
    record: { id: 'u1', email: 'person@example.com', name: 'Person', is_platform_admin: true },
  })
  const result = await verifyUserToken('a.b.c')
  assert.deepEqual(result, {
    id: 'u1',
    email: 'person@example.com',
    name: 'Person',
    isPlatformAdmin: true,
  })
})

test('verifyUserToken returns null for a locally-invalid token without calling PB', async () => {
  authRefreshImpl = async () => {
    throw new Error('should not be called — the local authStore.isValid check should short-circuit')
  }
  assert.equal(await verifyUserToken(''), null)
})

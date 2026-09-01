// PocketBase admin client.
//
// The API service is the only thing that talks to PB. We auth once as
// superuser on boot and refresh the token lazily when calls 401. The SPA and
// the Hermes agent never see PB credentials.

import PocketBase from 'pocketbase'
import { env } from './env.js'

const pb = new PocketBase(env.pbUrl)
// Disable auto-cancellation: short-lived requests from a server are fine and
// the default behavior cancels parallel calls to the same path.
pb.autoCancellation(false)

let authPromise: Promise<void> | null = null

async function authenticate(): Promise<void> {
  await pb
    .collection('_superusers')
    .authWithPassword(env.pbAdminEmail, env.pbAdminPassword)
}

async function ensureAuth(): Promise<void> {
  if (pb.authStore.isValid) return
  authPromise ??= authenticate().finally(() => {
    authPromise = null
  })
  await authPromise
}

// GF-58 — verify a dashboard user's PocketBase auth JWT WITHOUT the superuser
// client. We make a throwaway client, load the token, and ask PB to refresh it:
// a valid, unexpired token for the `users` collection returns the record;
// anything else throws and we treat it as unauthenticated. The new token from
// authRefresh is discarded — we only use this to validate + read the user.
export interface VerifiedUser {
  id: string
  email: string
  name: string
  isPlatformAdmin: boolean
}

// GF-126 — thrown by verifyUserToken when PocketBase itself couldn't be
// reached (network failure, timeout, or a 5xx from PB), as opposed to PB
// being reached and genuinely rejecting the token (a real 4xx). Callers must
// not treat this the same as an invalid token — see auth.ts's requireAuth.
export class PbUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('PocketBase is unavailable')
    this.name = 'PbUnavailableError'
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause
  }
}

export async function verifyUserToken(token: string): Promise<VerifiedUser | null> {
  const c = new PocketBase(env.pbUrl)
  c.autoCancellation(false)
  c.authStore.save(token, null)
  if (!c.authStore.isValid) return null // locally-checked exp/format
  try {
    const res = await c.collection('users').authRefresh()
    const rec = res.record as unknown as Record<string, unknown>
    return {
      id: String(rec.id),
      email: typeof rec.email === 'string' ? rec.email : '',
      name: typeof rec.name === 'string' ? rec.name : '',
      isPlatformAdmin: rec.is_platform_admin === true,
    }
  } catch (err: unknown) {
    // A real HTTP status in [400, 500) means PB was reached and said "no" —
    // genuinely invalid/expired token. Anything else (no status, status 0,
    // or a 5xx) means PB itself is the problem, not the token.
    if (err && typeof err === 'object' && 'status' in err) {
      const status = (err as { status: unknown }).status
      if (typeof status === 'number' && status >= 400 && status < 500) return null
    }
    throw new PbUnavailableError(err)
  }
}

// Wrap a PB call so that a 401 triggers a re-auth + single retry. Beyond that
// we surface the error.
export async function withPb<T>(fn: (pb: PocketBase) => Promise<T>): Promise<T> {
  await ensureAuth()
  try {
    return await fn(pb)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err && err.status === 401) {
      pb.authStore.clear()
      await ensureAuth()
      return await fn(pb)
    }
    throw err
  }
}

export { pb }

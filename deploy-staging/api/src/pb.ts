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

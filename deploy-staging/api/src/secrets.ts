// Secret-at-rest helpers for integration credentials (GF-11).
//
// Integration secrets like the Postiz API key are entered once in the dashboard
// and must NEVER be returned to the SPA in plaintext. They are stored encrypted
// in PocketBase and only decrypted server-side when the Viktor agent runtime
// fetches the key to hand to the `postiz` CLI ("Viktor can get it, never sees it").
//
// Encryption: AES-256-GCM with a key derived (sha256) from INTEGRATION_SECRET_KEY.
// If that env var is not configured we fall back to a clearly-marked, un-encrypted
// envelope so the feature still works on a bare staging box — but the deploy is
// expected to set INTEGRATION_SECRET_KEY for real encryption at rest.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from './env.js'

const ENC_PREFIX = 'v1' // AES-256-GCM envelope
const PLAIN_PREFIX = 'plain' // no key configured — stored as-is (NOT encrypted)

function key32(): Buffer | null {
  if (!env.integrationSecretKey) return null
  // Derive a stable 32-byte key from whatever string the operator provided.
  return createHash('sha256').update(env.integrationSecretKey, 'utf8').digest()
}

/** Encrypt a plaintext secret into a self-describing storage envelope. */
export function encryptSecret(plaintext: string): string {
  const key = key32()
  if (!key) {
    console.warn(
      '[secrets] INTEGRATION_SECRET_KEY not set — storing integration secret WITHOUT encryption at rest',
    )
    return `${PLAIN_PREFIX}:${Buffer.from(plaintext, 'utf8').toString('base64')}`
  }
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENC_PREFIX}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`
}

/** Decrypt a storage envelope produced by encryptSecret. Returns null on failure. */
export function decryptSecret(envelope: string): string | null {
  if (!envelope) return null
  const parts = envelope.split(':')
  try {
    if (parts[0] === PLAIN_PREFIX && parts[1]) {
      return Buffer.from(parts[1], 'base64').toString('utf8')
    }
    if (parts[0] === ENC_PREFIX && parts.length === 4) {
      const key = key32()
      if (!key) return null
      const [, ivB64, tagB64, ctB64] = parts
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64!, 'base64'))
      decipher.setAuthTag(Buffer.from(tagB64!, 'base64'))
      const pt = Buffer.concat([decipher.update(Buffer.from(ctB64!, 'base64')), decipher.final()])
      return pt.toString('utf8')
    }
  } catch (err) {
    console.error('[secrets] failed to decrypt integration secret', err)
    return null
  }
  return null
}

/** Last 4 chars of a secret, for a masked "configured" display. */
export function last4(secret: string): string {
  return secret.slice(-4)
}

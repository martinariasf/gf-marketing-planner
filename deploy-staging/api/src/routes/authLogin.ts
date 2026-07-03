// GF-58 — dashboard account login (replaces the basicauth → dash_ exchange).
//
// A person logs in with email + password; we authenticate against the
// PocketBase `users` collection and hand back PB's auth JWT. The SPA stores it
// and sends it as `Authorization: Bearer`. `requireAuth` (auth.ts) verifies the
// JWT on every subsequent request and resolves the user's agency scope.
//
// This is deliberately NOT the review-link `rev_*`/code flow — dashboards get
// real accounts + sessions; external review links stay a separate lightweight
// link+code mechanism.

import { OpenAPIHono } from '@hono/zod-openapi'
import PocketBase from 'pocketbase'
import { env } from '../env.js'
import { requireAuth, type AppEnv } from '../auth.js'
import { resolveUserScope } from '../tenancy.js'
import { problem } from '../problem.js'

export const authLogin = new OpenAPIHono<AppEnv>()

/** Decode a JWT's `exp` claim into an ISO string (best-effort). */
function tokenExpiry(token: string): string {
  try {
    const payload = token.split('.')[1]
    if (payload) {
      const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8')) as { exp?: number }
      if (json.exp) return new Date(json.exp * 1000).toISOString()
    }
  } catch {
    /* fall through to default */
  }
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}

authLogin.post('/auth/login', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null
  const email = typeof body?.email === 'string' ? body.email.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!email || !password) {
    return problem(c, { title: 'Bad Request', status: 400, detail: 'email and password are required' })
  }

  const pb = new PocketBase(env.pbUrl)
  pb.autoCancellation(false)
  try {
    const res = await pb.collection('users').authWithPassword(email, password)
    const rec = res.record as unknown as Record<string, unknown>
    const isAdmin = rec.is_platform_admin === true
    const agencies = isAdmin ? [] : await resolveUserScope(String(rec.id))
    return c.json({
      token: res.token,
      expiresAt: tokenExpiry(res.token),
      role: isAdmin ? 'admin' : 'dash',
      platformAdmin: isAdmin,
      agencies,
      user: {
        id: String(rec.id),
        email: typeof rec.email === 'string' ? rec.email : email,
        name: typeof rec.name === 'string' ? rec.name : '',
      },
    })
  } catch {
    // Same response for unknown email and wrong password — no user enumeration.
    return problem(c, { title: 'Unauthorized', status: 401, detail: 'Invalid email or password' })
  }
})

authLogin.get('/auth/me', requireAuth, async (c) => {
  const p = c.get('principal')
  return c.json({
    userId: p.userId ?? null,
    role: p.role,
    platformAdmin: p.platformAdmin === true,
    agencies: p.agencyScopes ?? [],
    label: p.label ?? null,
  })
})

// PocketBase auth tokens are stateless (no server-side session to revoke here),
// so logout is a client concern: the SPA drops the stored token. We return ok
// so the client has a single endpoint to call.
authLogin.post('/auth/logout', (c) => c.json({ ok: true }))

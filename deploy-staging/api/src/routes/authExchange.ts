// Phase 7 — basicauth → dash_* token exchange.
//
// The outer (production) Caddy gates staging.marketing.gfinnov.com behind
// HTTP basicauth and forwards the authenticated username to the api via
// `X-Forwarded-User`. This route mints a short-lived dash_<random> token for
// that user, returned to the SPA which stashes it in sessionStorage.
//
// Why in-memory and not PB-backed:
//   - These tokens are SHORT-LIVED (24h) and per-tab. SPA refresh = new
//     exchange. Server restart = everyone re-exchanges (cheap, no UX impact
//     because Caddy still has the user's basicauth).
//   - Avoids a PB write per page load.
//   - registerEphemeralToken below is called from a fresh process every deploy.
//
// What this gives us over the baked-in VITE_API_TOKEN approach:
//   - No long-lived secret in the JS bundle.
//   - Audit log shows the real basicauth username, not "bootstrap".
//   - Token rotates on every tab.

import { OpenAPIHono } from '@hono/zod-openapi'
import { randomBytes } from 'node:crypto'
import type { TokenPrincipal } from '../auth.js'
import { registerEphemeralToken } from '../auth.js'
import { problem } from '../problem.js'

const TTL_MS = 24 * 60 * 60 * 1000 // 24h

export const authExchange = new OpenAPIHono()

authExchange.get('/auth/exchange', async (c) => {
  // Caddy `basicauth` sets `{http.auth.user.id}` on success; we forward it as
  // X-Forwarded-User in the production Caddyfile.
  const user = c.req.header('X-Forwarded-User') ?? ''
  if (!user) {
    return problem(c, {
      title: 'Unauthorized',
      status: 401,
      detail:
        'No X-Forwarded-User header — exchange must be called through the edge Caddy with basicauth.',
    })
  }

  // All current basicauth users are dashboard operators. If we want to grant
  // admin only to specific names later, gate here on a small allowlist.
  const adminUsers = new Set(
    (process.env.AUTH_EXCHANGE_ADMINS ?? 'staging,martin,pilar')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
  const isAdmin = adminUsers.has(user.toLowerCase())
  const role = isAdmin ? 'admin' : 'dash'

  // Admins operate across all clients (slug:'*'). Per-client basicauth users are
  // scoped to their OWN client so one client login cannot read another client's
  // data — in production the basicauth username IS the client slug (e.g.
  // `gf-internal`, `fitvibe-demo`). requireScope + the picker filter enforce the
  // rest. Staging's only exchange user is the admin `staging`, so this stays
  // slug:'*' there (no behavior change on staging).
  const slug = isAdmin ? '*' : user

  const token = `dash_${randomBytes(24).toString('base64url')}`
  const expiresAt = Date.now() + TTL_MS
  const principal: TokenPrincipal = {
    token,
    role: role as 'admin' | 'dash',
    slug,
    label: `basicauth:${user}`,
  }
  registerEphemeralToken(principal, expiresAt)

  return c.json({
    token,
    expiresAt: new Date(expiresAt).toISOString(),
    role,
    user,
  })
})

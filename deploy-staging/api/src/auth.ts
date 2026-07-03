// Bearer-token auth.
//
// Two token kinds:
//   - agent_*  — issued per Viktor instance, scoped to one clientSlug.
//                Read-only for user-owned data (brief/plan/goals/learnings);
//                read+write for Viktor-owned data (posts/suggestions/performance).
//   - dash_*   — issued per dashboard user. The dashboard exchanges its
//                basicauth identity for a dash_* token on first load.
//                Read+write for user-owned data. On staging only, write for
//                approvals/suggestion-actions/post-quick-edits is permitted.
//
// Tokens are stored in PocketBase `api_tokens` collection. We also accept a
// comma-separated BOOTSTRAP_TOKENS env value so the first agent can call
// the API before the collection is seeded.

import type { Context, MiddlewareHandler } from 'hono'
import { env } from './env.js'
import { withPb, verifyUserToken } from './pb.js'
import { agencyForClient, resolveUserScope } from './tenancy.js'

export type Role = 'agent' | 'dash' | 'admin'

export interface TokenPrincipal {
  token: string
  role: Role
  /** Client slug the token is scoped to. `*` means all clients (admin). */
  slug: string
  /** Free-form label, e.g. "viktor-staging-demo" or "martin". */
  label?: string
  // ── GF-58 dashboard-account fields (set only for PocketBase user JWTs) ──
  /** PocketBase `users` record id, when the principal is a logged-in person. */
  userId?: string
  /** Agency slugs this user belongs to (empty for platform admins). */
  agencyScopes?: string[]
  /** GF staff — sees every agency/client (equivalent to slug `*`). */
  platformAdmin?: boolean
}

// A dashboard user authenticates with a PocketBase JWT (three dot-separated
// base64url segments). agent_*/dash_*/bootstrap tokens never contain dots, so
// this cleanly disambiguates a user JWT without a wasted PB query.
const JWT_RE = /^[\w-]+\.[\w-]+\.[\w-]+$/

type AppEnv = {
  Variables: {
    principal: TokenPrincipal
  }
}

const bootstrap: TokenPrincipal[] = env.bootstrapTokens
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((entry) => {
    const [token, role, slug] = entry.split(':')
    if (!token || !role || !slug) {
      throw new Error(
        `Invalid BOOTSTRAP_TOKENS entry "${entry}" — expected <token>:<role>:<slug>`,
      )
    }
    if (role !== 'agent' && role !== 'dash' && role !== 'admin') {
      throw new Error(`Invalid role "${role}" in BOOTSTRAP_TOKENS`)
    }
    return { token, role, slug, label: 'bootstrap' }
  })

// Phase 7 ephemeral tokens (issued by /auth/exchange). In-memory because they
// are short-lived (24h) and per-tab. Server restart invalidates them all —
// Caddy still has the user's basicauth, so the SPA simply re-exchanges.
const ephemeral = new Map<string, { principal: TokenPrincipal; expiresAt: number }>()

export function registerEphemeralToken(principal: TokenPrincipal, expiresAt: number): void {
  ephemeral.set(principal.token, { principal, expiresAt })
}

// Periodic GC to keep the ephemeral map bounded on long uptimes.
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of ephemeral) if (v.expiresAt <= now) ephemeral.delete(k)
}, 5 * 60_000).unref()

async function lookupToken(token: string): Promise<TokenPrincipal | null> {
  const fromEphemeral = ephemeral.get(token)
  if (fromEphemeral) {
    if (fromEphemeral.expiresAt <= Date.now()) {
      ephemeral.delete(token)
      return null
    }
    return fromEphemeral.principal
  }

  const fromBootstrap = bootstrap.find((p) => p.token === token)
  if (fromBootstrap) return fromBootstrap

  // GF-58 — a logged-in dashboard person presents a PocketBase user JWT.
  if (JWT_RE.test(token)) {
    const user = await verifyUserToken(token)
    if (user) {
      const agencyScopes = user.isPlatformAdmin ? [] : await resolveUserScope(user.id)
      return {
        token,
        role: user.isPlatformAdmin ? 'admin' : 'dash',
        slug: user.isPlatformAdmin ? '*' : '',
        label: `user:${user.email}`,
        userId: user.id,
        platformAdmin: user.isPlatformAdmin,
        agencyScopes,
      }
    }
    // Not a valid user token — fall through (nothing else matches a JWT shape).
  }

  try {
    const record = await withPb((pb) =>
      pb
        .collection('api_tokens')
        .getFirstListItem<{ token: string; role: Role; slug: string; label?: string; revoked?: boolean }>(
          `token="${token}"`,
        ),
    )
    if (record.revoked) return null
    return { token: record.token, role: record.role, slug: record.slug, label: record.label }
  } catch {
    return null
  }
}

const unauthorized = (c: Context, detail: string) =>
  c.json(
    {
      type: 'about:blank',
      title: 'Unauthorized',
      status: 401,
      detail,
    },
    401,
  )

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const header = c.req.header('Authorization') ?? ''
  const match = header.match(/^Bearer\s+(.+)$/)
  if (!match) return unauthorized(c, 'Missing or malformed Authorization header')
  const principal = await lookupToken(match[1]!.trim())
  if (!principal) return unauthorized(c, 'Unknown or revoked token')
  c.set('principal', principal)
  await next()
}

/**
 * Confirms the principal is allowed to act on the requested client slug.
 * Throws a 403 problem+json otherwise. Admin tokens (slug=*) pass everything.
 */
export const requireScope = (paramName = 'slug'): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const principal = c.get('principal')
    const requested = c.req.param(paramName)
    if (!requested) {
      return c.json(
        { type: 'about:blank', title: 'Bad Request', status: 400, detail: `Missing :${paramName} param` },
        400,
      )
    }

    const forbidden = (detail: string) =>
      c.json({ type: 'about:blank', title: 'Forbidden', status: 403, detail }, 403)

    // Platform admins (and legacy slug:'*' tokens) pass everything.
    if (principal.slug === '*' || principal.platformAdmin) {
      await next()
      return
    }

    // GF-58 — an agency-scoped dashboard user may reach a client only if that
    // client's agency is one of theirs (tenant isolation).
    if (principal.agencyScopes && principal.agencyScopes.length > 0) {
      const agency = await agencyForClient(requested)
      if (agency && principal.agencyScopes.includes(agency)) {
        await next()
        return
      }
      return forbidden(`User not a member of the agency owning "${requested}"`)
    }

    // Legacy single-client tokens (agent_*, bootstrap, ephemeral dash_*).
    if (principal.slug !== requested) {
      return forbidden(`Token scoped to "${principal.slug}", refused access to "${requested}"`)
    }
    await next()
  }
}

/**
 * Allow only specific roles to call this route. e.g. `requireRole('agent','admin')`
 * for performance writes; `requireRole('dash','admin')` for brief edits.
 */
export const requireRole = (...allowed: Role[]): MiddlewareHandler<AppEnv> => {
  return async (c, next) => {
    const principal = c.get('principal')
    if (!allowed.includes(principal.role)) {
      return c.json(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: 403,
          detail: `Role "${principal.role}" cannot access this endpoint`,
        },
        403,
      )
    }
    await next()
  }
}

export type { AppEnv }

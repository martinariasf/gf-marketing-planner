// Integration tab backend.
//
// GET /api/v1/clients/:slug/integration — returns the metadata other tools
// (Telegram bots, Make.com scenarios, n8n, custom scripts) need to talk to
// this staging API for a specific client:
//
//   { apiBase, docsUrl, openapiUrl, slug, agentToken, examples }
//
// The agentToken is read from the bootstrap-token env list. In a production
// cutover this would be replaced by a real issuance flow (create a row in
// api_tokens, return token, audit). For staging the convention is:
//
//     agent_<slug>_2026   (must exist in BOOTSTRAP_TOKENS env)
//
// Auth: dash or admin scope on this slug. Agents cannot list their own token
// through this route.

import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { env } from '../env.js'
import { withPb } from '../pb.js'
import { audit } from '../audit.js'
import { problem } from '../problem.js'
import { decryptSecret, encryptSecret, last4 } from '../secrets.js'

export const integration = new OpenAPIHono<AppEnv>()
integration.use('*', requireAuth)

type IntegrationSecretRec = {
  id: string
  slug: string
  postizApiKeyEnc?: string
  postizLast4?: string
  updatedAt?: string
}

/** Masked, SPA-safe status for the Postiz key — never includes the secret. */
export type PostizStatus = {
  configured: boolean
  last4: string | null
  updatedAt: string | null
}

async function loadSecretRecord(slug: string): Promise<IntegrationSecretRec | null> {
  try {
    return await withPb((pb) =>
      pb.collection('integration_secrets').getFirstListItem<IntegrationSecretRec>(`slug="${slug}"`),
    )
  } catch {
    return null
  }
}

async function loadPostizStatus(slug: string): Promise<PostizStatus> {
  const rec = await loadSecretRecord(slug)
  if (!rec || !rec.postizApiKeyEnc) return { configured: false, last4: null, updatedAt: null }
  return { configured: true, last4: rec.postizLast4 ?? null, updatedAt: rec.updatedAt ?? null }
}

function principalLabel(c: Context<AppEnv>): string {
  const principal = c.get('principal')
  return principal.label ?? principal.token.slice(0, 12)
}

integration.get(
  '/clients/:slug/integration',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const url = new URL(c.req.url)
    // Honor the edge proxy's protocol — Caddy → api is plain http internally
    // but the public origin is https. X-Forwarded-Proto is set by Caddy.
    const proto = c.req.header('X-Forwarded-Proto') ?? url.protocol.replace(':', '')
    const host = c.req.header('X-Forwarded-Host') ?? url.host
    const origin = `${proto}://${host}`
    const apiBase = `${origin}/api/v1`

    // Look up the agent token from the bootstrap list. We surface it to the
    // dashboard so Martin can paste it into other bots / Make / n8n. On a
    // hardened deploy this would be replaced by a real issuance flow.
    const triples = env.bootstrapTokens
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    let agentToken: string | null = null
    for (const entry of triples) {
      const [token, role, tokSlug] = entry.split(':')
      if (role === 'agent' && tokSlug === slug && token) {
        agentToken = token
        break
      }
    }

    const postiz = await loadPostizStatus(slug)

    return c.json({
      slug,
      apiBase,
      docsUrl: `${apiBase}/docs`,
      openapiUrl: `${apiBase}/openapi.json`,
      agentToken,
      tokenHint: agentToken
        ? null
        : `No agent token issued for "${slug}". Add agent_${slug}_2026:agent:${slug} to BOOTSTRAP_TOKENS on the api.`,
      examples: {
        curlReadBrief: `curl -H "Authorization: Bearer ${agentToken ?? '<token>'}" ${apiBase}/clients/${slug}/brief`,
        curlPatchPost: `curl -X PATCH -H "Authorization: Bearer ${agentToken ?? '<token>'}" -H "Content-Type: application/json" -d '{"title":"new title"}' ${apiBase}/clients/${slug}/posts/p001`,
        curlSetApproval: `curl -X POST -H "Authorization: Bearer ${agentToken ?? '<token>'}" -H "Content-Type: application/json" -d '{"postId":"p001","decision":"approved"}' ${apiBase}/clients/${slug}/approvals`,
      },
      assetsDir: `clients/${slug}/assets/`,
      assetsManifestPath: `clients/${slug}/assets/manifest.json`,
      // GF-11: masked-only — the raw key is never serialised here.
      postiz,
    })
  },
)

// ── Postiz API key (GF-11) ──────────────────────────────────────────────────
//
// "Viktor should be able to get this key but never actually see it":
//   • PUT/DELETE below are dash/admin only and accept/clear the plaintext key.
//   • The masked status (configured + last4) rides on GET /integration above —
//     the SPA never receives the raw key, even right after saving.
//   • GET /integration/postiz/key is the ONLY route that returns plaintext, and
//     it is agent/admin only. The Viktor runtime calls it server-side to feed
//     the `postiz` CLI; the model never sees the response.

// Save / rotate the Postiz API key. dash/admin only.
integration.put(
  '/clients/:slug/integration/postiz',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    let body: { apiKey?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
    if (!apiKey) {
      return problem(c, {
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'apiKey is required and must be a non-empty string.',
      })
    }

    const updatedAt = new Date().toISOString()
    const actor = principalLabel(c)
    const fields = {
      slug,
      postizApiKeyEnc: encryptSecret(apiKey),
      postizLast4: last4(apiKey),
      updatedAt,
      actor,
    }
    const existing = await loadSecretRecord(slug)
    await withPb(async (pb) => {
      const coll = pb.collection('integration_secrets')
      if (existing) await coll.update(existing.id, fields)
      else await coll.create(fields)
    })
    // Audit the change WITHOUT the secret — only the masked tail is recorded.
    await audit(c.get('principal'), {
      action: 'integration.postiz.update',
      slug,
      before: { configured: Boolean(existing?.postizApiKeyEnc), last4: existing?.postizLast4 ?? null },
      after: { configured: true, last4: fields.postizLast4 },
    })
    return c.json({ configured: true, last4: fields.postizLast4, updatedAt } satisfies PostizStatus)
  },
)

// Remove the Postiz API key. dash/admin only.
integration.delete(
  '/clients/:slug/integration/postiz',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const existing = await loadSecretRecord(slug)
    if (existing) {
      await withPb((pb) => pb.collection('integration_secrets').delete(existing.id))
      await audit(c.get('principal'), {
        action: 'integration.postiz.delete',
        slug,
        before: { configured: true, last4: existing.postizLast4 ?? null },
        after: { configured: false, last4: null },
      })
    }
    return c.json({ configured: false, last4: null, updatedAt: null } satisfies PostizStatus)
  },
)

// Plaintext fetch — agent/admin ONLY. This is the "Viktor gets it" path; the
// dashboard never calls this. The agent runtime injects the returned key into
// the `postiz` CLI subprocess env and must never echo it to chat/tool output.
integration.get(
  '/clients/:slug/integration/postiz/key',
  requireScope(),
  requireRole('agent', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const rec = await loadSecretRecord(slug)
    if (!rec || !rec.postizApiKeyEnc) {
      return problem(c, { title: 'Not Found', status: 404, detail: 'No Postiz API key configured for this client.' })
    }
    const apiKey = decryptSecret(rec.postizApiKeyEnc)
    if (!apiKey) {
      return problem(c, {
        title: 'Internal Server Error',
        status: 500,
        detail: 'Stored Postiz key could not be decrypted (INTEGRATION_SECRET_KEY changed?).',
      })
    }
    // Audit the retrieval (who/when) but never the value.
    await audit(c.get('principal'), {
      action: 'integration.postiz.retrieve',
      slug,
      after: { last4: rec.postizLast4 ?? null },
    })
    return c.json({ apiKey })
  },
)

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
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { env } from '../env.js'

export const integration = new OpenAPIHono<AppEnv>()
integration.use('*', requireAuth)

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
    })
  },
)

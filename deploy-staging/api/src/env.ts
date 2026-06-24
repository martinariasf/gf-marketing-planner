// Runtime configuration. Read once at boot; fail fast on missing required vars
// so a misconfigured container never silently serves bad responses.

const required = (name: string): string => {
  const v = process.env[name]
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

export interface HermesAgent {
  baseUrl: string
  apiKey: string
}

// Parse the optional HERMES_AGENTS_JSON per-client override map. Malformed JSON
// or entries without a baseUrl are dropped with a warning rather than crashing
// boot — the affected slug just falls back to the global agent.
function parseHermesAgents(raw: string | undefined): Record<string, HermesAgent> {
  if (!raw || raw.trim() === '') return {}
  try {
    const obj = JSON.parse(raw) as Record<string, { baseUrl?: string; apiKey?: string }>
    const out: Record<string, HermesAgent> = {}
    for (const [slug, v] of Object.entries(obj)) {
      if (v && typeof v.baseUrl === 'string' && v.baseUrl.length > 0) {
        out[slug] = { baseUrl: v.baseUrl, apiKey: typeof v.apiKey === 'string' ? v.apiKey : '' }
      } else {
        console.warn(`[env] HERMES_AGENTS_JSON entry "${slug}" missing baseUrl — ignored`)
      }
    }
    return out
  } catch (err) {
    console.warn('[env] HERMES_AGENTS_JSON is not valid JSON — ignored', err)
    return {}
  }
}

export const env = {
  // Bind address
  port: Number(process.env.PORT ?? 8080),

  // PocketBase. Admin creds are optional in Phase 1 (only /health + /docs
  // ship) so the container can boot without secrets. Phase 2 will tighten
  // this — any route that calls withPb() will surface a clear 500 if creds
  // are missing, instead of crashing the process at boot.
  pbUrl: process.env.PB_URL ?? 'http://pocketbase:8090',
  pbAdminEmail: process.env.PB_ADMIN_EMAIL ?? '',
  pbAdminPassword: process.env.PB_ADMIN_PASSWORD ?? '',

  // Tokens
  // Comma-separated `<token>:<role>:<slug>` triples for bootstrap. Once the
  // api_tokens collection is seeded, this is unused. Format:
  //   agent_xxx:agent:staging-demo,dash_yyy:admin:*
  bootstrapTokens: process.env.BOOTSTRAP_TOKENS ?? '',

  // Chat — proxied to hermes-marketing-staging's built-in OpenAI-compatible
  // api_server platform. Same agent, same tools, same prompt as Telegram.
  // The previous in-process OpenRouter loop is retired.
  hermesBaseUrl: process.env.HERMES_BASE_URL ?? 'http://hermes-marketing-staging:8642',
  hermesApiKey: process.env.HERMES_API_KEY ?? '',

  // Per-client agent overrides for the chat proxy. Optional JSON map of
  //   { "<slug>": { "baseUrl": "http://viktor-<slug>:8642", "apiKey": "..." } }
  // Slugs absent from the map fall back to the shared HERMES_BASE_URL/HERMES_API_KEY
  // agent above. This lets one dashboard route each client's "Ask Viktor" to that
  // client's own Hermes agent (e.g. biomas -> viktor-biomas) instead of every
  // client hitting one shared agent hard-wired to a single CLIENT_SLUG.
  hermesAgents: parseHermesAgents(process.env.HERMES_AGENTS_JSON),

  // Integration secrets (GF-11). Used to AES-256-GCM encrypt credentials like
  // the Postiz API key before they hit PocketBase. If unset the value is stored
  // un-encrypted (with a loud warning) — set this on every real deploy.
  integrationSecretKey: process.env.INTEGRATION_SECRET_KEY ?? '',

  // Misc
  logLevel: process.env.LOG_LEVEL ?? 'info',
  release: process.env.RELEASE ?? 'dev',
} as const

export type Env = typeof env

// Resolve the Hermes agent that should serve a given client slug's chat. A
// per-client override (HERMES_AGENTS_JSON) wins; otherwise the shared default
// agent (HERMES_BASE_URL/HERMES_API_KEY) is used. An override that omits its
// own apiKey inherits the global key.
export function resolveHermesAgent(slug: string): HermesAgent {
  const override = env.hermesAgents[slug]
  if (override) {
    return { baseUrl: override.baseUrl, apiKey: override.apiKey || env.hermesApiKey }
  }
  return { baseUrl: env.hermesBaseUrl, apiKey: env.hermesApiKey }
}

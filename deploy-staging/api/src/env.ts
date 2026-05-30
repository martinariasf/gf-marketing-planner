// Runtime configuration. Read once at boot; fail fast on missing required vars
// so a misconfigured container never silently serves bad responses.

const required = (name: string): string => {
  const v = process.env[name]
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
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

  // Hermes chat (Phase 6 wires this up)
  hermesChatBase: process.env.HERMES_CHAT_BASE ?? 'http://hermes-marketing-staging:7000',

  // Misc
  logLevel: process.env.LOG_LEVEL ?? 'info',
  release: process.env.RELEASE ?? 'dev',
} as const

export type Env = typeof env

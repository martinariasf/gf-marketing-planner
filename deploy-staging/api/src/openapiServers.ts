// GF-123: derive the OpenAPI `servers` list from this deployment's own public
// base URL.
//
// Why this exists: prod and staging run the IDENTICAL api image (CI rsyncs
// deploy-staging/api/ into the prod build context), so any environment-specific
// literal in the spec is wrong for one of them. The list used to be hardcoded to
// staging, which meant production's own /api/v1/openapi.json advertised
// `https://staging.marketing.gfinnov.com`. Every integration that resolves the
// spec's servers rather than the operator's hand-written base URL — Scalar's
// "Test request" button, a custom GPT action, an n8n OpenAPI node — therefore
// aimed production agent tokens at staging and got
// 401 "Unknown or revoked token", because main-only clients (black-venture-farm,
// biomas) don't exist in staging's PocketBase at all.
//
// PUBLIC_API_BASE carries the "/api/v1" suffix, but documented paths are
// absolute from the origin ("/api/v1/clients/{slug}/..."), so it must be
// stripped or every generated URL doubles the prefix.

export type OpenApiServer = { url: string; description: string }

const LOCAL_ORIGIN = 'http://localhost:8080'

/** Strip a trailing "/api/v1" (and any trailing slashes) to get the bare origin. */
export function originFromApiBase(publicApiBase: string): string {
  return publicApiBase.replace(/\/+$/, '').replace(/\/api\/v1$/, '')
}

/**
 * Build the spec's `servers` list. The deployment's own origin always comes
 * first so generated clients pick it by default; localhost is appended as a
 * convenience for local dev, but never duplicated when this IS localhost.
 */
export function buildApiServers(publicApiBase: string): OpenApiServer[] {
  const origin = originFromApiBase(publicApiBase)
  const servers: OpenApiServer[] = [{ url: origin, description: 'this deployment' }]
  if (origin !== LOCAL_ORIGIN) {
    servers.push({ url: LOCAL_ORIGIN, description: 'local' })
  }
  return servers
}

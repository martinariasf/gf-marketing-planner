# deploy-prod — production inner stack (full-parity cutover)

Inert scaffolding for promoting the marketing-planner to **full parity** with
staging: production gains the Hono REST API + PocketBase and the SPA builds in
API mode. Mirrors `deploy-staging/`. Nothing here is active until the cutover
is performed via the `promote-staging-to-prod` skill.

## Files
| File | Role |
|---|---|
| `docker-compose.yml` | `mp-prod-api` + `mp-prod-caddy` (inner stack); rename/`-f` as `docker-compose.prod-inner.yml` on the box to avoid colliding with the outer-caddy compose |
| `Caddyfile.prod` | inner fan-out (`/api/v1`→api, `/_/`→pb, `/`→SPA) |
| `pb-run.prod.sh` | bare `docker run` for `mp-prod-pb` (own `pb-data`, host port 8091) |
| `.env.example` | template for the box-only `/opt/marketing-planner/.env` |

The API image reuses `deploy-staging/api` (same Hono code) — CI rsyncs it to
`/opt/marketing-planner/api/` so the `./api` build context resolves on the box.
PB migrations reuse `deploy-staging/pb-migrations/`.

## Still required before/at cutover (see promote-staging-to-prod skill)
1. **Outer Caddyfile edit** (`/opt/marketing-planner/Caddyfile`, `marketing.gfinnov.com` block) to route `/api/v1`, `/api/v1/*`, `/chat/*`, `/api/v1/auth/exchange` → `mp-prod-caddy:80`. ⚠️ highest-risk; back up first; `caddy validate` before reload. Blocked on the **prod auth-model decision** (per-client exchange creds vs single prod cred).
2. **deploy.yml** changes: build SPA with `VITE_API_BASE=https://marketing.gfinnov.com/api/v1`; rsync `deploy-staging/api`→`/opt/marketing-planner/api`, `deploy-prod/*`→`/opt/marketing-planner/`, `deploy-staging/pb-migrations`→prod; `docker compose -f docker-compose.prod-inner.yml up -d --build`. Deferred until cutover (it arms the prod deploy).
3. **Secrets** in the box `.env` (PB admin, BOOTSTRAP_TOKENS, prod Hermes key).
4. **Data migration**: seed `mp-prod-pb` from `/opt/marketing-planner/clients/*.json`.

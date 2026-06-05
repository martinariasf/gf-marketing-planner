# Prod agent — Viktor-v2 / GF Innov (INERT PREP)

Prepared upgrade for the production GF agent. **Do not deploy until the website
cutover makes `/api/v1` live on `marketing.gfinnov.com`** — this persona is
API-centric and will 404 against a file-mode prod.

## Target
The existing live agent `viktor-v2-gf-innov` at `/opt/agents/gf-innov/` (image
`viktor-v2:latest`, client slug `gf-internal`). Today it is **file-mode** (reads
`clients/gf-internal` JSON on disk, no `api_server`). The upgrade swaps it to the
API-integrated persona.

## What's here
- `config.yaml` — the staging persona transformed for prod (`staging.marketing` →
  `marketing`, `staging-demo` → `gf-internal`, `mp-staging-api` → `mp-prod-api`),
  with the staging-only "install anything / passwordless sudo" permission removed
  for production. Gateway key is a placeholder.
- Skills + plugins: **reuse** `deploy-staging/staging-demo-agent/{skills,plugins}`
  (`copywriting`, `image-generation`, `marketing-planner-staging`,
  `image_gen_openrouter`) — copy them in at deploy; don't fork.

## Deploy checklist (after website cutover)
1. **Back up** the live config: `cp /opt/agents/gf-innov/config.yaml{,.bak.$(date +%s)}`.
2. Copy this `config.yaml` + the staging skills/plugins into `/opt/agents/gf-innov/`.
3. Inject the real **prod Hermes gateway key** (1Password) into `config.yaml`
   `platforms.api_server.extra.key` (replace `REPLACE_WITH_HERMES_GATEWAY_KEY`).
   It MUST equal `mp-prod-api`'s `HERMES_API_KEY`.
4. Add to `/opt/agents/gf-innov/.env` (chmod 600, not committed):
   - `API_BASE=https://marketing.gfinnov.com/api/v1`
   - `API_TOKEN=<prod agent token, scope gf-internal — from 1Password>`
   - `CLIENT_SLUG=gf-internal` (already set)
   - Telegram bot token (8998…), Postiz key — already provided.
5. **VERIFY before `up`:**
   - In-container assets path in the persona (`/opt/marketing-planner/client/assets/`)
     matches this container's actual volume mount — the file-mode agent mounts
     `clients/gf-internal:/opt/data/client-platform`; reconcile the persona path or
     the mount, or assets will land in the wrong place.
   - `viktor-v2-gf-innov` is attached to the `marketing-planner_default` network so
     `mp-prod-api` can reach it at `http://viktor-v2-gf-innov:8642` (set that as
     `mp-prod-api` `HERMES_BASE_URL`). Add the `api_server` port 8642.
   - Model: decide `HERMES_MODEL` (live today: `openai/gpt-5.4-mini`; staging used
     `google/gemini-3.1-pro-preview`).
   - Remaining prose "staging" mentions in `config.yaml` comments are cosmetic.
6. `cd /opt/agents/gf-innov && docker compose up -d --build`.
7. **Smoke test API connectivity first:** use `/api/v1/health` for unauthenticated
   health, and `GET $API_BASE/clients/$CLIENT_SLUG/brief` with the bearer token
   for the agent's scoped read. Do not treat a bare `$API_BASE` probe as the only
   connectivity check.
8. **Smoke test agent behavior:** `hi viktor` → `suggest` → `draft …` → `approve p###`
   (Telegram and in-app chat). Roll back to the `.bak` config if anything fails.

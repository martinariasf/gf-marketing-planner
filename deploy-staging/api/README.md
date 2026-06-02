# mp-staging-api

Staging-only REST API for the Marketing Planner. Single contract used by the
dashboard and by the staging Viktor agent. PocketBase is the storage layer;
this service is the only thing that talks to it.

- **Base URL (staging):** `https://staging.marketing.gfinnov.com/api/v1`
- **Local dev:** `http://localhost:8080/v1`
- **Interactive docs:** `/v1/docs` (Scalar)
- **OpenAPI spec:** `/v1/openapi.json`

## Auth

Every request needs `Authorization: Bearer <token>`. Two token kinds:

| Prefix    | Role  | Scope                    | Can write user-owned data? | Can write Viktor-owned data? |
| --------- | ----- | ------------------------ | -------------------------- | ---------------------------- |
| `agent_*` | agent | one client slug          | no                         | yes                          |
| `dash_*`  | dash  | one client slug          | yes                        | yes (staging only)           |
| (any)     | admin | `*` (all slugs)          | yes                        | yes                          |

Tokens live in PocketBase `api_tokens`. For local bootstrap before the
collection is seeded, set `BOOTSTRAP_TOKENS=<token>:<role>:<slug>,...`.

## Write contract (validated, returns 422 on bad input)

All write endpoints validate the body with `zod` (`src/schemas/post.ts`). A wrong
field name or value returns **HTTP 422** `application/problem+json` whose `detail`
names the exact failing field (and an `errors[]` array), so a client/agent can fix
that one field and retry. Unknown top-level keys are rejected (`.strict()`) — this
is deliberate: a typo'd field name surfaces as an error instead of silently doing
nothing. Reads (`buildPost` → `coalescePost`) also repair partial/legacy rows to a
complete shape so the dashboard never throws on a missing field (the June 2026
white-screen). The SPA mirrors this with `normalizePost()`.

**`POST /clients/:slug/posts` (create)** — `date` (ISO; `2026-06-15` or full
datetime) and `title` (non-empty) required; others optional:

| field | rule |
|-------|------|
| `channel` | `instagram` \| `linkedin` \| `tiktok` \| `x` \| `facebook` |
| `status` | `idea` \| `drafting` \| `in_review` \| `needs_revision` \| `approved` \| `scheduled` \| `published` \| `rejected` |
| `hashtags` | `string[]` (not a single string) |
| `image` | string URL — field is `image`, not `imageUrl`/`assetIds` |
| `copy`, `cta`, `pillar`, `format`, `campaign` | strings, optional |

**`PATCH /clients/:slug/posts/:id`** — any subset of the same fields; each present
field must be the right type.

**`POST /clients/:slug/approvals`** — `{ postId, decision }`, `decision` ∈
`in_review|approved|scheduled|rejected`, optional `note`.

**`PATCH /clients/:slug/suggestions/:id`** — `{ status?, priority?, reason? }`,
`status` ∈ `open|accepted|dismissed`.

The agent-side mirror of this contract is `deploy/viktor-skills/publishing.md`.

## Local development

```bash
cd deploy-staging/api
npm install
PB_URL=http://localhost:8090 \
PB_ADMIN_EMAIL=admin@gfinnov.com \
PB_ADMIN_PASSWORD=... \
BOOTSTRAP_TOKENS=dash_local_dev:admin:* \
npm run dev
```

Then:

```bash
curl http://localhost:8080/v1/health
curl -H "Authorization: Bearer dash_local_dev" http://localhost:8080/v1/clients
open http://localhost:8080/v1/docs
```

## Build + ship

```bash
npm run typecheck
npm run build       # tsc -> dist/
docker build -t mp-staging-api:latest .
```

CI builds the image on push to `experimental` (see `.github/workflows/deploy-staging.yml`).

## Roadmap

Phase 1 (this commit): health, clients list, OpenAPI scaffold, Docker, Caddy proxy.
Phase 2: full CRUD for brief/plan/goals/learnings + posts/suggestions/approvals read endpoints + audit.
Phase 3: dashboard reads cut over to this API.
Phase 4: write endpoints for kanban approvals, suggestion actions, post quick-edits.
Phase 5: agent token issued to `hermes-marketing-staging`.
Phase 6: `/v1/clients/:slug/chat/*` proxies the Hermes HTTP gateway plugin.

## Hard rules

- This API never reads or writes `clients/gf-internal` or `clients/fitvibe-demo`.
  Production data lives on a different host path and is not mounted into the
  staging stack.
- The API is the only writer of `audit`, `api_tokens`, and `chat_messages`.
- Tokens are never logged. PocketBase admin credentials never leave the
  container.

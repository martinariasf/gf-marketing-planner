# mp-staging-api

Staging-only REST API for the Marketing Planner. Single contract used by the
dashboard and by the staging Viktor agent. PocketBase is the storage layer;
this service is the only thing that talks to it.

- **Base URL (staging):** `https://staging.marketing.gfinnov.com/api/v1`
- **Local dev:** `http://localhost:8080/v1`
- **Interactive docs:** `/v1/docs` (Scalar)
- **OpenAPI spec:** `/v1/openapi.json`

## Auth

Every request needs `Authorization: Bearer <token>`. Three roles:

| Prefix    | Role  | Scope                    | Can write user-owned data? | Can write Viktor-owned data? |
| --------- | ----- | ------------------------ | -------------------------- | ---------------------------- |
| `agent_*` | agent | one client slug          | **branding only** (see note) | yes                          |
| `dash_*`  | dash  | one client slug          | yes                        | yes (staging only)           |
| (any)     | admin | `*` (all slugs)          | yes                        | yes                          |

> **User-owned vs Viktor-owned.** "User-owned" data is the strategy set a human
> defines: the full `brief` (company/business/audience/voice/boundaries), `plan`,
> `goals`, `learnings`. The `agent` role is **read-only** on these — Viktor reads
> them to stay on-brand but cannot rewrite a client's strategy.
> **One exception:** `PATCH /clients/:slug/branding` (colors / typography / logo /
> tone) **is** writable by `agent`, because keeping posts visually on-brand is
> part of Viktor's job and the change is narrow + low-risk.
> "Viktor-owned" data (`posts`, `suggestions`, `approvals`, `performance`) is
> read+write for `agent`.
>
> If Viktor gets `403 Role "agent" cannot access this endpoint`, it tried to write
> a user-owned resource other than branding — that's expected; route the user to
> the dashboard for those edits.

Tokens live in PocketBase `api_tokens`. For local bootstrap before the
collection is seeded, set `BOOTSTRAP_TOKENS=<token>:<role>:<slug>,...`.

### Scope (which client)

`agent_*` and `dash_*` tokens are pinned to **one** client slug. Calling any
`/clients/:slug/*` route with a slug that doesn't match the token returns
`403 Token scoped to "<x>", refused access to "<y>"`. The staging Viktor token
is scoped to `staging-demo`, so it can only ever read/write the `staging-demo`
client — regardless of which dashboard URL opened the chat.

## Endpoint reference (what an agent may call)

`:slug` must equal the token's scope. Base path is `/api/v1` on staging
(`/v1` locally). Role column = minimum role required.

| Method & path | Role | Purpose |
|---|---|---|
| `GET /clients` | any | List clients the token can see (agent sees only its own). |
| `GET /clients/:slug` | any (scoped) | One-shot bundle: summary + brief/plan/goals/learnings/suggestions/performance/manifest. |
| `GET /clients/:slug/brief` | any (scoped) | Read the brief (incl. `branding`). |
| `GET /clients/:slug/plan` · `/goals` · `/learnings` | any (scoped) | Read strategy docs. |
| `PUT /clients/:slug/brief` · `/plan` · `/goals` · `/learnings` | dash/admin | Replace the whole doc. **Agent: 403.** |
| `PATCH /clients/:slug/branding` | **agent**/dash/admin | Shallow-merge brand fields. **Agent allowed.** |
| `POST /clients/:slug/learnings/entries` | dash/admin | Append one learning. **Agent: 403.** |
| `GET /clients/:slug/posts` | any (scoped) | List posts. Filters: `?status=`, `?pillar=`, `?includeDeleted=true`. |
| `GET /clients/:slug/posts/:id` | any (scoped) | Read one post. |
| `POST /clients/:slug/posts` | agent/dash/admin | Create a post (validated, 422). |
| `PATCH /clients/:slug/posts/:id` | agent/dash/admin | Edit a post (validated, 422). |
| `DELETE /clients/:slug/posts/:id` | agent/dash/admin | Soft-delete (status→`deleted`; recover via PATCH). |
| `GET /clients/:slug/suggestions` | any (scoped) | List suggestions (priority-sorted). |
| `PATCH /clients/:slug/suggestions/:id` | agent/dash/admin | `{ status?, priority?, reason? }`. |
| `GET /clients/:slug/approvals` | any (scoped) | Approval activity feed (log + overlay). |
| `POST /clients/:slug/approvals` | agent/dash/admin | Record an approval decision. |
| `GET /clients/:slug/performance` | any (scoped) | Read performance JSON. |
| `GET /clients/:slug/assets/manifest` | any (scoped) | Read the asset manifest. |
| `GET /clients/:slug/assets/files/:name` | **none** (public) | Stream a generated image/video asset. Use this URL form in `post.image` for images and in video manifest items for clips. |
| `GET /clients/:slug/inspiration/:id/file` | **none** (public) | Stream an uploaded inspiration image. |

**Branding body** (`PATCH /clients/:slug/branding`) — top-level fields
shallow-merge into `brief.branding`; the dashboard's Brand Identity Kit reads
these keys (all optional, send only what changes):

```jsonc
{
  "colors":       [ { "name": "Primary", "hex": "#1e40af" } ],
  "typography":   { "headingFont": "Inter", "bodyFont": "Inter" },
  "logos":        [ { "variant": "Primary", "url": "https://staging.marketing.gfinnov.com/api/v1/clients/staging-demo/assets/files/logo.png" } ],
  "toneKeywords": ["precise", "technical", "warm"]
}
```

Returns `{ data: <merged branding> }`. **The merge is shallow:** a PATCH replaces
the ENTIRE `colors` (or `logos`) array — there is no per-element merge. To change
one color, `GET /brief` first, edit the array, then PATCH it back whole.
Generate/upload a logo image first (copy it into the client's `assets/` dir) and
reference it by its `/api/v1/clients/:slug/assets/files/<name>` URL — never a bare
filename.

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
| `image` | string URL — field is `image`, not `imageUrl`/`assetIds`. Carousel cover = `slides[0].image` |
| `slides` | carousel only — `Array<{ image: string; caption?: string }>`, max 10, strict per-slide keys. >1 slide ⇒ carousel; set `format:"carousel"` |
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

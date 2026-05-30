# Staging v2 Plan — API, Chatbot, Interactivity

> Draft — awaiting Martin's approval before any code changes.
> **Scope: STAGING ONLY.** No changes to `main` branch, production Caddy site, `hermes-marketing-demo` container, or any `gf-internal` / `fitvibe-demo` data.

---

## 1. Goals (what we're changing and why)

1. **Stable, public API** between Viktor and the platform — replace the current file-on-disk contract on staging with a versioned REST API. Same API will be reusable from any future page (not just the dashboard).
2. **In-platform chatbot widget** — a side panel inside the dashboard where Martin can chat with Viktor directly, without opening Telegram.
3. **More interactive dashboard** — drag-and-drop approvals kanban, inline autosave for brief/plan/goals/learnings, actionable suggestions, quick-edit posts in the calendar.
4. **Strict isolation from production** — a brand new Hermes container (`hermes-marketing-staging`), a new test client slug (`staging-demo`), new Telegram bot, new Anthropic key. Production Viktor instances are not touched at any point.

---

## 2. Non-negotiables (do not violate)

- No commits, builds, or deploys against the `main` branch. All work happens on `experimental`.
- `hermes-marketing-demo` container is **never** restarted, rebuilt, or reconfigured.
- `clients/gf-internal/*` and `clients/fitvibe-demo/*` are **never** read or written by the new staging API.
- Production `marketing.gfinnov.com` Caddy block is not edited. We add a separate block for `staging.marketing.gfinnov.com` only (which already exists).
- The literal-approval contract (no public publishing without a human writing `approve <id>` on Telegram) is preserved in production. On staging, drag-to-approve is allowed because nothing publishes anywhere from the staging stack.

---

## 3. Target architecture (staging)

```
                       Hetzner VPS (46.224.224.113)
 ┌──────────────────────────────────────────────────────────────────────┐
 │                                                                      │
 │   staging.marketing.gfinnov.com  (Caddy block)                       │
 │     ├── /api/v1/*    → reverse_proxy → mp-staging-api:8080  (NEW)    │
 │     ├── /chat/*      → reverse_proxy → hermes-marketing-staging:7000 │
 │     ├── /_pb/*       → reverse_proxy → mp-staging-pb:8090  (admin)   │
 │     └── /*           → React SPA (staging app-dist)                  │
 │                                                                      │
 │   ┌────────────────────────┐    ┌─────────────────────────────────┐  │
 │   │ mp-staging-api  (NEW)   │───▶│ mp-staging-pb  (PocketBase)     │  │
 │   │ Node 22 + Hono          │    │ Storage only — no public access │  │
 │   │ Port 8080 (internal)    │    └─────────────────────────────────┘  │
 │   │ Validates, auth, audit  │                                          │
 │   └─────────┬──────────────┘                                          │
 │             │                                                          │
 │             ▼                                                          │
 │   ┌────────────────────────────────────────┐                          │
 │   │ hermes-marketing-staging  (NEW)         │                          │
 │   │ Same image as production hermes,        │                          │
 │   │ different env: STAGING bot token,        │                          │
 │   │ STAGING Anthropic key, STAGING_API_BASE │                          │
 │   │ Mount: /opt/marketing-planner-staging/  │                          │
 │   │        clients/staging-demo  (only)     │                          │
 │   │ Exposes HTTP /chat (SSE) on port 7000   │                          │
 │   └────────────────────────────────────────┘                          │
 │                                                                      │
 │   PRODUCTION CONTAINERS (untouched):                                 │
 │     - marketing-planner-caddy                                        │
 │     - hermes-marketing-demo                                          │
 └──────────────────────────────────────────────────────────────────────┘
```

Why a dedicated REST service (not raw PocketBase): a versioned API decouples the public contract from the storage shape, enforces auth + scope checks centrally, gives us a single place to add rate limiting and audit logs, and stays stable when we later swap PB for Postgres.

---

## 4. The API (v1)

**Base URL (staging):** `https://staging.marketing.gfinnov.com/api/v1`
**Auth:** bearer token in `Authorization: Bearer <token>`. Two token types:
- `agent_*` — issued per Viktor instance; scoped to one `clientSlug`.
- `dash_*` — issued per dashboard user (basicauth gates the SPA; once inside, the SPA exchanges basicauth for a `dash_*` token).
**Format:** JSON. ISO-8601 timestamps. All write endpoints require `Idempotency-Key` header.
**Errors:** RFC 7807 problem+json.

### 4.1 Resources

```
GET    /v1/health                                     → { ok: true, version }
GET    /v1/clients                                    → ClientSummary[]
GET    /v1/clients/:slug                              → ClientBundle  (brief+plan+goals+learnings+meta)

# User-owned (read+write)
GET    /v1/clients/:slug/brief
PUT    /v1/clients/:slug/brief                        body: Brief        (autosave)
GET    /v1/clients/:slug/plan
PUT    /v1/clients/:slug/plan                         body: Plan
GET    /v1/clients/:slug/goals
PUT    /v1/clients/:slug/goals                        body: Goals
GET    /v1/clients/:slug/learnings
PUT    /v1/clients/:slug/learnings                    body: Learnings
POST   /v1/clients/:slug/learnings/entries            body: Learning     (append)

# Viktor-owned (agent writes, dashboard reads — except staging approvals)
GET    /v1/clients/:slug/posts                        ?status=&pillar=&page=
GET    /v1/clients/:slug/posts/:id
POST   /v1/clients/:slug/posts                        agent-only         (draft)
PATCH  /v1/clients/:slug/posts/:id                    body: PostPatch    (staging: dashboard allowed; prod: agent-only)

GET    /v1/clients/:slug/suggestions
PATCH  /v1/clients/:slug/suggestions/:id              body: { status, reason? }   (accept/dismiss)

GET    /v1/clients/:slug/performance
PUT    /v1/clients/:slug/performance                  agent-only

GET    /v1/clients/:slug/approvals                    → ApprovalEntry[]
POST   /v1/clients/:slug/approvals                    body: { postId, decision, note? }
                                                       (staging: dashboard allowed; prod: agent-only via Telegram)

GET    /v1/clients/:slug/assets/manifest

# Chat (proxy to hermes-marketing-staging /chat)
POST   /v1/clients/:slug/chat/messages                body: { text } → { messageId }
GET    /v1/clients/:slug/chat/stream                  SSE: tokens + tool events
GET    /v1/clients/:slug/chat/history                 ?since=&limit=

# Audit (read-only)
GET    /v1/clients/:slug/audit                        ?since=&action=
```

### 4.2 Scope & guardrails

- Every endpoint checks `token.clientSlug === :slug` (or `token.role === 'admin'`).
- `agent_*` tokens cannot write to user-owned resources (`brief/plan/goals/learnings`) — they're read-only for agents. Conversely, `dash_*` tokens cannot mock-write `performance` or `posts` outside what the staging interactivity allows.
- All writes append a row to `audit` collection with `{actor, action, slug, before, after, ts}`. This is the staging replacement for the per-turn git commit pattern.
- The API is the only thing that writes to PB. The SPA does not talk to PB directly anymore.

### 4.3 OpenAPI

A machine-readable `openapi.yaml` ships with the service. A `/v1/docs` route serves Scalar/Stoplight UI. The dashboard "Developer" tab shows the same spec inline with the agent's bearer token for quick copy/paste.

---

## 5. Chatbot widget

- New shadcn `Sheet` anchored to the right side, toggle button in the header (next to the user picker). State persists per session.
- Streams responses via SSE from `/v1/clients/:slug/chat/stream`. Renders Viktor's tool-use events inline ("Reading brief.json…", "Drafted p041", "Pushed to PocketBase") so Martin can see what the agent did.
- Slash commands surfaced as quick chips: `/suggest`, `/weekly`, `/sync metrics`, `/draft <topic>`.
- The widget talks only to the API — never to Telegram and never to PB. Chat history is stored as PB records (`chat_messages` collection) keyed by `clientSlug + thread`.
- The staging Hermes container exposes a `/chat` HTTP endpoint (small Node sidecar in the same container, or a Hermes built-in if available — to be confirmed in Phase 1).

---

## 6. Interactivity changes (staging UI)

| Area | Change | Backend |
|---|---|---|
| Approvals | Replace list view with kanban (`in_review` / `approved` / `scheduled` / `rejected`). Drag a card → optimistic update → `POST /v1/clients/:slug/approvals` → reconcile. | API |
| Brief / Plan / Goals / Learnings | Remove the "Download JSON" flow. Inline edits debounce-save (1s) via `PUT /v1/clients/:slug/*`. EditBar becomes a save-status indicator ("Saved 2s ago" / "Saving…" / "Conflict — refresh"). | API |
| Suggestions | Add Accept / Dismiss / Reorder buttons. Each hits `PATCH /v1/clients/:slug/suggestions/:id`. Drag to reorder writes a numeric `priority`. | API |
| Calendar / Pipeline | Click a post card → right-side drawer with text editor + date picker. Save calls `PATCH /v1/clients/:slug/posts/:id`. | API |
| Chatbot | New right-side `Sheet`, see §5. | API → Hermes |

Library choices:
- `@dnd-kit/core` + `@dnd-kit/sortable` for kanban and suggestion reordering (already shadcn-friendly).
- TanStack Query for API caching + optimistic mutations (currently the app re-fetches via `useClient`).
- `eventsource-parser` for SSE.

---

## 7. Repository layout (additions)

```
marketing-planner/
├── deploy-staging/
│   ├── api/                          ← NEW — REST API service
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── routes/{clients,posts,approvals,chat,...}.ts
│   │   │   ├── pb.ts                  (PocketBase client)
│   │   │   ├── auth.ts                (token issue + verify)
│   │   │   ├── audit.ts
│   │   │   └── openapi.ts             (zod-to-openapi)
│   │   ├── openapi.yaml               (generated)
│   │   ├── Dockerfile
│   │   ├── package.json               (Hono + zod + pocketbase SDK)
│   │   └── tsconfig.json
│   ├── docker-compose.yml             (+= mp-staging-api, hermes-marketing-staging)
│   ├── Caddyfile.staging              (+ /api/v1/*, /chat/*, /_pb/*)
│   └── pb-migrations/                 (+= chat_messages, audit, api_tokens)
│
├── app-v2/
│   └── src/
│       ├── lib/
│       │   ├── api-client.ts          ← NEW — typed fetch client (generated from openapi)
│       │   ├── query.ts               ← NEW — TanStack Query setup
│       │   └── chat-stream.ts         ← NEW — SSE consumer
│       ├── components/
│       │   ├── chat-sheet.tsx         ← NEW — chatbot widget
│       │   └── approval-kanban.tsx    ← NEW
│       └── routes/client/
│           ├── approvals.tsx          (rewrite to kanban)
│           ├── suggestions.tsx        (add accept/dismiss/reorder)
│           ├── calendar.tsx           (add post drawer)
│           └── pipeline.tsx           (add post drawer)
│
└── STAGING_V2_PLAN.md                 ← this file
```

The new code lives next to the existing staging stack. Production code paths (`app-v2/src/lib/client-data.ts` file-mode loaders, the production Caddy block, the `main` deploy workflow) are not touched.

---

## 8. Build-mode flag

Today: `VITE_PB_URL` decides between file-mode (prod) and PocketBase-mode (staging).

After this change:
- `VITE_API_BASE` — set on staging builds only. When set, the SPA uses the new API client. When unset (production), the file-mode loaders run exactly as before.
- The `VITE_PB_URL` path is left in place but unused on staging once the API ships. Removed in a later cleanup PR.

This means the production bundle is byte-identical to today until we explicitly promote.

---

## 9. The staging Hermes agent

New container, completely independent from `hermes-marketing-demo`:

```
docker run -d \
  --name hermes-marketing-staging \
  --restart unless-stopped \
  --network marketing-planner_default \
  -v /opt/marketing-planner-staging/clients/staging-demo:/data \
  -e CLIENT_SLUG=staging-demo \
  -e TELEGRAM_BOT_TOKEN=<NEW BotFather token>      # to be supplied
  -e ANTHROPIC_API_KEY=<NEW key>                    # to be supplied
  -e ANTHROPIC_DAILY_BUDGET_USD=2 \
  -e API_BASE=http://mp-staging-api:8080/v1 \
  -e API_TOKEN=<agent_* token for staging-demo>     # issued by api service on first boot
  -e CHAT_HTTP_PORT=7000 \
  -e TZ=Europe/Berlin \
  hermes-marketing:latest
```

- New Telegram bot via BotFather — Martin owes the token before Phase 4.
- Anthropic key is a fresh key, not the production one — easy to revoke if anything misbehaves.
- Mount is scoped to `clients/staging-demo` only; the agent cannot read other client folders.
- Postiz is **not** wired up on staging — there's nothing to publish. The `draft`/`approve` skills run end-to-end against the API and stop short of any real Postiz call.

---

## 10. Phasing

| Phase | What ships | Touches production? | Acceptance |
|---|---|---|---|
| **0. Branch + plan** | `experimental` branch up to date with `main`; this plan committed. | No | Plan approved by Martin. |
| **1. API skeleton** | `deploy-staging/api/` Hono service, health route, PB client, token auth, OpenAPI scaffold, Dockerfile. Compose adds `mp-staging-api`. Caddy proxies `/api/v1/*`. | No | `curl /api/v1/health` returns 200 from staging. OpenAPI UI loads at `/api/v1/docs`. |
| **2. API resources** | Implement all read endpoints + brief/plan/goals/learnings writes. Migrate seed.mjs to call the API. Audit collection wired. | No | All existing dashboard reads work going through the API. PB is no longer reachable publicly. |
| **3. Dashboard cutover (read path)** | New `api-client.ts` + TanStack Query. Replace PB SDK usage in `client-data.ts`. Build flag flips to `VITE_API_BASE`. | No | Staging SPA renders identical to today; network tab shows `/api/v1/*` only. |
| **4. Interactivity** | Approval kanban, inline autosave, suggestions actions, post drawer. Posts/approvals/suggestions write endpoints. | No | All four interactions work end-to-end; audit log records every change. |
| **5. Staging Hermes container** | New `hermes-marketing-staging` container, new bot, new key, mounted on `staging-demo`. Agent reads/writes via API. | No | Telegram smoke test (hi/suggest/draft/approve) passes on the new bot. |
| **6. Chatbot widget** | `chat-sheet.tsx`, SSE client, `/chat` HTTP endpoint on the staging container, `chat_messages` collection. Slash chips. | No | Martin can hold a full conversation in the dashboard sheet and see tool events stream. |
| **7. Hardening** | Rate limits, basicauth → dash token exchange, integration test suite, OpenAPI snapshot in CI. | No | CI green on `experimental`; staging stable for ≥48h before any merge-to-main is even discussed. |

Each phase is its own PR against `experimental`, deployable independently.

---

## 11. Open questions for Martin

1. **Hermes `/chat` endpoint** — does the existing Hermes image expose an HTTP entrypoint, or do we need a small Node sidecar in the staging container? (Decision affects Phase 5/6 scope.)
2. **New Telegram bot + new Anthropic key** — when can Martin generate these? They block Phase 5.
3. **Audit retention** — keep forever in PB, or roll into a flat file after N days? Recommend keep-forever for now (small volume).
4. **Production promotion path** — out of scope for this plan, but flagging: once staging is stable, promoting to `main` means standing up the same API in front of file storage (or migrating prod to PB). Worth a separate plan when we get there.
5. **Cost cap** — `ANTHROPIC_DAILY_BUDGET_USD=2` on the staging agent — OK, or higher/lower?

---

## 12. What this plan deliberately does **not** do

- No changes to the `main` branch or the production Caddy block.
- No changes to `hermes-marketing-demo` (production Viktor for fitvibe-demo) or `gf-internal` data.
- No Postiz integration on staging.
- No dark mode, no brand-color refactor.
- No public-publish path from the dashboard — even on staging, posts never leave PB.
- No production API yet — staging is the proving ground; production cutover gets its own plan.

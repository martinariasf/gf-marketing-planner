# Marketing Planner — Architecture

> Last updated: 2026-06-04
>
> **Before changing or deploying anything, read [`AGENTS.md`](./AGENTS.md)** —
> the change & deployment guidelines (source-only edits, commit everything,
> CI-only deploys, the `VITE_API_BASE` file-mode trap). It exists because not
> following it took staging down on 2026-06-04.
>
> ⚠️ **Staging backend has changed since the 2026-05 sections below.** The
> "Backend Architecture (Staging)" and parts of "Deployment" that describe the
> SPA talking to PocketBase directly via `/api/*` are **historical**. The
> current truth is the **`/api/v1/*` REST API** described immediately below
> (§ "Current Staging Architecture"). When in doubt, that section wins.

## Overview

The Marketing Planner is a per-client marketing dashboard built for **GF Innovative Solutions**. It surfaces the work of **Viktor** (an AI marketing agent) alongside human-editable setup data. The system runs on a single Hetzner VPS (`46.224.224.113` / Tailscale `100.92.24.75`).

There are two environments:

| | Production | Staging |
|---|---|---|
| URL | `marketing.gfinnov.com` | `staging.marketing.gfinnov.com` |
| Branch | `main` | `experimental` |
| Data backend | Static JSON on disk | PocketBase (SQLite) |
| Auth | HTTP basic auth (per-client passwords) | HTTP basic auth (single staging password) |

---

## Current Staging Architecture (2026-06)

> This section supersedes the older "Backend Architecture (Staging)" details
> further down. Production is still file-based; **staging** now runs a real REST
> API in front of the dashboard.

### Request path (staging)

```
Browser
  │  HTTPS, edge basicauth (staging:****)
  ▼
marketing-planner-caddy   (OUTER / production caddy, owns :80/:443)
  ├── /api/v1/auth/exchange → basicauth → inject X-Forwarded-User → mp-staging-caddy
  ├── /api/v1/*  (bearer-auth, no basicauth) ───────────────────┐
  ├── /chat/*    (bearer-auth) ────────────────────────────────┤
  └── /*  (basicauth) ─────────────────────────────────────────┤
                                                                ▼
                                              mp-staging-caddy   (INNER caddy)
                                                ├── /api/v1/* → mp-staging-api:8080  (Hono REST API)
                                                ├── /_/*      → mp-staging-pb:8090   (PocketBase admin)
                                                └── /*        → staging SPA (app-dist)
                                                                       │
                                  mp-staging-api ──► mp-staging-pb (PocketBase: chat, planning config, etc.)
                                  mp-staging-api ──► /data (disk: clients/*.json — brief/plan/posts/assets)
                                  mp-staging-api ──► hermes-marketing-staging:8642  (Ask Viktor chat, SSE)
```

### The REST API — `mp-staging-api` (Hono + TypeScript, `deploy-staging/api/`)

The dashboard no longer hits PocketBase directly. It calls `/api/v1/*`, served by
the `mp-staging-api` container (listens on `:8080`). Routes live in
`deploy-staging/api/src/routes/`:

| Route file | Surface |
|---|---|
| `authExchange.ts` | `GET /auth/exchange` — trades edge basicauth (via `X-Forwarded-User`) for a short-lived `dash_*` bearer token (in-memory, 24h) |
| `clients.ts` | `GET /clients` (picker), `GET /clients/:slug` (bundle) |
| `userOwned.ts` | `PUT /clients/:slug/{brief,plan,goals,learnings}` (dash/admin only) |
| `viktorOwned.ts` | posts/suggestions/approvals/branding writes (dash/admin/**agent**) |
| `assetFiles.ts`, `inspiration.ts` | asset + inspiration-board files |
| `chat.ts` | `POST /clients/:slug/chat/stream` — **Ask Viktor**: SSE proxy to Hermes (`hermes-marketing-staging`), persists transcript to PB `chat_messages` |
| `notify.ts`, `audit.ts`, `integration.ts`, `health.ts` | sync log, audit, agent integration info, health |
| `planningConfig.ts` *(in-flight feature)* | calendar/strategy month-range config per client (new; see recovery work) |

**Auth model:** `requireAuth` (bearer) + `requireScope()` (confines a token to its
client) + `requireRole(...)`. Dashboard users get a `dash_*`/`admin` token via
`/auth/exchange`; Viktor uses an `agent_*` token scoped to one client.

### Frontend modes — and the file-mode trap

`app-v2` is built in one of two modes, chosen **at build time**:

- `isApiEnabled = !!import.meta.env.VITE_API_BASE` → **API mode** (current
  staging): the SPA calls `/api/v1/*`.
- `isPocketBaseEnabled = !!import.meta.env.VITE_PB_URL` → legacy PB mode.
- Neither set → **file mode**: reads static `/data/*.json` (production).

⚠️ **Staging MUST be built with `VITE_API_BASE` set** (the CI workflow does this;
a plain local `pnpm build` does not). A staging build without it falls back to
file mode, reads `/data/index.json`, gets caddy's SPA HTML fallback, and shows
**"No clients yet"** with a dead chat. Verify a build is API mode by grepping the
**`api-client-*.js` chunk** (not `index-*.js`) for `api/v1`. See `AGENTS.md` §4.

### Staging containers

| Container | Purpose |
|---|---|
| `marketing-planner-caddy` | OUTER caddy — TLS, edge basicauth, routes staging host (owns :80/:443) |
| `mp-staging-caddy` | INNER caddy — fans out `/api/v1`→api, `/_/`→pb, `/`→SPA |
| `mp-staging-api` | Hono REST API (`:8080`) — the `/api/v1/*` surface |
| `mp-staging-pb` | PocketBase — chat_messages, planning config, user-owned docs |
| `hermes-marketing-staging` | Viktor's brain for the in-app chat (Hermes agent gateway, `:8642`) |
| `hermes-marketing-demo` | **Production Viktor — NEVER restart/remove** |

### Deploy (staging)

Push to `experimental` (or run `deploy-staging.yml`). CI builds `app-v2` **with
`VITE_API_BASE` set**, rsyncs `dist/` → `/opt/marketing-planner-staging/app-dist`,
and rebuilds the `mp-staging-api` + `mp-staging-caddy` containers from
`deploy-staging/`. **Never** hand-build + rsync, and **never** edit the compiled
`app-dist`. Full rules in `AGENTS.md`.

---

## High-Level Diagram

```
                        Hetzner VPS (46.224.224.113)
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │  ┌─────────────────────────────────────────────────────────────┐ │
  │  │  marketing-planner-caddy  (Caddy 2)                        │ │
  │  │  Ports: 80 + 443 (Let's Encrypt auto-TLS)                  │ │
  │  │                                                             │ │
  │  │  marketing.gfinnov.com (production)                        │ │
  │  │    ├── /*           → React SPA (app-v2/dist)              │ │
  │  │    └── /data/*      → Static JSON (clients/<slug>/...)     │ │
  │  │                                                             │ │
  │  │  staging.marketing.gfinnov.com (staging)                   │ │
  │  │    ├── /api/*       → reverse_proxy → mp-staging-pb:8090   │ │
  │  │    ├── /_/*         → reverse_proxy → mp-staging-pb:8090   │ │
  │  │    ├── /data/*      → Static JSON (Viktor-owned)           │ │
  │  │    └── /*           → React SPA (staging app-dist)         │ │
  │  └─────────────────────────────────────────────────────────────┘ │
  │                              │                                   │
  │                     Docker network                               │
  │                     (marketing-planner_default)                   │
  │                              │                                   │
  │  ┌───────────────────────────┴──────────────────────────┐       │
  │  │  mp-staging-pb  (PocketBase v0.38)                    │       │
  │  │  Port: 8090 (internal only)                           │       │
  │  │  Admin UI: /_/                                        │       │
  │  │  REST API: /api/collections/*/records                 │       │
  │  │  SQLite data: Docker volume pb_data                   │       │
  │  └──────────────────────────────────────────────────────┘       │
  │                                                                  │
  │  ┌──────────────────────────────────────────────────────┐       │
  │  │  hermes-marketing-demo  (Viktor — DO NOT TOUCH)       │       │
  │  │  The production AI agent. Never restart or remove.    │       │
  │  └──────────────────────────────────────────────────────┘       │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

---

## Data Ownership Model

This is the single most important architectural concept. Data is split into two categories with strict boundaries:

### User-Owned (editable in the dashboard)

| File | PB Collection | Description |
|---|---|---|
| `brief.json` | `briefs` | Company context — name, industry, audience, value prop, tone |
| `plan.json` | `plans` | Strategic plan — quarter, goals, channels, agency info |
| `goals.json` | `goals` | Goals vs actuals — KPIs, targets, progress |
| `learnings.json` | `learnings` | Lessons learned — what worked, what didn't |
| `clients/index.json` | `clients` | Client picker metadata — slug, name, industry, logo |

### Viktor-Owned (read-only in the dashboard, always static JSON)

| File | Description |
|---|---|
| `posts/*.json` | Individual post content (text, images, scheduling) |
| `posts/index.json` | Post manifest |
| `suggestions.json` | AI-generated content suggestions |
| `performance.json` | Analytics & performance metrics |
| `approvals.log` | Human approval records (Telegram-based) |
| `assets/manifest.json` | Generated image assets |

**The literal-approval contract**: Nothing publishes without a human writing "approve" to Viktor on Telegram. Viktor-owned files are never written through the dashboard — they stay as files on disk, written by Viktor and served by Caddy. This is true in both production and staging.

---

## Frontend Architecture

```
app-v2/
├── src/
│   ├── main.tsx                    # Entry point, router setup
│   ├── lib/
│   │   ├── client-data.ts          # Dual-mode data loaders (public API)
│   │   ├── pocketbase.ts           # PB client singleton + typed helpers
│   │   ├── edit-store.tsx          # localStorage patch overlay + React context
│   │   └── utils.ts                # cn() and other utils
│   ├── hooks/
│   │   └── use-client.ts           # useClient(slug) — loads full ClientBundle
│   ├── components/
│   │   ├── edit-bar.tsx            # Floating save/download panel
│   │   ├── workflow-strip.tsx      # Phase indicator (plan→draft→refine→prepare→learn)
│   │   ├── gf-logo.tsx            # Brand logo component
│   │   ├── editable/              # Inline-edit primitives (text, textarea, pills, list)
│   │   └── ui/                    # shadcn/ui components
│   ├── routes/
│   │   ├── home.tsx               # Client picker
│   │   └── client/
│   │       ├── layout.tsx         # Sidebar + header + outlet
│   │       ├── context.tsx        # Company Context (brief.json)
│   │       ├── goals.tsx          # Goals vs Actuals
│   │       ├── strategy.tsx       # Strategy
│   │       ├── suggestions.tsx    # AI Suggestions
│   │       ├── calendar.tsx       # Content Calendar
│   │       ├── pipeline.tsx       # Pipeline (kanban)
│   │       ├── approvals.tsx      # Approvals queue
│   │       ├── assets.tsx         # Assets gallery
│   │       ├── performance.tsx    # Performance analytics
│   │       └── learnings.tsx      # Learnings
│   └── types/
│       └── index.ts               # All TypeScript interfaces
├── public/
├── dist/                          # Vite build output
├── .env.staging                   # VITE_PB_URL for staging builds
├── package.json                   # pocketbase v0.26.9, react, vite, etc.
└── vite.config.ts
```

### Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **React Router** (file-based routes, code-split)
- **Tailwind CSS** with GF brand tokens
- **shadcn/ui** component library
- **Framer Motion** for animations
- **Recharts** for performance charts
- **Lucide React** for icons
- **PocketBase JS SDK** v0.26.9 (conditional, build-time switch)

### Dual-Mode Data Layer

The app operates in one of two modes, determined at **build time** by the `VITE_PB_URL` environment variable:

```
                ┌─────────────────────────────────┐
                │        Page Component            │
                │   const data = useOutletContext() │
                └──────────────┬──────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │    loadClient(slug)   │   ← client-data.ts (public API)
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     isPocketBaseEnabled?      │          Always file-based
              │                │                │
      ┌───────┴───────┐       │     ┌──────────┴──────────┐
      │  PB loaders   │       │     │  Viktor-owned data   │
      │  (pocketbase.ts)│     │     │  loadPosts()         │
      │  pbLoadBrief() │       │     │  loadPerformance()   │
      │  pbLoadPlan()  │       │     │  loadSuggestions()   │
      │  pbLoadGoals() │       │     │  loadApprovalsLog()  │
      │  pbLoadLearnings()│    │     │  loadAssetsManifest()│
      └───────────────┘       │     └─────────────────────┘
                              │
                     ┌────────┴────────┐
                     │  File loaders    │
                     │  fileBrief()     │ ← fallback when
                     │  filePlan()     │   VITE_PB_URL unset
                     │  fileGoals()    │   (production today)
                     └────────────────┘
```

**Key behavior**: `isPocketBaseEnabled` is a build-time constant (`!!import.meta.env.VITE_PB_URL`). Vite tree-shakes the unused path, so production bundles don't include the PocketBase SDK.

### Edit Flow

```
  User types in editable field
           │
           ▼
  edit-store.tsx: setField(slug, file, path, value)
           │
           ▼
  Patch stored in React context + localStorage
  (optimistic — UI updates immediately via deepMerge)
           │
           ▼
  EditBar shows "N files modified"
           │
           ├── [PB mode] User clicks "Save"
           │       │
           │       ▼
           │   pbSave(slug, file, mergedData)
           │       │
           │       ▼
           │   PocketBase REST API → SQLite
           │       │
           │       ▼
           │   resetFile() → clear localStorage patch
           │       │
           │       ▼
           │   onSaved() → layout.refetch() → re-fetch from PB
           │
           └── [File mode] User clicks "Download"
                   │
                   ▼
               Browser downloads merged JSON file
               (user manually commits to repo)
```

---

## Backend Architecture (Staging)

### PocketBase Collections

| Collection | Fields | Notes |
|---|---|---|
| `clients` | `slug` (text, unique), `name`, `industry`, `logoInitials`, `quarter`, `headline`, `status` | Client picker index |
| `briefs` | `slug` (text, unique), `data` (JSON) | Company brief — full JSON blob in `data` |
| `plans` | `slug` (text, unique), `data` (JSON) | Strategic plan |
| `goals` | `slug` (text, unique), `data` (JSON) | Goals vs actuals |
| `learnings` | `slug` (text, unique), `data` (JSON) | Learnings |

All document collections (`briefs`, `plans`, `goals`, `learnings`) store their entire JSON structure in a single `data` field. This avoids schema migration when the JSON shape evolves.

### PocketBase Auth

PB v0.38 uses the `_superusers` system collection for admin auth:

```
POST /api/collections/_superusers/auth-with-password
Body: { "identity": "admin@gfinnov.com", "password": "..." }
→ { "token": "..." }
```

The seed script (`deploy-staging/seed.mjs`) tries three auth endpoints for backward compatibility:
1. `/api/collections/_superusers/auth-with-password` (v0.38+)
2. `/api/superusers/auth-with-password` (v0.23+)
3. `/api/admins/auth-with-password` (legacy)

### REST API Pattern

```
GET    /api/collections/{collection}/records?filter=(slug='{slug}')
POST   /api/collections/{collection}/records          { slug, data }
PATCH  /api/collections/{collection}/records/{id}     { data }
```

The JS SDK wraps these — `pb.collection('briefs').getFirstListItem('slug="fitvibe-demo"')`.

---

## Deployment

### Directory Structure on Hetzner

```
/opt/
├── marketing-planner/                    # PRODUCTION
│   ├── dist/                             # React SPA build (from main branch)
│   ├── clients/                          # All client data (JSON files)
│   │   ├── index.json
│   │   ├── fitvibe-demo/
│   │   │   ├── brief.json
│   │   │   ├── plan.json
│   │   │   ├── goals.json
│   │   │   ├── posts/
│   │   │   └── ...
│   │   └── gf-internal/
│   │       └── ...
│   ├── docker-compose.yml
│   └── Caddyfile
│
├── marketing-planner-staging/            # STAGING
│   ├── app-dist/                         # React SPA build (from experimental branch)
│   ├── clients/                          # Viktor-owned static data (copy/symlink)
│   ├── docker-compose.yml
│   ├── Caddyfile.staging
│   ├── pb-migrations/
│   └── .env                              # STAGING_BCRYPT_HASH
```

### Docker Containers

| Container | Image | Network | Purpose |
|---|---|---|---|
| `marketing-planner-caddy` | `caddy:2-alpine` | `marketing-planner_default` | Reverse proxy, TLS, SPA, static files (both domains) |
| `mp-staging-pb` | `ghcr.io/muchobien/pocketbase:latest` | `marketing-planner_default` | PocketBase — staging backend |
| `hermes-marketing-demo` | custom | (standalone) | Viktor AI agent — **NEVER restart or remove** |

### CI/CD Pipelines

**Production** (`main` branch):
```
Push to main → GitHub Actions → pnpm build → rsync dist/ to /opt/marketing-planner/dist/
```

**Staging** (`experimental` branch):
```
Push to experimental → GitHub Actions → pnpm build (with VITE_PB_URL) → rsync to /opt/marketing-planner-staging/
```

The staging workflow (`.github/workflows/deploy-staging.yml`) triggers on:
- Push to `experimental` when `app-v2/**`, `deploy-staging/**`, or the workflow file changes
- Manual `workflow_dispatch`

It builds with `VITE_PB_URL=https://staging.marketing.gfinnov.com` and rsyncs both the app dist and deploy-staging config files.

### Caddy Configuration

The production Caddy instance serves **both** domains from a single Caddyfile on the server. The staging domain block proxies `/api/*` and `/_/*` to PocketBase via the Docker network (`mp-staging-pb:8090`), serves Viktor-owned static JSON at `/data/*`, and falls back to the SPA for everything else. Site-wide basic auth protects the staging domain.

The repo contains `deploy-staging/Caddyfile.staging` as reference, but the actual running Caddyfile on the server is the merged multi-domain version.

---

## Git Branching

```
main (production)                    experimental (staging)
  │                                       │
  │   ┌───────────────────────────────┐   │
  │   │  PR: experimental → main      │   │
  │   │  when staging is validated     │   │
  │   └───────────────────────────────┘   │
  │                                       │
  ▼                                       ▼
marketing.gfinnov.com         staging.marketing.gfinnov.com
(file-based, no PocketBase)   (PocketBase backend enabled)
```

### Merge to Production Checklist

1. PR `experimental` → `main`
2. Set `VITE_PB_URL` in production deploy workflow
3. Add PocketBase to production docker-compose
4. Migrate data from staging PB → production PB (or re-seed from JSON)

---

## Security Notes

- **Basic auth passwords** are in Martin's 1Password — not in the repo or memory files
- **PocketBase admin credentials** are separate from basic auth
- **Viktor-owned files** are never writable through the dashboard UI
- **The literal-approval contract** is enforced by architecture: Viktor-owned data paths have no write endpoint
- **`STAGING_BCRYPT_HASH`** is stored in `/opt/marketing-planner-staging/.env` on the server (not in the repo)

---

## Key Files Reference

| File | Purpose |
|---|---|
| `app-v2/src/lib/client-data.ts` | Dual-mode data loaders — the public API all pages use |
| `app-v2/src/lib/pocketbase.ts` | PB client singleton, typed loaders, `pbSave()`, `isPocketBaseEnabled` |
| `app-v2/src/lib/edit-store.tsx` | localStorage patch overlay, `deepMerge`, `useEdit` hook |
| `app-v2/src/components/edit-bar.tsx` | Floating save/download bar — dual-mode UI |
| `app-v2/src/hooks/use-client.ts` | `useClient(slug)` — loads `ClientBundle`, exposes `refetch()` |
| `app-v2/src/routes/client/layout.tsx` | Client layout — merges patches into outlet context |
| `deploy-staging/docker-compose.yml` | PocketBase + Caddy staging stack |
| `deploy-staging/Caddyfile.staging` | Staging Caddy config (reference) |
| `deploy-staging/seed.mjs` | Seeds PocketBase from JSON files |
| `deploy-staging/README.md` | Staging setup & operations guide |
| `.github/workflows/deploy-staging.yml` | CI: build + deploy to staging on push to `experimental` |
| `SKILL.md` | Cross-skill conventions — file layout, write contracts, commit patterns, voice rules |
| `AGENT.md` | How Viktor is created — architecture, per-client recipe, safety invariants |
| `clients/<slug>/VIKTOR.md` | Per-client agent spec — voice, skills installed, env vars, boundaries |
| `deploy/viktor-skills/*.md` | Individual skill specs — the agent's actual brain |

---

## Viktor Agent Design

This section documents the AI marketing agent (**Viktor**) — what skills it needs, how it's structured, and everything a new AI would need to build or extend it.

### What Viktor Is

Viktor is GF Innovative Solutions' per-client AI Marketing Assistant. Each client gets their own Viktor instance — a **Hermes agent** in a Docker container on the Hetzner box. Viktor is accessible via a dedicated Telegram bot per client and shares the same filesystem as the dashboard.

```
┌────────────────────────────────────────────────────────────────┐
│  Hermes runtime (Docker container, one per client)             │
│  ├── LLM (Claude via Anthropic API)                            │
│  ├── Tool: filesystem read/write (scoped to /data)             │
│  ├── Tool: git commit + push                                   │
│  ├── Tool: Telegram in/out (dedicated bot per client)          │
│  ├── Tool: Postiz API (queue posts + pull analytics)           │
│  ├── Tool: Nano Banana (Google API image generation)           │
│  └── Skills directory (/opt/skills/*.md — the actual brain)    │
└────────────────────────────────────────────────────────────────┘
                         ↕
        /opt/marketing-planner/clients/<slug>/
        ├── brief.json       (identity, voice, boundaries)
        ├── plan.json        (strategy, pillars, campaigns)
        ├── goals.json       (KPI targets)
        ├── performance.json (actuals — written by Viktor)
        ├── learnings.json   (lessons)
        ├── suggestions.json (Viktor's recommendations)
        ├── approvals.log    (audit trail)
        └── posts/p###.json  (one file per post)
                         ↕
                    Caddy → React dashboard (human review interface)
```

The **dashboard** is the cockpit. **Telegram** is the chat interface. **Skills** are the brain.

### Skill Architecture

Everything Viktor "knows how to do" is a Markdown file with YAML frontmatter. Each skill declares:

- `name` and `description`
- `trigger` — regex patterns (Telegram messages), cron schedules, or "after another skill"
- Inputs, outputs, file-write contracts, commit patterns, idempotence rules, safety invariants

Skills are cheap to add: a few hundred lines of Markdown plus a test loop on Telegram.

### Skills Inventory

#### Implemented (spec complete, not yet deployed)

| Skill | File | Triggers | What it does |
|---|---|---|---|
| **Approvals** | `deploy/viktor-skills/approvals.md` | `^(approve\|reject\|revise\|block\|unblock)\s+(p\d+)` | Processes literal approval commands from Telegram. Flips post status, appends to `approvals.log`, queues approved posts to Postiz, commits. This is the most safety-critical skill. |
| **Sync Postiz Analytics** | `deploy/viktor-skills/sync-postiz-analytics.md` | Daily 06:00 UTC; `^(sync\s+metrics\|sync\s+postiz\|refresh\s+performance)` | Pulls per-post metrics from Postiz API, recomputes aggregates + goal progress (pace: ahead/on-track/behind), rewrites `performance.json`. Closes the metrics loop. |
| **Weekly Summary** | `deploy/viktor-skills/weekly-summary.md` | Monday 09:00 local; `^(weekly\s+summary\|recap\s+last\s+week\|what\s+changed\s+this\s+week)` | Reads performance + goals + learnings, writes a digest (wins/losses/nextTest) into `performance.weeklySummary`, posts to Telegram, optionally proposes a hypothesis as a low-confidence learning. |
| **AI Suggestions** | `deploy/viktor-skills/ai-suggestions.md` | Wednesday 10:00 local; after `sync-postiz-analytics`; after `weekly-summary`; `^(suggest\|what\s+should\s+i\s+do\s+next\|ideas?)` | The proactive intelligence layer. Reads the full picture (brief, plan, posts, performance, learnings) and proposes next actions. Writes `suggestions.json`. Hard cap: 8 open suggestions, 3 new per run. |

#### Still to Build

| Skill | Purpose | Dependencies |
|---|---|---|
| **Draft** | Write a post matching brief voice + plan pillar. Default: LinkedIn long-form. Picks next free post ID, writes `posts/p###.json` with `status: "in_review"`, updates `posts/index.json`, commits. | Reads `brief.json` (voice), `plan.json` (pillar/campaign), `goals.json` (weekly focus). Calls Nano Banana if image needed. |
| **Nano Banana Image** | Generate cover images via Google API. Constraints: never produce AI-stock-looking glowy abstracts. Must be photo-realistic, screenshot-style, or simple diagrammatic. | `NANO_BANANA_KEY` env var. |
| **Accept Suggestion** | Triggered when human pastes a `suggestedAction` from `suggestions.json`. Fuzzy-matches against open suggestions, flips status to `accepted`, then delegates to the appropriate skill (e.g., `draft`). | Reads `suggestions.json`. Calls sibling skills. |
| **Dismiss Suggestion** | Triggered by `dismiss s007 reason="..."`. Flips status, fills decided fields, commits. | Reads/writes `suggestions.json`. |
| **Log Learning** | Triggered by human saying "log this as a lesson". Appends to `learnings.json` with a mandatory `recommendedBehaviorChange` field. | Reads/writes `learnings.json`. |

### Skill Design Rules (for building new skills)

Any new AI building or extending Viktor must follow these conventions:

1. **One skill = one `.md` file** in `deploy/viktor-skills/`. YAML frontmatter with `name`, `description`, `trigger`.

2. **File contracts**:
   - One concept = one file. Never bundle posts together.
   - Always preserve fields you don't understand (write back unchanged).
   - Atomic writes: write to tmp file, `mv` into place. A crash must never leave truncated JSON.
   - The TypeScript types in `app-v2/src/types/` are the authoritative schema. The dashboard validates against them at compile time.

3. **Commit pattern**: One commit per Telegram message turn. Stage everything modified, push immediately. If push fails, report and stop (never `--force`, never retry destructively).

4. **Approval is literal**: No public action without a human writing the word "approve" + the post ID on Telegram. No exceptions. No auto-approve. No silent publish.

5. **Scope enforcement**: Filesystem writes only to `/data` (the per-client folder). Never reach into other clients' folders.

6. **Boundary checking**: Every action is checked against `brief.boundaries` before sending anything to Telegram or Postiz. Sensitive topics, words-to-avoid, who-handles-DMs — all enforced.

7. **Idempotence**: Running a skill twice with the same input must produce the same result. An `approve` on an already-approved post is a no-op. A metrics sync that produces identical `performance.json` skips the commit.

8. **Telegram reply format**: Keep digests short. Quote specific numbers. Always include a dashboard URL. Use Telegram-flavored Markdown when available.

### Per-Client Deployment Recipe

Each client gets their own Docker container for isolation:

```
docker run -d \
  --name viktor-<slug> \
  --restart unless-stopped \
  -v /opt/marketing-planner/clients/<slug>:/data \
  -v /opt/marketing-planner:/repo \
  -e CLIENT_SLUG=<slug> \
  -e TELEGRAM_BOT_TOKEN=<from BotFather> \
  -e POSTIZ_BASE=<postiz instance URL> \
  -e POSTIZ_TOKEN=<workspace API token> \
  -e POSTIZ_CHANNEL_LINKEDIN=<channel id> \
  -e NANO_BANANA_KEY=<google API key> \
  -e ANTHROPIC_API_KEY=<per-client API key> \
  -e ANTHROPIC_DAILY_BUDGET_USD=5 \
  -e GIT_AUTHOR_NAME=viktor-<slug> \
  -e GIT_AUTHOR_EMAIL=viktor@gfinnov.com \
  -e TZ=Europe/Berlin \
  hermes-marketing:latest
```

Then install skills: copy `deploy/viktor-skills/*.md` into the container's `/opt/skills/` and reload.

**Why one container per client**:
- Telegram bot tokens are isolated (one bot = one client).
- Postiz credentials are scoped (one workspace per client).
- A bug in one client's skill set can't corrupt another's data.
- Containers can be paused/upgraded independently.

### Required Intake for New Client Onboarding

Before Viktor can operate for a new client, these inputs are required (do not fabricate):

1. **Company basics** — name, industry, country, website, contact (name + Telegram)
2. **Business** — model, customer type, main offer, best-seller, top 3 differentiators
3. **Audience** — 1-3 segments with demographic + psychographic + where they hang out; pain points + desires + competitors + reference brands
4. **Voice** — tone words, words to use, words to avoid, do/don't list
5. **Channels** — which platforms, cadence, language
6. **Boundaries** — what Viktor can do without asking, what needs approval, what's off-limits
7. **Metrics that matter** — the 3-5 numbers the client actually cares about
8. **Expectations** — what success looks like in 90 days, in their words
9. **Quarter** — which quarter, year, theme, headline
10. **Strategic priorities** — monthly focus + key dates + campaign roadmap + content pillars + platform strategy
11. **Goals** — quarterly targets (numbers), monthly breakdown, 12 weekly focuses with their KPI

### Weekly Execution Cycle

```
Mon 06:00 UTC  │ sync-postiz-analytics   → pull metrics, rewrite performance.json
Mon 06:05      │ ai-suggestions (reactive)→ refresh if data changed materially
Mon 09:00 local│ weekly-summary          → wins/losses/nextTest → Telegram + dashboard
Mon 09:15      │ ai-suggestions (reactive)→ refresh post-summary
                │
Tue-Fri 06:00  │ sync-postiz-analytics   → daily metrics pull
                │
Wed 10:00 local│ ai-suggestions (scheduled)→ "3 suggestions for this week" → Telegram
                │
Any time       │ Human on Telegram:
               │   "approve p041"        → approvals skill
               │   "draft a post about X"→ draft skill (future)
               │   "suggest"             → ai-suggestions (on-demand)
               │   "weekly summary"      → weekly-summary (on-demand)
               │   "sync metrics"        → sync-postiz-analytics (on-demand)
```

### Safety Invariants (Non-Negotiable)

These apply globally across all skills and all clients:

1. **No public action without literal human approval.** No post publishes, no DM is sent, no comment is posted, no email goes out, unless a human wrote "approve" + the ID on Telegram.
2. **Stay in scope.** Filesystem writes only to `/data`. Git writes only inside the repo. Never cross into other clients' folders.
3. **Respect boundaries.** Every action checked against `brief.boundaries`. Sensitive topics, words-to-avoid, who-handles-DMs — all enforced before output.
4. **Commit everything.** Every mutation appends to a log AND creates a git commit. No "silent" changes.
5. **Atomic writes.** Tmp + rename. A crash never leaves a file half-written.
6. **No retries on destructive failures.** If `git push` fails, report and stop. Don't loop, don't `--force`.
7. **No model fallbacks across clients.** A client paying for Opus gets Opus. If it's down, reply explaining the outage; do not silently downgrade.

### Open Questions Before First Real Deploy

- [ ] Confirm Hermes accepts `.md` skill files as-is, or if YAML frontmatter needs a different format
- [ ] Verify Postiz API shape (queue + analytics) against a real Postiz instance
- [ ] Implement per-client daily cost cap on Anthropic API (`ANTHROPIC_DAILY_BUDGET_USD`)
- [ ] Write remaining skills: `draft`, `nano-banana-image`, `accept-suggestion`, `dismiss-suggestion`, `log-learning`
- [ ] Create Telegram bot via BotFather + capture token for GF Internal
- [ ] End-to-end smoke test against private Telegram thread before going live

### GF Internal — First Client Instance

The first Viktor instance is for GF Innovative Solutions itself (slug: `gf-internal`). Per-client spec: `clients/gf-internal/VIKTOR.md`.

Key specifics:
- **Voice**: First-person founder voice (Martin). Engineer-to-engineer. Show, don't tell. Allergic to buzzwords.
- **Primary channel**: LinkedIn (3-4 posts/week)
- **Escalation contact**: Martin only. Viktor never talks to anyone else on GF's behalf.
- **What Viktor can do without asking**: draft posts, generate images, research trends, summarize analytics, propose suggestions.
- **What needs human approval**: any public action, naming a client, quoting revenue/pricing, referencing unreleased work, "we are" positioning copy.
- **Hard-refuse topics**: client confidentiality, pricing, politics/religion, crypto/web3.

### Smoke Test Sequence (for any new client)

```
1. "hi viktor"
   → Expect: greeting in the brand voice from brief.json

2. "what should I do next"
   → Expect: ai-suggestions skill fires, returns top 3 open suggestions
     with dashboard link

3. "draft a post about <topic>"
   → Expect: new posts/p###.json created, index updated, commit pushed,
     Telegram preview sent. Status: in_review.

4. "approve p###"
   → Expect: status flipped to approved, approvals.log appended,
     Postiz queued (if configured), commit pushed.
```

If any of these fail, do not go live. Debug, redeploy, retest.

### How to Add a New Skill

1. Write a new `.md` in `deploy/viktor-skills/` following the pattern of existing skills. Include YAML frontmatter with `name`, `description`, `trigger`.
2. Add a brief mention in `SKILL.md`'s "common workflows" section.
3. Update the skills table in `AGENT.md`.
4. Push to `main`.
5. Copy the skill into each running Viktor container and reload:
   ```bash
   docker cp deploy/viktor-skills/new-skill.md viktor-<slug>:/opt/skills/
   docker exec viktor-<slug> /opt/hermes/reload-skills
   ```

### Document Hierarchy (for a new AI reading this codebase)

Read these files in this order to understand Viktor:

```
1. ARCHITECTURE.md      ← You are here. System overview + agent design.
2. SKILL.md             ← Cross-skill conventions. File layout, write contracts,
                          commit patterns, voice rules. Loaded as top-level
                          system prompt for every Viktor instance.
3. AGENT.md             ← How Viktor is created. Per-client deployment recipe,
                          safety invariants, skills inventory. Read when
                          bootstrapping a new client.
4. clients/<slug>/VIKTOR.md  ← Per-client refinement. Voice anchors, installed
                               skills, env vars, boundaries, workflow timing.
                               Read as part of the agent's system prompt.
5. deploy/viktor-skills/*.md ← Individual skill specs. The actual brain.
6. app-v2/src/types/    ← TypeScript types = authoritative data schema.
                          Viktor's JSON must conform to these.
```

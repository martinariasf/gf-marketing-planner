---
project: Multi-tenant auth & user management (GF-58)
updated: 2026-06-24
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-006, TASK-007, TASK-008]
items:
  - gf-58: Multi-tenant auth & user management (agencies + accounts + RBAC) | priority: high
---

# Plan

## Simple Words

Today every dashboard login is a shared password where the **username is the
client slug** (`biomas`, `fitvibe-demo`), checked by HTTP basicauth at the edge
Caddy. That can't scale to ~10 agencies × ~5 clients, and it's why switching
logins is painful (the browser caches one basicauth user forever).

We replace it with **real accounts**: each person logs in with their **email +
password**, gets a session, and sees exactly the clients they're allowed to —
across one or more clients of their **agency**. Roles decide what they can do.
GF staff are platform admins and see everything. Granting access becomes
"invite an email", not "SSH into the box and edit Caddy".

Two things stay OUT of scope here:
- **External review-links are a different, deliberately lightweight flow** — a
  shareable link + an access code, no account, ideally sessionless. We do NOT
  turn dashboards into that, and we do NOT rebuild review-links in GF-58.
  (Clarified by Martin 2026-06-24.)
- **Agent `agent_*` tokens are untouched** — Viktor/Hermes keep working exactly
  as today.

Built in phases so each merge to staging is safe. Phase 1 (this focus set) gets
real accounts + a login page working end-to-end and already kills the
switch-user pain.

## Decisions and API Contracts

### TASK-001: Lock the tenancy data model (agencies / clients / memberships)
status: todo
owner: martin
agent: claude
reviewer: codex
branch: none
area: decisions
estimate: S
depends_on: []
tags: [notion, gf-58, auth, schema, phase-1]
acceptance:
- Documented: `agencies` (name, slug, plan), `clients` gains `agency_id`, `memberships` (user, agency, role in owner|admin|member), platform-admin marked by a flag/role on the PB `users` record.
- Documented rule: a user sees every client whose `agency_id` is in one of their agency memberships; platform admins see all (replaces slug `*`).
- Decision recorded on whether per-client narrowing (`client_access`) is needed in Phase 1 — default NO (agency-wide membership only) to keep Phase 1 small.
notes:
- Source: GF-58 in Notion.
- Code evidence: `deploy-staging/api/src/routes/clients.ts:65` filters by `principal.slug === '*'`; `deploy-staging/api/src/auth.ts:22` `TokenPrincipal.slug`.
- Existing PB collections live under `deploy-staging/pb-migrations/` and `deploy-prod/pb-migrations/` (e.g. `*_created_clients.js`).

### TASK-002: Define the dashboard auth contract (login / me / logout + JWT)
status: todo
owner: martin
agent: claude
reviewer: codex
branch: none
area: decisions
estimate: S
depends_on: [TASK-001]
tags: [notion, gf-58, auth, api-contract, phase-1]
acceptance:
- Endpoints specified: `POST /auth/login {email,password} -> {token, expiresAt, user, role}`, `GET /auth/me`, `POST /auth/logout`. Token is a PocketBase auth JWT (or a thin wrapper over PB `authWithPassword`).
- Specified: the API's `requireAuth` accepts the new dashboard JWT in addition to `agent_*` and `dash_*`/bootstrap tokens, resolving it to a `TokenPrincipal` with the user's allowed agency/client scope.
- Specified: this is NOT the review-link `rev_*`/code pattern; review-links are unchanged.
notes:
- Source: GF-58 in Notion + Martin clarification 2026-06-24 (dashboards = accounts, not link+code).
- Code evidence: `deploy-staging/api/src/routes/authExchange.ts` (basicauth->dash_ exchange to be retired) and `app-v2/src/lib/api-client.ts:93` `ensureApiToken()`.

## Backend Implementation

### TASK-003: PB migration — agencies + memberships collections, agency_id on clients
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-58-auth-phase1
area: backend
estimate: M
depends_on: [TASK-001]
tags: [notion, gf-58, auth, pocketbase, phase-1]
acceptance:
- New PB migration creates `agencies` (name, slug unique, plan) and `memberships` (user relation, agency relation, role select owner|admin|member, unique on user+agency).
- `clients` collection gains an optional `agency_id` relation (nullable so existing rows/disk-only clients still load).
- Migration runs clean on a fresh staging PB and is idempotent; existing collections untouched.
- Seed: one `agencies` row for GF itself and memberships for Martin/Pilar as platform admins (or a `users.is_platform_admin` flag), so staging has a working admin.
notes:
- Code evidence: migration style in `deploy-staging/pb-migrations/1748400000_api_collections.js`.
- Disk-only clients have no PB row (`clients.ts:55` merges disk+PB); `agency_id` must be resolvable for those too — see TASK-005 note.

### TASK-004: API auth — verify PB JWT and resolve membership scope
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-58-auth-phase1
area: backend
estimate: M
depends_on: [TASK-002, TASK-003]
tags: [notion, gf-58, auth, api, phase-1]
acceptance:
- `requireAuth` (`deploy-staging/api/src/auth.ts`) recognises a dashboard JWT, validates it against PB, and builds a `TokenPrincipal` carrying the user id, role, and the set of agency ids the user belongs to (platform admin = all).
- `agent_*`, bootstrap, and existing `dash_*` ephemeral tokens keep working (no regression).
- Token kind is unambiguous (prefix or verified issuer); an invalid/expired JWT returns 401.
notes:
- Code evidence: `auth.ts:69` `lookupToken`, `auth.ts:108` `requireAuth`, `TokenPrincipal` at `auth.ts:22`.
- Extend `TokenPrincipal` with `agencyIds?: string[]` rather than overloading `slug`.

### TASK-005: Authorization — scope /clients and requireScope by membership (tenant isolation)
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-58-auth-phase1
area: backend
estimate: M
depends_on: [TASK-004]
tags: [notion, gf-58, auth, api, phase-2]
acceptance:
- `GET /clients` returns only clients whose `agency_id` is in the caller's agencies (platform admin = all); replaces the `principal.slug === '*'` filter.
- `requireScope` allows a slug only if that client's agency is in the caller's agencies (or platform admin); cross-agency access returns 403.
- A client with no `agency_id` (legacy/disk-only) is visible only to platform admins until assigned — documented + safe default.
notes:
- Code evidence: `clients.ts:65-69` filter; `auth.ts:122` `requireScope` currently compares `principal.slug`.

### TASK-006: Auth routes — login / me / logout backed by PocketBase
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-58-auth-phase1
area: backend
estimate: M
depends_on: [TASK-002, TASK-003]
tags: [notion, gf-58, auth, api, phase-1]
acceptance:
- `POST /auth/login` authenticates email+password via PB `authWithPassword`, returns the dashboard token + user + resolved role/scope.
- `GET /auth/me` returns the current user + their clients/role; `POST /auth/logout` invalidates client-side (and any server cache).
- Wrong credentials return 401 with a problem+json body; no user enumeration leak.
- The retired `GET /auth/exchange` (basicauth) is kept temporarily behind a flag or removed only in TASK-010, so staging isn't bricked mid-migration.
notes:
- Code evidence: `authExchange.ts` is the route being superseded; PB client helper in `deploy-staging/api/src/pb.ts` (`withPb`).

## Frontend Implementation

### TASK-007: Login page + JWT storage (replace basicauth exchange)
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-58-auth-phase1
area: frontend
estimate: M
depends_on: [TASK-006]
tags: [notion, gf-58, auth, ui, phase-1]
acceptance:
- A real login screen (email + password) calls `POST /auth/login`, stores the returned JWT, and routes into the dashboard.
- `api-client.ts` sends the stored JWT as `Authorization: Bearer`; a 401 redirects to login instead of trying a basicauth re-exchange.
- Refresh keeps the session (storage); no dependency on browser-cached basicauth.
notes:
- Code evidence: `app-v2/src/lib/api-client.ts:93` `ensureApiToken()` (basicauth exchange) and `:40` `STORAGE_KEY = 'mp.dashToken'` to be repurposed.

### TASK-008: Logout control + membership-scoped client switcher
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-58-auth-phase1
area: frontend
estimate: S
depends_on: [TASK-007]
tags: [notion, gf-58, auth, ui, phase-1]
acceptance:
- The client picker (`app-v2/src/routes/index.tsx` `ClientPicker`) renders the clients returned for the logged-in user; a logout control clears the JWT and returns to login.
- Switching clients no longer requires incognito/clearing browser credentials.
notes:
- Code evidence: `app-v2/src/routes/index.tsx` `ClientPicker` calls `loadClientIndex()`.

## Phase 3 — Team management (later)

### TASK-009: Invite-by-email + roles UI + agency provisioning
status: todo
owner: martin
agent: claude
reviewer: codex
branch: none
area: fullstack
estimate: L
depends_on: [TASK-005, TASK-008]
tags: [notion, gf-58, auth, admin, phase-3]
acceptance:
- Agency admin can invite a teammate by email, assign a role, and revoke access (PB email plumbing for invite/verify/reset).
- GF super-admin can create an agency and provision its first admin.
- Self-serve password reset works.
notes:
- Deferred until Phase 1+2 are on staging. Keep as an empty-ish lane until started.

## Deployment & Decommission

### TASK-010: Remove edge-Caddy basicauth; deploy to staging; migrate seed accounts
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-58-auth-phase1
area: deployment
estimate: M
depends_on: [TASK-005, TASK-007]
tags: [notion, gf-58, auth, deployment, phase-4]
acceptance:
- Edge `Caddyfile` per-client basicauth blocks on `/api/v1/auth/exchange` are removed (Caddy just reverse-proxies); authz lives in the API.
- Staging (`staging.marketing.gfinnov.com`) deploys green and login works against real accounts.
- A documented account-migration step replaces the shared passwords (`Logins.xlsx`) with individual accounts.
notes:
- Do this only after the login path is verified, so staging is never left unreachable.
- Edge Caddy config: `/opt/marketing-planner/Caddyfile` on the Hetzner box.

## Verification

### TASK-011: End-to-end verification on staging
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-58-auth-phase1
area: verification
estimate: S
depends_on: [TASK-007, TASK-005]
tags: [notion, gf-58, auth, verification, phase-1]
acceptance:
- Login as a platform admin → picker shows all clients; login as an agency-scoped user → only that agency's clients; cross-agency slug returns 403 (tenant isolation).
- Clean logout + switch without incognito.
- `agent_*` Viktor flows unaffected (smoke a read + a write via an agent token).
- API typecheck (`cd deploy-staging/api && npx tsc --noEmit`) and SPA build (`cd app-v2 && npx vite build`) pass.
notes:
- Cross-vendor review (independent-review) before merging to experimental.

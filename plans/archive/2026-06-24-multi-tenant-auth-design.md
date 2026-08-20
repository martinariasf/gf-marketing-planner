---
title: Multi-tenant auth & user management — design analysis
date: 2026-06-24
status: analysis (no direction chosen yet)
author: Martin Arias (with Claude)
---

# Multi-tenant auth & user management for marketing.gfinnov.com

## Context

The platform currently authenticates dashboard users with **HTTP basicauth at the
edge Caddy**, where the **username IS the client slug** (`gf-internal`,
`fitvibe-demo`, `biomas`), and admins are a hardcoded env list
(`AUTH_EXCHANGE_ADMINS = staging,martin,pilar` → token scope `*`).
See `deploy-staging/api/src/routes/authExchange.ts` and the edge
`/opt/marketing-planner/Caddyfile`.

The product is intended to serve **~10 marketing agencies × ~5 clients each ≈ 50
dashboards**. The current model does not scale to that.

## Why the current approach breaks at scale

- **Identity is the *client*, not the *person*.** Everyone on a client shares one
  password. No per-person accountability, revocation, or reset.
- **basicauth UX is structurally broken** — no logout, no "switch user",
  credentials cached per-browser forever (this caused the "I only see one
  dashboard" issue: the browser kept re-sending the cached per-client login
  instead of the admin login).
- **No agency/tenant layer.** Clients are a flat list; nothing isolates Agency A
  from Agency B except hand-edited Caddy blocks.
- **Provisioning is a server ritual:** SSH → `caddy hash-password` → edit
  Caddyfile → validate → reload. Untenable across 50 dashboards with rotating
  team members.
- **Secrets in a spreadsheet** (`Logins.xlsx`), handed out in chat. No MFA, no
  reset, no expiry, no audit.

## The standard B2B-SaaS model

Four primitives, independent of vendor:

1. **Person-based identity** — one account per human (email + password / magic
   link / OAuth). Never shared, never per-resource.
2. **Organizations = tenants** — the **Agency** is the org; the unit of isolation
   and billing.
3. **Workspaces/Projects inside an org** — the **Clients**.
4. **Memberships + RBAC** — user ↔ org with a role (owner/admin/editor/viewer),
   optionally narrowed to specific clients; access via **invite-by-email** +
   self-serve reset.

For GF this is a **three-tier tenancy**:

```
GF (platform / super-admin)
└── Agency  (the ~10 resellers — today GF itself is the only agency)
    └── Client / Workspace  (Biomas, FitVibe, gf-internal…)
        └── Users  (agency staff + optionally the end client, with roles)
```

### Data model (maps onto PocketBase)

| Collection | Key fields |
|---|---|
| `users` (PB built-in) | email, password, name |
| `agencies` | name, slug, plan |
| `clients` (exists) | **+ `agency_id`**, slug, name |
| `memberships` | user_id, agency_id, role (`owner`/`admin`/`member`) |
| `client_access` (optional) | user_id, client_id, role — only if finer grain than agency-wide is needed |
| platform admin | flag/role on the user (replaces `AUTH_EXCHANGE_ADMINS`) |

**Auth flow:** login (email/pw) → API validates the **PB JWT** → resolves
memberships → returns the clients that user may see → picker renders exactly
those. No basicauth, no slug-as-username, no `*` env hack. `agent_*` tokens stay
as they are.

## Build vs. buy (the model is identical either way)

**A — Build on PocketBase (already deployed).** PB ships email/password, OAuth,
email verification, password reset, JWT. Add `agencies` + `memberships` + RBAC +
a small management UI.
- ➕ No vendor cost across 50+ dashboards; you own the data (a selling point for
  German SMEs — data residency / GDPR). ➖ You build invites/roles/UI and own
  security maintenance.

**B — Buy WorkOS AuthKit / Clerk / Auth0.** Organizations + invites + RBAC + MFA +
SSO + drop-in React components out of the box.
- ➕ Fastest to enterprise-ready. ➖ Recurring per-MAU/per-org cost; identity with
  a vendor. Clerk = best DX; WorkOS = best if big clients will need SAML SSO.

**Recommendation:** Build the org/RBAC layer on PocketBase now, behind a clean
`AuthProvider` interface so a later swap to WorkOS (if an enterprise client needs
SAML) is contained. Remove the Caddy basicauth entirely. Professional model,
no vendor bill that scales with dashboard count, self-hosting stays an asset in
the German SME market.

## Migration path (phased, low-risk)

- **Phase 1 — Real accounts.** Add `agencies` + `memberships` to PB; new API
  middleware validates PB JWT → allowed slugs (leave `agent_*` untouched); SPA
  gets a real login page. *Kills the switch-user bug by itself.*
- **Phase 2 — Authorization.** `/clients` + `requireScope` check membership
  instead of `token.slug` / `AUTH_EXCHANGE_ADMINS`; enforce agency isolation;
  drop per-client basicauth blocks from Caddy (it just reverse-proxies).
- **Phase 3 — Team management UI.** Invite-by-email, role assignment,
  agency-admin self-service; GF super-admin creates agencies.
- **Phase 4 — Decommission.** Migrate shared passwords to individual accounts,
  delete `Logins.xlsx`, then optionally MFA / audit log / SSO.

## Decision

**Not chosen yet (2026-06-24).** Kept as analysis. When ready, pick a build-vs-buy
direction and a detailed implementation plan follows from Phase 1.

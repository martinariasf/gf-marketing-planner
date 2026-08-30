---
project: GF-108 Share links must show the PocketBase client name, never a drifted plan.json name or a raw slug
updated: 2026-08-30
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002]
default_group: item
items:
  - gf-108: Share links can show the WRONG company name - buildBrand reads plan.json on disk, not the PocketBase client record | priority: high
---

# Plan

## Decisions and API Contracts

No schema change, no PocketBase migration, no frontend change. The public
payload keeps its exact shape: `brand = {name, handle, logoInitials}`. Only the
values change, and only `name` can now be empty.

Resolution order, decided with Martin on 2026-08-30:

| field | 1st | 2nd | 3rd |
|---|---|---|---|
| `name` | PocketBase `clients.name` | `plan.json` `client.name` | **empty string** (never the slug) |
| `handle` | `plan.json` `client.handle` | `@<slug>` | - |
| `logoInitials` | PocketBase `clients.logoInitials` | `plan.json` `client.logoInitials` | `slug.slice(0,2).toUpperCase()` |

Why `name` alone loses its slug fallback: `app-v2/src/routes/review/strategy-view.tsx:229`
(shipped by GF-106) ALREADY falls back to `payload.link.title` when
`brand.name` is blank. That branch is unreachable today only because
`buildBrand` always returns the slug. Emptying the name activates a fallback
that already exists and is already translated — which is why acceptance
criterion 2 needs no frontend work.

`handle` keeps its slug fallback because PocketBase does not carry a handle
field at all (`ClientRecord`, `deploy-staging/api/src/routes/clients.ts:42`) and
the LinkedIn/Instagram mockups render it. Criterion 3 depends on this.

PB-wins-over-disk is the existing house convention, not a new one:
`clientList()` at `clients.ts:54` builds a disk map and then overwrites it with
PB records. This plan makes `buildBrand` agree with it.

Accepted consequence (confirmed with Martin): for a client with no name in PB
AND no name in `plan.json`, the channel mockup's company label renders blank.
The alternative — a second payload field so mockups keep a slug — widens the
public contract for a case that fires for zero clients today.

## Backend Implementation

### TASK-001: Resolve the review payload's brand name from PocketBase, with plan.json as fallback and no slug in the name
status: pending
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-108-brand-name
area: backend
estimate: S
depends_on: []
tags: [gf-108, api, review-link, bug]
acceptance:
- A share link for a client whose `plan.json` `client.name` differs from the PocketBase `clients.name` returns the PocketBase name in `brand.name`.
- A client with no name in PocketBase falls back to the `plan.json` name.
- A client with a name in neither returns `brand.name === ''` - the slug never appears in `brand.name`.
- `brand.handle` still resolves `plan.json` `client.handle` then `@<slug>`; a client with no handle anywhere still gets `@<slug>`.
- `brand.logoInitials` still resolves to a non-empty value for every client (PB, then plan.json, then the 2-letter slug prefix).
- A PocketBase outage or a missing client record does not fail the request: `buildBrand` still returns a well-formed brand from disk, exactly as the current `try/catch` does.
- The public payload object shape is unchanged - no field added, none removed.
- A pure unit test in `deploy-staging/api/` covers the whole resolution table above, including the both-missing case and the PB-throws case.
- `npx tsc --noEmit` passes in `deploy-staging/api/`; `npm test` passes with the new test included.
notes:
- Source: GF-108 in Notion (page 3c2ae4b1-247e-81f5-ba3a-f4152a49eb94), status
  "In progress", Tier MEDIUM. Read the item body for the live evidence.
- Current code is `buildBrand(slug)` at
  `deploy-staging/api/src/routes/reviewPublic.ts:82-103`. It builds a `fallback`
  object seeded entirely from the slug, reads `disk.plan(slug)`, and returns
  each field with the plan value or the slug fallback. Its single call site is
  line 176, inside the `Promise.all` in `buildReviewPayload`.
- **Split pure from impure.** Put the resolution table in a pure exported
  function in `deploy-staging/api/src/reviewLib.ts` - signature
  `resolveBrand(args: {slug: string, pbClient: {name?: unknown, logoInitials?: unknown} | null, planClient: Record<string, unknown> | null}): {name: string, handle: string, logoInitials: string}`.
  `buildBrand` in `reviewPublic.ts` keeps ONLY the two I/O calls (`withPb` and
  `disk.plan`) and delegates. This is what makes criterion 5 a real unit test
  rather than another source-regex assertion.
- Why that matters: the tests in `src/routes/*.test.ts` assert on file TEXT
  (`readFileSync` + `assert.match`) precisely because those routes need a live
  PocketBase and a minted access code to invoke. Do NOT add another regex test
  here - `reviewLib.strategy.test.ts` is the precedent for real unit tests of
  pure helpers, and `resolveBrand` is pure by construction.
- Fetch the PB record with the existing by-slug pattern from
  `deploy-staging/api/src/tenancy.ts:44-46`:
  `await withPb((pb) => pb.collection('clients').getFirstListItem<{name?: string, logoInitials?: string}>(\`slug="${slug}"\`))`,
  wrapped in its own `try/catch` that yields `null`. A missing record throws a
  404 in the PocketBase SDK - that is the normal path for a disk-only client,
  not an error to surface.
- Both lookups are independent: run them as one `Promise.all` inside
  `buildBrand` so the review payload does not serialise two round trips. The
  outer `Promise.all` at line 176 already runs `buildBrand` alongside three
  other loaders; do not add a fourth top-level entry.
- Treat whitespace as absent: trim before the truthiness check at every level,
  so a `plan.json` name of `"  "` falls through instead of rendering a blank H1
  with no link-title fallback.
- `withPb` is already imported in `reviewPublic.ts` (line 19). No new dependency.
- Do NOT touch `app-v2/`. The link-title fallback at `strategy-view.tsx:229`
  already handles the empty name and is covered by criterion 2 as-is.
- New test file: `deploy-staging/api/src/reviewLib.brand.test.ts`, `node:test` +
  `assert/strict`, matching the style of `reviewLib.strategy.test.ts`. It is
  picked up automatically by the `src/**/*.test.ts` glob in `package.json:12`.
- Changelog: this is user-visible (an external reviewer sees a different name),
  so add an entry at the TOP of `app-v2/src/lib/changelog.ts` dated the staging
  deploy date.

### TASK-002: Audit every production client for plan.json / PocketBase name drift and correct what is found
status: pending
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-108-brand-name
area: ops
estimate: XS
depends_on: [TASK-001]
tags: [gf-108, ops, prod, data]
acceptance:
- For every client on the production box, the `client.name` in `clients/<slug>/plan.json` is compared against the `name` on the PocketBase `clients` record for the same slug, and the full comparison is reported (slug, disk name, PB name, match yes/no).
- Every mismatch found is either corrected on disk or explicitly recorded as intentional, with the decision named.
- The same comparison is run and reported for staging, where `staging-demo` is the known-drifted case from the GF-106 test.
- No production data is written without Martin's explicit go-ahead on the specific change.
notes:
- This is acceptance criterion 4 of the Notion item, and the item states it is a
  PREREQUISITE for promoting GF-106 to prod. It is ops work on the box, not a
  code change - hence a separate task, and it does not gate the TASK-001 merge.
- After TASK-001 the drift stops being client-facing (PB wins), so this task is
  now hygiene rather than a live fix. Keep it: a wrong name on disk is still
  wrong, and it still surfaces anywhere disk is read without a PB override.
- Read-only first. Produce the comparison table, show it to Martin, and only
  then touch any file. Corrections are edits to `clients/<slug>/plan.json` on
  the box; the file is client data, not repo source, so this is one of the few
  legitimate on-box edits.
- Prod PocketBase admin UI is not proxied - reach it over the SSH tunnel
  (prod 8091, staging 8090). See the "PB Admin UI" note.

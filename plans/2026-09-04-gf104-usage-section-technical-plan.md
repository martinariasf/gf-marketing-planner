---
project: GF-104 Client usage section
updated: 2026-09-04
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007]
items:
  - gf-104: Agregar una seccion de uso, mostrando cuando se gasto en imagenes, cuanto en videos y asi | priority: high
---

# Plan

## Simple Words

A client opens **Configuration** and sees one new card at the top: two bars —
how much of today's cap and how much of this month's allowance they have used —
and a pie splitting the last 30 days of activity into writing/editing, image
generation and video generation. There is no "unused" slice in the pie; the
unused portion is what the bars show as not yet filled.

No money is ever shown to the client. Only percentages.

The numbers are real, not estimates: the percentage comes from what OpenRouter
has actually billed against that client's key this calendar month, measured
against a monthly budget (a "guardrail") that Martin sets in OpenRouter. The
split comes from OpenRouter's own per-model activity data.

The client's existing **daily** cap is untouched. The monthly guardrail is a
second, independent layer — so from now on each client has both a daily brake
and a monthly allowance.

Not in this task: charging for overage, warning emails when a client nears the
limit, any history/trend view, and any per-client enforcement changes. Those
stay in GF-56.

## Decisions and API Contracts

Verified live against the OpenRouter account on 2026-09-04 with the management
key. All four data sources return 200 and carry the fields below.

| Need | Call | Field |
|---|---|---|
| Spend this calendar month | `GET /api/v1/keys/{hash}` | `usage_monthly` |
| Monthly allowance | `GET /api/v1/guardrails/{id}` | `limit_usd`, `reset_interval` |
| Category split | `GET /api/v1/activity?api_key_hash={hash}` | rows of `date`, `model`, `usage` |

Decisions taken during Phase 2, recorded here because they narrow the Notion
item (which had an empty body):

1. **Client-facing, percentages only.** No EUR/USD figure reaches the SPA — the
   API returns percentages and category shares, never raw `usage_monthly` or
   `limit_usd`. This is a contract, not a UI choice: if the numbers never leave
   the server, a future UI change cannot leak GF's cost base.
2. **Denominator is the guardrail, not a typed-in number.** Martin chose the real
   enforced limit over a configured allowance, so the bar cannot drift from
   reality.
3. **Daily key limits stay as they are (revised — now also surfaced).** `limit_reset=daily`
   on all four client keys is the runaway brake and enforcement is not part of
   this task. As shipped, the card also renders a second, independent daily
   bar (`percentUsedDaily`/`hasDailyLimit`) read straight off the key's own
   `usage_daily`/`limit`/`limit_reset` fields — no guardrail lookup needed —
   so the client sees both brakes, even though only the monthly one gained
   new enforcement.
4. **The key/guardrail link is stored per client**, because OpenRouter exposes no
   way to read which guardrail applies to a key: `GET /keys/{hash}` has no
   guardrail field, and every guessed assignment path (`/guardrails/{id}/keys`,
   `/assignments`, `/api-keys`, `/members`, `/keys/{hash}/guardrails`) returns
   404. Only the *link* is local; both numbers stay live in OpenRouter.
5. **Two windows, deliberately (revised 2026-09-05).** The bar uses
   `usage_monthly` — the exact calendar month. The pie uses the full 30-day
   `/activity` window and is labelled "last 30 days".
   Originally both used the calendar month, for coherence. Real data killed
   that: on 2026-09-05 only `kimi-k3` had rows in the current month while every
   image, video and Opus row was from August, so the pie would have read
   ~100% writing / 0% image / 0% video for roughly the first week of every
   month — useless for the exact question GF-104 asks. Martin chose the wider
   window with an explicit label over a coherent-but-empty chart.
   Consequence: `categories` are pure shares summing to 1 and are NOT scaled by
   `percentUsed` (scaling a 30-day share by a month fraction is meaningless),
   so there is no "unused" slice in the pie. The unused portion is the bar's
   remainder only.
6. **Key hash / guardrail id are server-side config, not client-editable
   (supersedes TASK-003 below).** As shipped, `resolveOpenRouterClient(slug)`
   in `deploy-staging/api/src/env.ts` reads the mapping from a single
   server-side env var, `OPENROUTER_CLIENTS_JSON` (a JSON object of
   `slug -> { keyHash, guardrailId }`), parsed once at process start —
   Martin sets it on deploy. This replaced the originally-planned
   `OrgSettings.openrouterKeyHash` / `openrouterGuardrailId` fields (TASK-003)
   before ship: those two ids never lived in client-editable
   `org_configs.settings`, or on the Integration page, at all. `resolveOpenRouterClient`
   returns `undefined` for an unconfigured or unrecognized slug, which the
   `/usage` route treats as `{ configured: false }`.

### TASK-001: Add the OpenRouter usage client and model-to-category map
status: todo
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-104-usage-section
area: backend
estimate: M
depends_on: []
tags: [gf-104, api, openrouter]
acceptance:
- A new module exports one function that, given a key hash and guardrail id, returns `{ percentUsed, categories: { writing, image, video, audio }, hasLimit }` with all values as fractions 0..1.
- No raw USD amount appears in the returned object; a unit test asserts the returned JSON contains no `usage_monthly`, `limit_usd` or `usage` key.
- Model-to-category mapping is a table keyed by substring, covering the four models seen live: `moonshotai/kimi-k3` and `anthropic/claude-opus-4.8` map to writing, `google/gemini-3.1-flash-image-preview` to image, `bytedance/seedance-2.0` to video.
- An unmapped model falls into writing (the dominant category) and logs its id once, so a new model shows up in logs rather than silently vanishing from the pie.
- `reset_interval` other than `monthly` on the guardrail is treated as no limit (`hasLimit: false`) rather than producing a wrong percentage.
- Unit tests run against recorded fixtures, not the network; `npx tsc --noEmit` and the API test suite pass.
notes:
- Source: GF-104 in Notion (body was empty; the contract above came from Phase 2 with Martin).
- New file: `deploy-staging/api/src/usage.ts`, tests in `deploy-staging/api/src/usage.test.ts`.
- Fixtures: capture one real `/activity` response and one `/keys/{hash}` response, strip the key `label` field (it contains a truncated secret) before committing.
- The management key is read from a new env var in `deploy-staging/api/src/env.ts`, following the existing pattern there. It is SERVER-SIDE ONLY and must never be added to any `VITE_` variable.
- Category shares are computed as a pure share of the last-30-days `/activity` window's total usage (see Decision 5, revised 2026-09-05) and are NOT scaled by `percentUsed` — the pie and the bar deliberately cover different windows, so there is no "unused" slice in the pie; the unused portion is conveyed by the bar alone.
- Also computes a second, independent figure off the same key read: `percentUsedDaily` / `hasDailyLimit`, from the key's own `usage_daily`/`limit`/`limit_reset` fields (no guardrail lookup needed — every client key already carries its own daily cap). `hasDailyLimit` is false whenever `limit_reset !== 'daily'` or either daily field is non-numeric (the latter degrades gracefully rather than throwing; only the monthly path's non-numeric case throws).

### TASK-002: Expose GET /clients/:slug/usage on the API
status: todo
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-104-usage-section
area: backend
estimate: S
depends_on: [TASK-001]
tags: [gf-104, api]
acceptance:
- `GET /api/v1/clients/:slug/usage` returns the TASK-001 shape for a caller scoped to that client, and 403 for a caller scoped to a different client.
- A client with no `openrouterKeyHash` configured returns 200 with `{ configured: false }` rather than an error, so the card can hide itself.
- An OpenRouter outage or non-200 returns `{ configured: true, unavailable: true }` and never a 500 — the Configuration page must not break because a third party is down.
- Responses are cached in-process for 5 minutes per slug, so opening the page repeatedly does not hammer OpenRouter.
- The route appears in the OpenAPI document.
notes:
- Add to `deploy-staging/api/src/routes/planningConfig.ts` (already holds the per-client config routes and the `requireScope()` pattern) or a sibling route file if that file is getting long.
- Auth: reuse `requireAuth` + `requireScope()` exactly as the neighbouring routes do; do not invent a new guard.
- As shipped: read the key hash / guardrail id via `resolveOpenRouterClient(slug)` in `deploy-staging/api/src/env.ts` (server-side `OPENROUTER_CLIENTS_JSON` env map) — see Decision 6, which supersedes TASK-003's `loadOrgSettings` plan.

### TASK-003: Store the key hash and guardrail id per client
status: superseded — see Decision 6 (OPENROUTER_CLIENTS_JSON shipped instead of OrgSettings fields)
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-104-usage-section
area: backend
estimate: S
depends_on: []
tags: [gf-104, config]
acceptance:
- `OrgSettings` gains `openrouterKeyHash?: string` and `openrouterGuardrailId?: string`, both defaulting to undefined, coerced as strings in `coerce()`.
- Existing clients with neither field set continue to load with the current defaults and no error (the `loadOrgSettings` fallback path is unchanged).
- Both fields are editable on the Integration page, not the Configuration page.
- The key hash is not a secret (it is a SHA-256 hash, not the key) but is still only returned to callers scoped to that client.
notes:
- Edit `deploy-staging/api/src/orgSettings.ts` — the `OrgSettings` type, `DEFAULTS`, and `coerce()`.
- Integration page is the right home: `configuration.tsx:1-5` states Configuration is dashboard-user-facing while Integration is developer/credential-facing. These two ids are credential-adjacent plumbing, not a client setting.
- Frontend edit surface: `app-v2/src/routes/client/integration.tsx`.

## Frontend Implementation

### TASK-004: Build the usage card on the Configuration page
status: todo
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-104-usage-section
area: frontend
estimate: M
depends_on: [TASK-002]
tags: [gf-104, ui, dashboard]
acceptance:
- A card renders at the TOP of the Configuration page, above the two existing ToggleCards.
- The card shows a horizontal progress bar labelled with a percentage, and a recharts pie with one slice per non-zero category. There is NO "unused" slice: after Martin's 2026-09-05 decision the pie covers the last 30 days while the bar covers the calendar month, so an allowance-derived slice cannot live in the pie. The unused portion is conveyed by the bar alone.
- A category with zero usage does not render a slice or a legend entry (so "audio" stays invisible until a TTS model is actually used).
- No currency symbol or monetary amount appears anywhere in the card.
- `configured: false` hides the card entirely; `unavailable: true` renders the card frame with a short "usage data unavailable" line instead of the chart.
- `hasLimit: false` renders the pie but not the bar, with a line saying no monthly allowance is set.
- `npx tsc -b` and `npx vite build` pass; eslint is clean on changed files.
notes:
- Edit `app-v2/src/routes/client/configuration.tsx`; put the card in its own component file rather than inlining ~150 lines into a 134-line page.
- recharts 3.8.1 is already a dependency (`app-v2/package.json:24`) and is used in `app-v2/src/routes/client/performance.tsx` — reuse its `PieChart`/`Pie`/`Cell` import style and the `Card`/`CardContent` primitives already imported by configuration.tsx.
- Colours come from `@/lib/brand` (`BRAND`), as performance.tsx does; do not hardcode hex values.
- Follow the existing `isApiEnabled` guard pattern in configuration.tsx — the card must degrade cleanly in non-API mode.

### TASK-005: Add EN/DE/ES strings for the usage card
status: todo
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-104-usage-section
area: frontend
estimate: XS
depends_on: [TASK-004]
tags: [gf-104, i18n]
acceptance:
- Every visible string in the card comes from `useT()`; no literal English in the component.
- Keys exist in all three locales with no missing-key fallback warnings in the console.
- Category labels read as plain client language ("Writing & editing", "Image generation", "Video generation"), never model or provider names. There is no "Unused" category label — per Decision 5 (revised 2026-09-05) the pie has no unused slice; the unused allowance is conveyed only by the bar's remainder.
notes:
- Follow the `config.*` key namespace already used in configuration.tsx; add a `usage.*` group.
- Pilar reviews the ES/DE wording before prod promotion, not before staging merge.

## Verification

### TASK-006: Verify on live staging
status: todo
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-104-usage-section
area: verification
estimate: S
depends_on: [TASK-004, TASK-005]
tags: [gf-104, staging]
acceptance:
- Staging bundle is in API mode and `/api/v1/health` reports `pb:"up"`.
- Configuration page for the staging-demo client shows the card with real numbers, and the bar percentage matches `usage_monthly / limit_usd` computed independently from the OpenRouter API.
- A client with no key hash configured shows no card (checked on a second client).
- Category shares sum to 100% (pure shares of the last-30-days activity window; no unused slice — see Decision 5, revised 2026-09-05).
- The daily bar (`percentUsedDaily`/`hasDailyLimit`) reflects the key's own daily cap independently of the monthly guardrail.
- Browser console is free of errors on the Configuration page.
notes:
- Requires TASK-007 to have set a guardrail on the staging key first, otherwise `hasLimit` is false and the bar cannot be verified.
- Read path only; this task creates no data, so no cleanup is needed.

### TASK-007: Create and assign monthly guardrails per client
status: blocked
owner: martin
agent: human
reviewer: human
branch: none
area: decisions
estimate: XS
depends_on: []
tags: [gf-104, openrouter, human]
acceptance:
- Each client agent key (Viktor Main GF, Viktor Staging, Viktor Biomas, BVF) has a guardrail assigned with `reset_interval: monthly` and a deliberate `limit_usd`.
- The guardrail id and the key hash for each client are recorded so TASK-003 can be filled in.
- The temporary "Max 100" probe guardrail is either reused or deleted.
notes:
- Must be done by Martin in the OpenRouter dashboard: the auto-mode classifier blocks Claude from POSTing to the OpenRouter account, and this sets real spending caps on production client agents.
- Sizing input from live data (30-day usage): Viktor Main GF ~45 USD, so a monthly guardrail well above that. Biomas, BVF and Staging are much smaller.
- This is the only task on the critical path that Claude cannot do.

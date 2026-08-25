---
project: GF-113 — Performance tab: real numbers from the Postiz analytics API + restructure
updated: 2026-08-24
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
default_group: item
focus_tasks: [TASK-001, TASK-016, TASK-018, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009, TASK-010, TASK-011, TASK-012, TASK-013, TASK-017, TASK-014, TASK-015]
items:
  - gf-113: Performance tab — real numbers from the Postiz analytics API + restructure | priority: high
  - gf-112: Strategy tab — make it functional (not just an editable document) | priority: medium
---

# Plan

## Simple Words

Today the Performance tab is a stage set. Every number on it — reach, saves,
clicks, DMs, the weekly reach chart, the "top performers" cards — is read from a
hand-written file (`performance.json`) that says `"source": "manual"`. Nothing on
that page has ever touched a social network. Real clients don't even have the
file, so they open the tab and see an empty box.

This plan makes the tab tell the truth. Postiz — the tool we already use to
schedule and publish — has an analytics API. It can tell us, per connected
channel, how followers and impressions moved day by day, and per published post,
how many likes, comments, shares and impressions it got. It can also tell us
which of our posts actually went live and give us the real public link to it.

So: the server (never the browser) asks Postiz for those numbers on a schedule,
stores them, and the Performance tab shows them, with a visible "last updated"
stamp and a Refresh button. Every metric says where it came from. If a client has
no Postiz key, or a key but no connected channel, the tab says exactly that
instead of showing zeros.

Two things get deleted. The **Google Analytics card** — it announces that web
analytics isn't connected and then shows two invented numbers underneath — goes
away entirely. And the **weekly wins/losses summary**, which is Viktor's prose
rather than a measurement, goes away too.

One correction to flag up front: that wins/losses block does **not** live on the
Performance tab — it renders on the **Goals** tab
(`app-v2/src/routes/client/goals.tsx:897`). Removing it is a Goals-tab change.
Same for the goal progress bars: the Goals tab reads its "actual" numbers from
the same mock `performance.json`. If we stop serving mock data, the Goals tab
loses its actuals unless we handle it — TASK-011 handles it.

One thing this plan has to settle before building: **we already designed this
once.** Two Viktor agent skills exist in the repo — `sync-postiz-analytics` and
`weekly-summary` — that describe exactly this loop. Both say "Not yet deployed.
Spec only", neither is installed on any box, and both assume an architecture we
have since abandoned (client files on disk, committed to git). Their guessed
Postiz endpoint is also wrong. So the choice is: does the API server pull the
numbers, or does Viktor? This plan says the API server, and TASK-016 records why.

Not in scope: anything Meta-side - that is all GF-21 now, both Meta Ads and
per-post insights via the Meta Graph API (decided 2026-08-24; see TASK-018).
Also out: Google Analytics or any website analytics, follower demographics,
competitor data, and any AI-written commentary on the numbers. This plan puts real measurements on the page. Interpreting them
is a later item.

## Verified Postiz API surface (docs.postiz.com, checked 2026-08-24)

Base URL for us: `https://api.postiz.com/public/v1` (Postiz **Cloud** — Martin
confirmed 2026-08-24 that the paid cloud account holds the connected channels,
not the self-hosted `postiz.gfinnov.com`). `POSTIZ_API_BASE` in
`deploy-staging/.env.example:26` already points there. Auth is the raw API key in
the `Authorization` header (no `Bearer` prefix) — same key already stored
encrypted per client in `integration_secrets.postizApiKeyEnc`.

| Method | Path | Returns | Request cost |
|---|---|---|---|
| GET | `/integrations` (optional `?group=`) | channel list: `id`, `name`, `identifier` (platform, e.g. `instagram`), `picture`, `profile`, `disabled`, `customer{id,name}` | 1 per client |
| GET | `/analytics/{integrationId}?date=N` | per-channel series: `[{ label, data:[{ total, date }], percentageChange }]` — labels vary by platform (Followers/Impressions on X; Subscribers/Views on YouTube) | 1 **per channel** |
| GET | `/analytics/post/{postId}?date=N` | per-post series, same shape (Likes, Comments, Impressions, …). Published posts only — drafts/queued return nothing | 1 **per post** |
| GET | `/posts?startDate=&endDate=&customer=` | posts in window with `id`, `content`, `publishDate`, `state` (`QUEUE`/`PUBLISHED`/`ERROR`/`DRAFT`), `releaseURL`, `integration{id,providerIdentifier,name,picture}` | 1 per window |
| POST/DELETE | `/posts`, `/posts/{id}`, `/upload` | already used by the scheduling adapter | — |

Three properties of this API drive the whole design:

1. **`{integration}` must be the integration UUID**, never the platform name or
   channel display name — otherwise `400 Invalid integration`. We currently store
   channel *names* (`instagram`, `linkedin`) on posts. There is no name→id map
   anywhere in our code. This is the same gap GF-26 hit; it must be built here.
2. **Metric labels are platform-dependent and returned as strings.** Our fixed
   nine-metric `PostMetrics` type cannot model this. The UI has to render whatever
   labels come back, not a hard-coded list.
3. **Rate limits are low and the docs contradict themselves** — one page says 30
   requests/hour, another says 90/hour (100 cloud) applying only to post creation.
   Per-post analytics costs one request per post, so a client with 40 published
   posts cannot be refreshed on page load under either reading. Everything must be
   cached server-side and synced in the background. TASK-001 settles the real
   number empirically before we tune the cadence.

## Probe results — measured against live Postiz Cloud, 2026-08-24

Run with `plans/spikes/probe-postiz.ps1` against the production GF account.
**These measurements override the documentation wherever they disagree, and they
disagree in several places.**

### What is connected

Two enabled channels, ids are **cuid-style, not UUIDs** as the docs claim:

| id | identifier | name | profile |
|---|---|---|---|
| `cmp2usehl00nvly0yy16yp0vc` | `instagram-standalone` | GF Innovative Solutions | gfinnovative |
| `cmrme231601lzn60yt4un8udo` | `linkedin` | Pilar Arias | pilar-arias |

Note `instagram-standalone`, **not** `instagram`. This is a direct GF-26 finding:
`toPostizPayload` gates its Instagram settings block on
`channels.includes('instagram')` and sends `__type: 'instagram'`, but the live
integration identifier and the `settings` blob on real published posts are both
`instagram-standalone`. Record this on GF-26.

### `GET /analytics/{integrationId}?date=30` — works, but not as documented

Instagram returned seven labels. **`total` is a number, not the string the docs
show.** Crucially the shape is not uniform:

| label | data points | meaning |
|---|---|---|
| Reach | 29 | a real daily time series |
| Likes, Views, Comments, Shares, Saves, Replies | 1 each, dated today | a single window-total snapshot, not a series |

`percentageChange` was **exactly `5` on every one of the seven labels** — that is
a placeholder or a Postiz bug, not a real calculation. Do not display it.

LinkedIn returned `[]`. Empty, 200, no error. Per-platform coverage is uneven and
the UI must handle a connected channel that yields nothing.

### `GET /analytics/post/{postId}` — exists, returns nothing

**This is the finding that reshapes the plan.** Tested three ways:

| case | window | result |
|---|---|---|
| post published 2026-08-05 (19 days old) | `date=30` | `200 []` |
| same post | `date=90` | `200 []` |
| post published 2026-06-24 | `date=90` | `200 []` |

Always `200`, always an empty array. Per-post analytics is not available through
Postiz for this account. It is not a window problem and not an error.

### `GET /posts?startDate=&endDate=` — works perfectly

Returns `{ "posts": [...] }` — **wrapped in an object, not a bare array.** Six
posts in the 90-day window, all `PUBLISHED`, all with a real `releaseURL`
(e.g. `https://www.instagram.com/p/DZ-Q8yzmuMl/`). Each entry carries `id`,
`content`, `publishDate`, `releaseURL`, `releaseId`, `state`, `settings`, `tags`,
`group`, `creationMethod`, and `integration{id,providerIdentifier,name,picture}`.

`releaseId` on the Instagram post was `18414871717179534` — that is the Instagram
**media id**, which is the join key the Meta Graph API needs for per-post
insights. That is the only visible route to per-post metrics (see TASK-018).

### Rate limits

**No rate-limit headers were returned on any response** — no `X-RateLimit-*`, no
`Retry-After`. We cannot self-regulate from headers, so the sync budget must stay
conservative by construction. The docs' 30-vs-90 contradiction remains unresolved
and untestable without deliberately tripping a 429 on the production account,
which is not worth doing.

The negative control (`/analytics/instagram?date=7`, a platform name instead of an
id) returned **500**, not the documented 400.

### What this means

Buildable from Postiz today: channel-level trends (Instagram only), the published
-state and live-URL reconciliation, and the channel health strip.
**Not buildable from Postiz: per-post metrics.** TASK-010 is re-cut accordingly
and TASK-018 records the decision about where per-post data could come from.

## Decisions and API Contracts

### TASK-001: Probe the live Postiz Cloud API and record the verified contract
status: done
owner: martin
agent: claude
reviewer: human
branch: none
area: decisions
estimate: S
depends_on: []
tags: [gf-113, postiz, analytics, spike]
acceptance:
- A probe script under `plans/spikes/` hits `/integrations`, `/analytics/{id}?date=30`, `/analytics/post/{id}?date=30` and `/posts?startDate=&endDate=` against Postiz Cloud with a real client key, and its real (redacted) responses are pasted into this plan.
- The actual rate-limit headers / 429 behaviour are recorded, resolving the 30-vs-90 requests-per-hour contradiction in the docs.
- It is recorded whether `analytics/post/{postId}` accepts the Postiz post id we already store as `publishing.providerJobId`, or needs some other id.
- The exact metric `label` strings returned per connected platform are listed, so the i18n copy in TASK-012 can be written against real labels instead of guesses.
- If a connected channel returns an empty array, that is recorded as the expected "no data yet" shape.
notes:
- Source: GF-113 in Notion. This is Martin's "validate the links with the API from Postiz" ask, done first because every later task depends on the answers.
- BLOCKED on one thing only: Martin sets `POSTIZ_PROBE_KEY` as a local Windows user environment variable holding a live Postiz Cloud key (decided 2026-08-24). The probe script reads it from the environment. The key never enters the chat transcript, the repo, or the plan.
- The per-client keys encrypted in PocketBase (`integration_secrets.postizApiKeyEnc`) are NOT to be decrypted to work around this.
- DONE 2026-08-24. Martin supplied the key via `POSTIZ_PROBE_KEY`; the probe ran GET-only against the production account. Full results in the "Probe results" section above. Script: `plans/spikes/probe-postiz.ps1`.
- Headline: per-post analytics returns an empty array for every published post at every window, so the per-post metrics table cannot be built from Postiz. Channel trends, published-state reconciliation and live URLs all work.
- Correction to prior belief: the memory note "0 channels connected" was about the *self-hosted* instance. Postiz **Cloud** has two enabled channels (Instagram + LinkedIn).
- Code evidence: `deploy-staging/api/src/scheduling/postiz.ts:29` sets `POSTIZ_API_BASE`; `loadPostizApiKey()` at line 36 is the existing decrypt path the probe should mirror.
- Do not implement TASK-003 from the docs alone. GF-26 shipped a wrong payload shape from exactly that mistake.

### TASK-016: Decide who owns the analytics sync — the API server or Viktor
status: done
owner: martin
agent: claude
reviewer: human
branch: none
area: decisions
estimate: S
depends_on: []
tags: [gf-113, decisions, agent, architecture]
acceptance:
- DECIDED 2026-08-24 by Martin — **the API server owns the Postiz analytics pull. Viktor never writes analytics data.**
- TASK-017 retires the two stale skill specs so nobody installs them later and creates a second, conflicting writer.
- Viktor keeps only the read-side Telegram value: the on-demand digest and the "quarterly goal behind by more than 20%" alert, implemented as a thin skill that calls `POST /clients/:slug/analytics/sync` and reads the result back.
- Exactly one component writes analytics data.
notes:
- Discovered mid-planning: `agent-skills/core/sync-postiz-analytics/SKILL.md` already specifies this whole loop for Viktor (daily 06:00 UTC + "sync metrics" on Telegram), and `agent-skills/core/weekly-summary/SKILL.md` specifies the Monday digest that writes `performance.weeklySummary`.
- Both are explicitly marked "Not yet deployed. Spec only." and `find` over `deploy/`, `deploy-staging/` and `deploy-prod/` returns nothing for either — no live behaviour depends on them today.
- Recommendation: the API server. (a) The skill assumes `/opt/marketing-planner/clients/<slug>/` files committed with `git push`; the platform moved to SPA -> REST API -> PocketBase and that layout is gone. (b) The per-client Postiz key is encrypted in `integration_secrets` and is only decryptable server-side — Viktor would need a second credential path. (c) The API already has the worker precedent (`agentJobs.ts`), the rate limiter and the audit log. (d) Analytics keep updating even when the agent is down.
- Worth preserving from the skill spec even under API ownership: the Telegram digest on demand, and the "alert when a quarterly goal is behind by more than 20%" rule. Those become a thin Viktor skill that calls `POST /clients/:slug/analytics/sync` and reads the result — not a second writer.
- The skill's guessed endpoint `GET {POSTIZ_BASE}/api/posts/{jobId}/analytics` returning a flat `metrics` object does not exist. The real one is `GET /public/v1/analytics/post/{postId}?date=N` returning a label-driven array. Installing that skill as written would have failed exactly the way GF-26 failed — from a guessed contract.

### TASK-017: Retire the two stale spec-only Viktor analytics skills
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: agent
estimate: S
depends_on: [TASK-016]
tags: [gf-113, agent, cleanup]
acceptance:
- `agent-skills/core/sync-postiz-analytics/SKILL.md` is either deleted or rewritten as a thin trigger that calls the API's sync endpoint and reports on Telegram — it no longer describes Viktor writing `performance.json` or committing to git.
- `agent-skills/core/weekly-summary/SKILL.md` is reconciled with TASK-011: if the weekly wins/losses block is removed from the dashboard, the skill either stops writing `weeklySummary` or is retired, so Viktor is not producing output nothing renders.
- No remaining skill file instructs Viktor to write `performance.json`.
- The wrong Postiz endpoint shape is gone from the repo so it cannot be copied into a future implementation.
notes:
- Code evidence: `agent-skills/core/sync-postiz-analytics/SKILL.md` and `agent-skills/core/weekly-summary/SKILL.md`. Neither is deployed, so this is documentation cleanup, not a live agent change.
- Known trap from the agent internals: a skill file sitting in the tree can still get picked up by a later sync even when it looks dormant. Delete or fix it; do not just leave it marked "spec only".

### TASK-002: Define the normalized analytics contract between API and SPA
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: decisions
estimate: S
depends_on: [TASK-001]
tags: [gf-113, analytics, api-contract]
acceptance:
- A new `ClientAnalytics` shape is written down (in `deploy-staging/api/src/schemas/analytics.ts` as a zod schema, mirrored in `app-v2/src/types/analytics.ts`) and covers: `syncedAt`, `provider`, `status` (`ok` | `no_key` | `no_channels` | `stale` | `error`), `channels[]`, `series[]`, `posts[]`.
- Metric series are modelled as `{ label: string, kind: 'series' | 'snapshot', points: [{ date, total: number }] }` — label-driven, not a fixed metric enum, because Postiz returns different labels per platform. `total` is typed as a **number**: the probe showed the docs' string example is wrong.
- The `kind` discriminator is required by the measured data: Reach came back as 29 daily points while Likes/Views/Comments/Shares/Saves/Replies came back as a single point dated today. A chart must not try to plot a one-point snapshot as a trend.
- `percentageChange` is **not** carried into our contract. The probe returned exactly `5` for all seven Instagram labels, which makes it a placeholder rather than a computed value. If a delta is ever shown, we compute it ourselves from the points we hold.
- The `/posts` response is unwrapped from its `{ posts: [...] }` envelope at the adapter boundary, not in the SPA.
- Each `posts[]` entry carries our post id, the Postiz post id, `state`, `releaseURL`, the `integrationId`, and its own label-driven series.
- The contract explicitly allows a partially-successful sync: one channel failing does not blank the others.
- The old `Performance` type in `app-v2/src/types/performance.ts` is marked deprecated in a comment, with the tabs still reading it until TASK-011 lands.
acceptance_note: The SPA never receives the Postiz API key in any field.
notes:
- Code evidence: `app-v2/src/types/performance.ts` is the current shape — fixed nine metrics keyed by our post id, plus `aggregates`, `vsGoals`, `weeklySummary`.
- Latent bug worth killing here: `app-v2/src/routes/client/performance.tsx:348` reads `performance.vsGoals[key]` where `key` is a *metric* key (`reach`), but `vsGoals` is keyed by *goal* id (`g_workshop_signups`). Every KPI card's target and pace are therefore always undefined today. The new contract must not repeat this join.
- Follow the `deploy-staging/api/src/scheduling/provider.ts` port style so GF-21 (Meta Ads) can add a second analytics provider without touching routes.

## Backend Implementation

### TASK-003: Add the analytics provider port and the Postiz analytics adapter
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: api
estimate: M
depends_on: [TASK-002]
tags: [gf-113, postiz, analytics, api]
acceptance:
- New `deploy-staging/api/src/analytics/provider.ts` defines `AnalyticsProvider` (`listChannels`, `channelSeries`, `postSeries`, `listRemotePosts`) plus an `AnalyticsError`, mirroring the scheduling port.
- New `deploy-staging/api/src/analytics/postiz.ts` implements it against the four verified endpoints, reusing `loadPostizApiKey(slug)` from `scheduling/postiz.ts` rather than re-implementing decryption.
- New `deploy-staging/api/src/analytics/index.ts` selects the provider from `org_configs`, matching `scheduling/index.ts`.
- A channel-name → integration-id map is built from `GET /integrations` and exported, since posts store channel names and the analytics endpoint demands the UUID.
- Unit tests in `analytics/postiz.test.ts` assert against fixtures recorded in TASK-001 — including a disabled channel, an empty-series channel, and a 4xx — and no test asserts a shape that only the docs claim.
- A failure on one channel or one post is caught and reported per item; the adapter never throws away a whole sync for one bad channel.
notes:
- Code evidence: `deploy-staging/api/src/scheduling/postiz.ts` (201 lines) is the write-side sibling; copy its `postizFetch` error handling, including the response-body slice in the error message.
- Code evidence: `deploy-staging/api/src/scheduling/provider.ts` (90 lines) is the port shape to mirror.
- Reuse, do not duplicate, `POSTIZ_API_BASE` resolution.

### TASK-004: Add the analytics cache collection to PocketBase
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: data
estimate: S
depends_on: [TASK-002]
tags: [gf-113, pocketbase, analytics]
acceptance:
- `deploy-staging/api/src/ensureCollections.ts` creates an `analytics_cache` collection with `slug` (text, unique index), `provider`, `syncedAt`, `status`, `error`, `channels` (json), `series` (json), `posts` (json).
- Timestamps are written explicitly by our code — PocketBase does not auto-populate `created` here.
- The collection is API-rule locked so only the server (admin auth) reads and writes it; it is never exposed through a public PB rule.
- Running the API twice against an existing PocketBase is a no-op (idempotent ensure).
notes:
- Code evidence: `deploy-staging/api/src/ensureCollections.ts` holds the existing pattern, including `integration_secrets`.
- Known trap: PocketBase has no automatic `created` field in this setup — see the platform-gotchas note. Set `syncedAt` yourself.
- Cache, not source of truth: it may be dropped and rebuilt by a sync at any time.

### TASK-005: Background analytics sync worker + manual refresh endpoint
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: api
estimate: M
depends_on: [TASK-003, TASK-004, TASK-016]
tags: [gf-113, analytics, api, worker]
acceptance:
- New `deploy-staging/api/src/analyticsSync.ts` runs on an unref'd interval (the `agentJobs.ts:278` pattern), iterating only clients that have a Postiz key configured.
- The per-client sync costs a fixed, tiny number of requests: `/integrations` once, `/analytics/{id}` once per enabled channel, `/posts` once per window. That is **4 requests** for a two-channel client.
- `/analytics/post/{id}` is **not called at all** — the probe proved it returns `[]` for every published post, so spending one request per post buys nothing. Re-introduce it only if TASK-018 finds it starts returning data.
- The budget is conservative by construction because **Postiz returned no rate-limit headers of any kind**, so there is nothing to self-regulate against at runtime. A 429 is handled reactively, not predicted.
- Sync cadence is env-configurable (`ANALYTICS_SYNC_INTERVAL_MIN`, default 360) and defaults conservatively enough that a full client roster stays inside the hourly limit.
- `POST /api/v1/clients/:slug/analytics/sync` triggers one client's sync on demand, requires dash or admin scope on that slug, and is itself rate-limited per client (reuse `rateLimit.ts`) so the Refresh button cannot burn the hourly quota.
- A 429 from Postiz sets `status: "stale"` with the previous payload retained, never an empty result.
- Every sync writes `syncedAt` and an `audit` entry; failures record `status: "error"` plus the message, and the previous good payload is kept.
notes:
- Code evidence: `deploy-staging/api/src/agentJobs.ts:278` (`setInterval(run, 30_000).unref()`) is the existing worker precedent; `deploy-staging/api/src/rateLimit.ts` is the existing limiter.
- Do not call Postiz from a GET route. Page loads read the cache only.
- The worker must survive a client with a revoked key: mark `no_key` and move on.

### TASK-006: Read route GET /api/v1/clients/:slug/analytics
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: api
estimate: S
depends_on: [TASK-004]
tags: [gf-113, analytics, api]
acceptance:
- `GET /api/v1/clients/:slug/analytics` returns the cached `ClientAnalytics` payload, gated by `requireScope()` like its neighbours.
- A client with no cache row returns a well-formed payload with `status: "no_key"` or `"no_channels"` and empty arrays — never a 404 and never `{}`.
- The route is registered in the OpenAPI document alongside the other client routes.
- The response contains no secret material; the Postiz key never leaves the server.
- A route test covers: cached ok, no key, no channels, stale.
notes:
- Code evidence: `deploy-staging/api/src/routes/viktorOwned.ts:400` is the existing `GET /clients/:slug/performance`, which returns `(await disk.performance(slug)) ?? {}` — the `?? {}` is why the SPA cannot currently distinguish "no data" from "not configured".
- Keep the legacy `/performance` route working until TASK-011 retires its consumers.

### TASK-007: Reconcile our posts with Postiz reality (state + real public link)
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: api
estimate: M
depends_on: [TASK-003]
tags: [gf-113, gf-57, gf-36, postiz, analytics]
acceptance:
- During each sync, `GET /posts?startDate=&endDate=` results are joined to our posts on `publishing.providerJobId`, and each matched post's `state` and `releaseURL` are recorded in the analytics cache.
- A post Postiz reports as `PUBLISHED` gets its `publishing.publishedAt` and `publishing.publicUrl` filled in through the existing `refreshPublishStatus` path — not by a second, divergent writer.
- A post Postiz reports as `ERROR` is surfaced in the cache with the error state so it can be shown, rather than silently staying "Programmed" forever.
- Posts of ours with no `providerJobId` (never actually reached Postiz) are counted and reported as `unlinked`, so the tab can say "3 posts were never scheduled through Postiz" instead of under-reporting.
- No post record is mutated on a read request; reconciliation happens only in the sync worker.
notes:
- Code evidence: `deploy-staging/api/src/schemas/post.ts:86-92` already defines `publishing.provider`, `providerJobId` (with the legacy `postizJobId` alias), `publishedAt`, `publicUrl`. The join key exists — nothing new is needed on the post schema.
- Code evidence: `deploy-staging/api/src/scheduling/sync.ts` `refreshPublishStatus()` is the single existing writer of the published transition. Extend it; do not add a parallel one.
- This is the piece that feeds GF-57 ("grey out / mark published once Postiz actually posted") and closes the loop GF-36 opened. Note the dependency in both Notion items.
- Caveat: while GF-26's payload bug is unfixed, few posts will have a `providerJobId` at all. The tab must degrade honestly rather than look broken.

## Frontend Implementation

### TASK-008: SPA types + api-client for the analytics endpoint
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: frontend
estimate: S
depends_on: [TASK-002, TASK-006]
tags: [gf-113, frontend, analytics]
acceptance:
- `app-v2/src/types/analytics.ts` mirrors the API contract exactly.
- `app-v2/src/lib/api-client.ts` gains `analytics(slug)` next to the existing `performance(slug)` call, and `client-data.ts` loads it into `ClientBundle` as `analytics`.
- File mode (static JSON, no API) resolves `analytics` to `null` without throwing, so the demo build keeps working.
- `npx tsc -b` passes in `app-v2`.
notes:
- Code evidence: `app-v2/src/lib/api-client.ts:257` is the existing performance fetch; `app-v2/src/lib/client-data.ts:104` is its file-mode twin.
- Known trap: `VITE_API_BASE` behaviour differs in file mode — the new call must not break the static demo bundle.

### TASK-009: Restructure the Performance tab around real, label-driven metrics
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: frontend
estimate: L
depends_on: [TASK-008]
tags: [gf-113, frontend, analytics, ui]
acceptance:
- The tab renders from `analytics`, not from `performance`. No number on the page originates in `performance.json` for a real client.
- The **Google Analytics section is deleted** — the card, the disabled Connect button, both `ProxyStat` tiles and the `ProxyStat` component itself (`performance.tsx:570-610` and `:763`).
- A channel strip at the top lists connected channels from `/integrations` (name, platform icon, profile), greying out `disabled` ones, so it is obvious what is and is not being measured.
- The KPI row, the trend chart and the comparison chart are driven by the metric `label`s actually returned per channel, with the fixed nine-metric `METRIC_KEYS` list removed. The existing per-slug localStorage KPI selection is migrated or reset cleanly rather than left pointing at dead keys.
- Series and snapshots render differently: only `kind: 'series'` labels (Reach today) get a line chart; `kind: 'snapshot'` labels (Likes, Views, Comments, Shares, Saves, Replies) render as single-value tiles for the window. No snapshot is ever drawn as a one-point trend line.
- No percentage-change badge is shown unless we computed it ourselves — Postiz's `percentageChange` is a constant placeholder and must not reach the screen.
- A connected channel that returns no data at all (LinkedIn does this today) is shown in the channel strip as connected-but-no-data, not omitted and not zeroed.
- A header shows `syncedAt` in the user's locale plus a Refresh button calling the TASK-005 endpoint, disabled while syncing and while rate-limited.
- Four explicit states are designed and implemented: **no Postiz key** (link to the Integration tab), **key but no channels** (explain what to connect), **channels but no data yet** (nothing published in the window), and **stale/error** (show the last good numbers with a visible warning).
- The period filter (`all` / `last4w` / `thisMonth` / `thisQuarter`) maps to the Postiz `date=N` day window, and any period wider than the synced window is either disabled or clearly labelled as limited.
- `npx tsc -b`, `npx vite build` and `npx eslint` on the changed files all pass.
notes:
- Code evidence: `app-v2/src/routes/client/performance.tsx` — 776 lines, all of it mock-fed. Expect this file to shrink; if it stays large, split the chart sections into `components/performance/`.
- Delete rather than hide. A commented-out GA block still ships in the bundle.
- Keep the existing recharts + shadcn Card/Badge/Tabs vocabulary; this is a data change, not a visual redesign — but it is still a non-trivial UI change and needs Martin's screenshot approval (TASK-015).

### TASK-010: Replace the per-post metrics table with a published-posts ledger
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: frontend
estimate: M
depends_on: [TASK-008, TASK-007, TASK-018]
tags: [gf-113, gf-57, frontend, analytics]
acceptance:
- RE-CUT 2026-08-24 after the probe: `GET /analytics/post/{id}` returns `[]` for every published post, so the per-post **metrics** table is not buildable and the nine numeric columns are removed rather than shown as zeros. TASK-018 is now DECIDED (ship without per-post metrics; Meta Graph route folded into GF-21), so this task is unblocked and ships metric-free.
- What replaces it is a published-posts ledger: friendly "Post N" name (GF-44 `postSeqMap`), channel, publish date, state, and a link out to the real `releaseURL` in a new tab with `rel="noopener noreferrer"`.
- A post Postiz reports as `ERROR` is shown with that state, so a failed publish is visible instead of sitting as "Programmed" forever.
- Posts with no `providerJobId` appear in a separate, clearly labelled "not tracked in Postiz" group with a one-sentence explanation, not silently dropped.
- The "top performers" cards are removed — nothing per-post exists to rank. They do not come back as a channel-level fake.
- If TASK-018 later lands a per-post source, the ledger gains metric columns without being rebuilt: the row component takes an optional label-driven metrics array from day one.
notes:
- Code evidence: `app-v2/src/routes/client/performance.tsx:616-710` is the current nine-column table; `postSeqMap` comes from `app-v2/src/lib/post-status.ts`.
- The outbound link is now the main payoff of this task — clicking from our dashboard to the live Instagram post is real, verified, and works today.
- Do not render a metrics column filled with zeros. An empty array from Postiz means "unknown", not "zero", and showing 0 would be exactly the fabricated-number problem this whole item exists to kill.

### TASK-018: Decide where per-post metrics come from, if anywhere
status: done
owner: martin
agent: claude
reviewer: human
branch: none
area: decisions
estimate: S
depends_on: [TASK-001]
tags: [gf-113, gf-21, decisions, analytics]
acceptance:
- A decision is recorded: (a) ship without per-post metrics and revisit later, (b) pull per-post insights directly from the Meta Graph API using the Instagram media id, or (c) treat per-post metrics as part of GF-21 and drop it from GF-113 entirely.
- If (b), a follow-up spike confirms whether the existing Meta app has `instagram_manage_insights` or whether this needs App Review, before any implementation task is written.
- Whatever is chosen, GF-113 ships channel trends + the published ledger without waiting for it.
notes:
- The probe found `releaseId` on published posts (e.g. `18414871717179534` for the Instagram post) - that is the Instagram **media id**, so `GET /{media-id}/insights` on the Meta Graph API is the technically viable route to per-post metrics. Postiz already hands us the join key.
- Cost of (b): a Meta app with `instagram_manage_insights`, which per the self-hosted Postiz notes means Business Verification and App Review - a 4-8 week calendar item, one-time across all clients. That is the same gate GF-21 sits behind.
- Recommendation: (a) now, folding the real work into GF-21 rather than opening a second Meta integration track. The channel-level Reach series plus the published ledger already make the tab honest and useful, which is the point of GF-113.
- **DECIDED 2026-08-24 by Martin: (a) + (c).** GF-113 ships now with no per-post metrics at all. The Meta Graph route to per-post insights is folded into **GF-21**, which already owns the Meta app / Business Verification / App Review gate. No second Meta integration track is opened, and GF-113 does not wait on it.
- Consequences of the decision, all already reflected in the tasks below: TASK-010 is unblocked and builds the published-posts ledger with **no** metric columns; the "top performers" cards are removed and do not return as a channel-level substitute; `/analytics/post/{id}` is not called anywhere in the shipped code (TASK-005); and GF-113's Notion acceptance criterion "Published posts show their real per-post metrics and link out to the live post URL" is amended to the link-out half only.
- The one piece of forward-compatibility that survives: TASK-010's row component still takes an **optional** label-driven metrics array, so when GF-21 lands a per-post source the ledger gains columns without being rebuilt. That is a prop that defaults to empty, not a feature - do not build a metrics pipeline behind it.

### TASK-011: Handle the Goals-tab fallout of dropping mock performance data
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: frontend
estimate: M
depends_on: [TASK-008]
tags: [gf-113, frontend, goals]
acceptance:
- The **weekly wins/losses summary is removed** from `app-v2/src/routes/client/goals.tsx:897-936`, together with its now-unused i18n keys.
- The Goals tab's per-goal actuals no longer read `performance.vsGoals`; a goal whose actual cannot be measured shows "not measured yet" instead of a fabricated bar.
- Where a goal maps to a metric Postiz does return (impressions, followers), the actual is filled from the analytics cache; the mapping is explicit and reviewable, not inferred by string matching.
- `weeklySummary` and `vsGoals` are removed from `app-v2/src/types/performance.ts`, or the whole legacy type is retired if nothing else reads it.
- DECIDED 2026-08-24 by Martin — **all mock performance data is deleted, including the demo workspace's.** `clients/fitvibe-demo/performance.json` and `clients/gf-internal/performance.json` are removed, the file-mode loader stops fetching `performance.json`, and `fitvibe-demo` shows the same honest empty states a fresh client sees. No "Demo data" badge is needed because no mock data survives.
- The legacy `GET /clients/:slug/performance` route and `disk.performance()` are removed once nothing reads them.
notes:
- CORRECTION TO THE BRIEF: Martin asked to cut the weekly wins/losses summary from Performance, but that block lives on the **Goals** tab, not Performance. `performance.tsx` never renders `weeklySummary`. This task is where the removal actually happens.
- Code evidence: `goals.tsx:435` and `:498` read `performance?.vsGoals[g.id]`; `goals.tsx:897` renders the summary.
- Knock-on: `agent-skills/core/weekly-summary/SKILL.md` exists to write this exact block every Monday. It is spec-only and undeployed, but TASK-017 must reconcile it, or Viktor ends up authoring output the dashboard no longer renders.
- Deleting the demo data means the sales demo loses its Performance tab until a real Postiz channel is connected. Martin accepted that trade on 2026-08-24 in favour of never shipping fabricated numbers. Sales demos currently depend on `fitvibe-demo` looking full. Default assumption if Martin does not weigh in: keep the demo client's mock data behind an unmissable "Demo data" badge, and serve nothing mock to real clients.

### TASK-012: i18n copy for the analytics tab in EN / DE / ES
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: frontend
estimate: S
depends_on: [TASK-009, TASK-010, TASK-011]
tags: [gf-113, i18n]
acceptance:
- Every new string is added to all three dictionaries in `app-v2/src/lib/i18n-dict.ts` — no English fallback leaking into DE or ES.
- All `performance.ga*` keys and the removed weekly-summary keys are deleted from all three dictionaries.
- Postiz metric labels arrive in English from the API; a translation map covers the labels observed in TASK-001 and falls back to the raw label for anything unmapped, rather than showing an empty cell.
- Dates and numbers use the existing `fmtDate` / `fmtCompact` helpers so GF-67's locale coverage is preserved.
notes:
- Code evidence: `app-v2/src/lib/i18n-dict.ts` — EN block from ~line 86, DE from ~1081, ES from ~2179. `performance.ga*` keys sit around line 738.
- GF-67 already made months/dates locale-complete; do not regress it.

### TASK-013: Channel connection health on the Integration tab
status: done
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: frontend
estimate: S
depends_on: [TASK-006]
tags: [gf-113, integrations, postiz]
acceptance:
- The Integration tab shows, under the existing masked Postiz key status, the connected channels from the analytics cache: name, platform, profile handle, and a disabled/expired badge.
- A key that is configured but rejected by Postiz is shown as "key not accepted" rather than as connected.
- Still no secret in the response — only the masked `last4` the route already returns.
notes:
- Code evidence: `deploy-staging/api/src/routes/integration.ts` already returns a masked `PostizStatus { configured, last4, updatedAt }`; `app-v2/src/routes/client/integration.tsx` renders it.
- This is where a client or Pilar will look first when the Performance tab says "no channels", so it closes the loop.

## Verification

### TASK-014: Local verification and regression tests
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: verification
estimate: M
depends_on: [TASK-009, TASK-010, TASK-011, TASK-012, TASK-013, TASK-017]
tags: [gf-113, tests]
acceptance:
- `cd app-v2 && npx tsc -b`, `npx vite build`, and `npx eslint` on changed files all pass, with the real output pasted into the task report.
- `cd deploy-staging/api && npx tsc --noEmit` passes and the API unit tests are green.
- New tests cover: the Postiz analytics adapter against TASK-001 fixtures, the post↔`providerJobId` join including the unlinked case, the sync worker's request budget, and the read route's four states.
- The Performance tab is exercised in the browser preview against a seeded cache for each of the four states, with screenshots.
- No test asserts a Postiz response shape that was not observed in TASK-001.
notes:
- Rule from GF-26: `postiz.test.ts` stayed green while shipping a broken payload because it asserted our own wrong shape. Fixtures must come from real responses.

### TASK-015: Design approval, independent review, staging merge
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-113-performance-analytics
area: verification
estimate: S
depends_on: [TASK-014]
tags: [gf-113, review, deploy]
acceptance:
- Screenshots of the restructured Performance tab in all four states, with realistic client data, are sent to Martin and explicitly approved before the merge.
- A Layer-5 `independent-review` runs with a different vendor than the implementer and returns PASS, or its findings are fixed and re-reviewed.
- A dated user-facing entry is added at the top of `app-v2/src/lib/changelog.ts`.
- The branch merges into `experimental`, CI deploys, and the live staging bundle is confirmed in API mode.
- GF-113 moves to "Done in Staging" in Notion.
notes:
- UI approval gate applies: this is a non-trivial UI change, so Martin's yes comes before the merge, not after.
- Production promotion is a separate step (`promote-staging-to-prod`), not part of this plan.

## Blockers and Dependencies

- ~~TASK-001 blocked on Martin supplying a Postiz Cloud API key~~ - cleared 2026-08-24, probe ran, contract verified above.
- **GF-26 (Postiz payload contract) is still buggy.** Posts that never reached Postiz have no `providerJobId`, so per-post analytics will cover very little until GF-26 lands. This plan degrades honestly rather than waiting, but the tab will look thin until then.
- **GF-57** (grey out / auto-mark published) is fed directly by TASK-007 — worth building them together or at least noting the overlap so the work is not done twice.
- **GF-21** (Meta) is the reason TASK-003 uses a provider port rather than calling Postiz from the route. As of 2026-08-24 GF-21 also owns **per-post metrics via the Meta Graph API** (TASK-018 decision) - it is the single Meta track, covering both ads and organic per-post insights, behind one Business Verification / App Review gate.
- **All open decisions are now closed.** TASK-001 (probe) done, TASK-016 (sync ownership -> API server) done, TASK-011 (delete all mock performance data, demo included) decided, TASK-018 (no per-post metrics; fold into GF-21) decided 2026-08-24. Nothing in this plan is waiting on Martin.
- **Prior art warning:** `agent-skills/core/sync-postiz-analytics/SKILL.md` and `agent-skills/core/weekly-summary/SKILL.md` already specify this feature for Viktor against a guessed, non-existent Postiz endpoint. Both are undeployed. Do not install either as written; TASK-017 cleans them up.

# Retired: `sync-postiz-analytics` and `weekly-summary`

Removed 2026-08-24 by GF-113 / TASK-017. This note exists so nobody resurrects
them from git history without reading why they went.

## What they were

Two skills that specified Viktor's analytics loop:

- `sync-postiz-analytics` — daily at 06:00 UTC, pull per-post metrics from Postiz,
  recompute aggregates and goal progress, rewrite `clients/<slug>/performance.json`
  and commit it to git.
- `weekly-summary` — Mondays, write the wins / losses / next-test block into
  `performance.json` for the Goals tab to render.

Both were marked "Not yet deployed. Spec only". **Neither was ever installed on
any box**, so nothing is lost operationally.

## Why they were retired, not fixed

Three independent reasons, any one of which is sufficient:

1. **The architecture they assume is gone.** Both write `performance.json` on disk
   and commit it to git. Client data has lived in PocketBase behind the REST API
   since the multi-tenant migration. There is no file to rewrite and no repo to
   commit to.

2. **The endpoint they call does not exist.** They target
   `GET {POSTIZ_BASE}/api/posts/{jobId}/analytics`. The real one is
   `GET /public/v1/analytics/post/{postId}?date=N`. Installing either as written
   would have failed exactly the way GF-26 failed — by trusting a guess instead of
   a probe.

3. **Even the correct endpoint returns nothing.** The TASK-001 probe against live
   Postiz Cloud got `200 []` for every published post at both 30- and 90-day
   windows. The per-post metrics these skills exist to fetch are not available at
   all. That work is now folded into **GF-21** (Meta Graph API).

## What replaced them

The **API server** owns the sync (TASK-016). See
`deploy-staging/api/src/analyticsSync.ts`. It runs on a timer, decrypts the
per-client key server-side, writes the `analytics_cache` collection, and is the
single writer of analytics data.

That "single writer" property is the point. If one of these skills were ever
installed alongside the worker, two components would be writing the same client's
analytics on different schedules through different code paths, and the dashboard
would show whichever wrote last.

The `weekly-summary` output has no home either: the wins/losses block was removed
from the Goals tab in TASK-011, so an agent writing it would be producing output
nothing renders.

**Do not reinstate either skill.** If Viktor should ever comment on the numbers,
that is a new item written against the API contract in
`deploy-staging/api/src/schemas/analytics.ts` — not a revival of these files.

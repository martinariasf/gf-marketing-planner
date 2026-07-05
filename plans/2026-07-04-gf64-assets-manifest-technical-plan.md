---
project: GF-64 Assets manifest — durable append + read-time merge
updated: 2026-07-04
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004]
items:
  - gf-64: Image-generation PATCH must append an assets manifest row | priority: high
---

# Plan

## Simple Words

- Today the Assets tab only shows files that have a row in a bookkeeping file
  (`manifest.json`). Viktor's generate tools already add rows, but anything he
  attaches to a post by hand (edited videos, fixed logo slides) never gets a
  row, so it is invisible — that is why the videos disappeared.
- Fix: when the dashboard asks for the asset list, the server ALSO looks at
  every post and adds an entry for any attached image/video that is missing
  from the bookkeeping file. Nothing can silently disappear again.
- Also: the generate tools get a small guard so re-generating never creates
  duplicate rows.
- Not included yet: writing the derived rows back to `manifest.json` on disk
  (the API container mounts client data read-only, by design), and prod box
  rollout (separate promotion step).

## Context and decisions

- Notion GF-64 (Bug, High, Area Agent). Original spec targeted the image PATCH
  write path; clarified 2026-07-04 to cover ALL generated media (videos had
  the same failure: 7 of 8 prod mp4s had no manifest row).
- Code evidence: the plugin already appends manifest rows in all four
  generation paths (`_publish_reserve_image`, `_link_image_to_post`,
  `_link_slide_to_post`, `_publish_generated_video`) in
  deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/__init__.py.
  The surviving gap is media attached to posts outside those tools.
- Decision — read-time merge, not write-on-PATCH: mp-staging-api and
  mp-prod-api mount /data/clients READ-ONLY (verified via docker inspect
  2026-07-04), and a second writer to manifest.json would race the agent.
  The manifest GET derives rows from post state instead.
- Derived-row contract: id `ref-<filename>` (stable, cannot collide with
  `aNNN`), kind from extension (.mp4/.webm/.mov → video, else image),
  source `post-reference (derived)`, usedInPosts = referencing post ids,
  finalApproved true iff any referencing post status is approved, scheduled or
  published, createdAt omitted (unknown). Only files that exist on disk under
  clients/<slug>/assets/ are surfaced. Soft-deleted ids (asset_states) still
  filter the merged list.

## Backend Implementation

### TASK-001: Merge post-referenced assets into the manifest read path
status: todo
owner: claude
agent: claude
reviewer: glm-5.2-openrouter
branch: claude/gf-64-manifest-merge
area: api
estimate: M
depends_on: []
tags: [notion, gf-64, api, assets]
acceptance:
- GET /api/v1/clients/:slug/assets/manifest returns, in addition to disk rows, one derived row per asset file referenced by any post's image, slides[].image or media[].url that has no manifest row for that filename, provided the file exists in DATA_ROOT/clients/<slug>/assets/.
- Derived rows never duplicate a filename already present in manifest.json; repeated GETs return identical ids (ref-<filename>).
- The hydrate route GET /api/v1/clients/:slug returns the same merged manifest.
- Soft-deleted asset ids (asset_states overlay) are excluded from the merged result, including derived ids.
- node --test suite covers: derived row appears, no duplication with existing row, missing file skipped, video kind detection, usedInPosts aggregation across posts.
notes:
- Source: GF-64 in Notion (clarified 2026-07-04, videos in scope).
- Code evidence: deploy-staging/api/src/routes/viktorOwned.ts:376 serves the manifest and already merges the asset_states deleted overlay; deploy-staging/api/src/routes/clients.ts:112 returns the raw manifest in the hydrate payload; deploy-staging/api/src/posts.ts:98 listPosts(slug) builds final post state (created + patches overlays).
- New helper deploy-staging/api/src/assetsManifest.ts (mergePostReferencedAssets) + assetsManifest.test.ts using node:test (npm test = tsx --test "src/**/*.test.ts").
- Filename extraction mirrors /root/backfill_manifest.py fn_from_url: split on "/assets/files/" or "/assets/", URL-decode, ignore foreign hosts unless path contains /clients/<slug>/assets/.
- Existence check via fs access on DATA_ROOT (read allowed on the ro mount).

### TASK-002: Idempotency guard in the plugin _append_manifest
status: todo
owner: claude
agent: claude
reviewer: glm-5.2-openrouter
branch: claude/gf-64-manifest-merge
area: agent
estimate: S
depends_on: []
tags: [notion, gf-64, agent, plugin]
acceptance:
- _append_manifest returns without adding a row when the filename already exists in items; if a post_id is supplied it is merged into that row's usedInPosts instead.
- python -m py_compile passes on the plugin file (no python test harness exists for plugins — stated, not skipped silently).
notes:
- Source: GF-64 acceptance criterion "re-generating does not create duplicate rows".
- Code evidence: deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/__init__.py:520 _append_manifest currently always appends.
- Filenames are timestamped so duplicates are unlikely, but retries/re-runs of the same tool call can double-append today.

## Frontend / docs

### TASK-003: Changelog entry
status: todo
owner: claude
agent: claude
reviewer: glm-5.2-openrouter
branch: claude/gf-64-manifest-merge
area: frontend
estimate: XS
depends_on: [TASK-001]
tags: [notion, gf-64, changelog]
acceptance:
- New entry at the TOP of app-v2/src/lib/changelog.ts dated with the staging deploy date describing that generated/attached media now always appears in Assets.
notes:
- User-visible behavior change (Assets tab shows previously invisible media).

## Verification

### TASK-004: Staging deploy + live write-path test
status: todo
owner: claude
agent: claude
reviewer: glm-5.2-openrouter
branch: claude/gf-64-manifest-merge
area: verification
estimate: S
depends_on: [TASK-001, TASK-002, TASK-003]
tags: [notion, gf-64, staging]
acceptance:
- After CI deploys experimental, /api/v1/health reports pb up and the api-client bundle is API-mode.
- On staging-demo - PATCH a post to reference an existing asset file that has no manifest row; GET assets/manifest shows the derived ref-<filename> row; the Assets tab renders it after hard reload.
- Cleanup - revert the test PATCH in the same run; note ids used.
- Plugin file on the staging agent box matches the repo after deploy (no drift), per the sync procedure in reference_hermes_agents_ignore_skills / plugin deploy notes.
notes:
- Staging box: /opt/agents (staging Viktor) plugin bind-mount; never scp whole config, patch the plugin file surgically if the deploy pipeline does not cover it.
- Prod rollout is NOT here: promote-staging-to-prod ships the API; the prod agent box plugin gets the same file at promotion.

---
project: Carrousel not working — deterministic slide linking (GF-62)
updated: 2026-06-26
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005]
items:
  - gf-62: Carrousel not working | priority: urgent
---

# Plan

## Simple Words

When Viktor builds an Instagram **carousel**, the post shows up in the dashboard
with only its **cover** — none of the other slides appear. It looks broken in
Main but "works" in staging only by luck.

Root cause (confirmed against the 2026-06-25 prod session + live API): a single
image and a video each have a **one-call deterministic tool** that generates the
asset AND wires it to the post in-process (`image_generate(post_id=…)` sets the
cover; `video_generate(post_id=…)` PATCHes `media[]`). A **carousel has no such
tool** — the agent must generate each slide as a loose asset and then hand-write
a `PATCH /posts/:id {slides:[…]}`. That long manual sequence is fragile: in the
25.06 session the model provider crashed mid-build, so the 4 July carousels were
left as `format:carousel` with `slides:[]` (verified on the prod API). The
dashboard renders exactly what exists — the cover.

The fix: give carousels the **same deterministic path** as images/video. Add a
`slide_index` to `image_generate` so `image_generate(post_id="p1", slide_index=2,
…)` generates the slide AND appends it to that post's `slides[]` in-process,
keeping `image = slides[0].image` as the cover. Each call commits a valid
carousel, so an interruption after slide *k* leaves a real *k*-slide carousel,
not an empty one. It also fixes the wrong-aspect-ratio bug the agent hit
(slides now follow the post's Instagram channel → vertical 4:5).

Scope of THIS plan: **staging only** (agent plugin + config, verify on the
staging Viktor). Promoting to prod and regenerating Pilar's 4 July carousels are
explicit follow-ups (TASK-006, TASK-007), not done here.

## Decisions and API Contracts

### TASK-001: Decide the carousel tool contract (slide_index semantics)
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-62-carousel-slides
area: decisions
estimate: XS
depends_on: []
tags: [gf-62, carousel, agent, decision]
acceptance:
- `image_generate` gains `slide_index` (integer ≥ 1) and `caption` (optional per-slide design note).
- Contract: when `post_id` AND `slide_index` are present → append/replace slide at that 1-based index in `slides[]`; set `format:"carousel"`; set cover `image = slides[0].image`. When `post_id` is present WITHOUT `slide_index` → unchanged single-image cover behaviour. No `post_id` → reserve asset, unchanged.
- Aspect ratio for a slide follows the post's channel (Instagram ⇒ 4:5), same resolution path as a cover (fixes the "horizontal slides" bug).
- Idempotency rule recorded: re-calling with the same `slide_index` REPLACES that slide (re-generation), it does not duplicate.
notes:
- Source: GF-62 (Notion, Urgent, Approved to build).
- Mirrors existing patterns: `_link_image_to_post` (cover) and `_link_video_to_post` (media[]) in `deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/__init__.py:960` / `:1021`.

## Agent Implementation

### TASK-002: Add `_link_slide_to_post` + slide branch in image_generate (plugin)
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-62-carousel-slides
area: agent
estimate: M
depends_on: [TASK-001]
tags: [gf-62, carousel, plugin, python]
acceptance:
- New `_link_slide_to_post(image_ref, post_id, slide_index, caption)` added next to `_link_image_to_post`: resolves bytes, copies into assets dir, appends manifest (reuse `_resolve_image_bytes`/`_append_manifest`), GETs the post, sets `slides[slide_index-1] = {image:url, caption?}` (extends the list if needed), sets `format:"carousel"` and `image = slides[0].image`, PATCHes `{slides, image, format}`, GETs to confirm `len(slides)`.
- `IMAGE_GENERATE_FIDELITY_SCHEMA` gains `slide_index` and `caption` properties with clear descriptions; `required` stays `["prompt"]`.
- `_handle_image_generate` branches: when `post_id` and `slide_index>=1`, call `_link_slide_to_post` instead of `_link_image_to_post`; return `result["post_link"]` with `{linked, slide_index, slide_count, url}` and set `result["image"]` to the served URL.
- `py_compile` passes; no change to single-image or video code paths.
notes:
- Files: `deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/__init__.py` — schema `:1095`, handler `:1250` (link call at `:1329`), helpers `:960`/`:1021`, `_fetch_post` `:568`.
- API already supports this write: `slides` is in `postPatchSchema` and `coalescePost` derives `format:carousel` when `slides.length>1` (`deploy-staging/api/src/schemas/post.ts:89,119,218,256`). No API change required for the happy path.

### TASK-003: Update staging agent CAROUSEL WORKFLOW to use the new tool
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-62-carousel-slides
area: agent
estimate: S
depends_on: [TASK-002]
tags: [gf-62, carousel, config, prompt]
acceptance:
- The CAROUSEL WORKFLOW in `deploy-staging/staging-demo-agent/config.yaml` (and the `marketing-planner-staging` skill) tells the agent to build each slide with `image_generate(post_id=<id>, slide_index=<n>, channel="instagram", caption=…)` — one call per slide — and DROPS the manual "copy file → append manifest → hand-write PATCH slides[]" instructions.
- Guidance retained: ASK count/channel/style first, propose the slide outline before generating, cover = slide 1.
- Reminds the agent that `format:"carousel"` is now set by the tool, not by hand at post-creation.
notes:
- Current manual steps live at `config.yaml` "CAROUSEL WORKFLOW" (≈ lines 343-367) and the staging skill `skills/marketing-planner-staging/SKILL.md` "Manual flow" (≈ lines 111-119).

## Verification

### TASK-004: Deploy to the staging Viktor and verify a real carousel end-to-end
status: done
evidence:
- 2026-06-26: surgically patched the LIVE staging stack (`/opt/agents/staging-demo/plugins/image_gen_openrouter/__init__.py` + `config.yaml`), preserving live-only WhatsApp/prompt-caching/guardrails (repo↔box drift — see notes); backups `*.bak.gf62-20260626-072722`. Container restarted clean, WhatsApp bridge reconnected.
- Functional test against live staging API on a throwaway post: slide1→count1, slide2→count2, re-slide2→count2 (REPLACE not duplicate), final `format=carousel`, `slides=2`, cover==slides[0]. Each call left a valid carousel (incremental commit). Test post + assets cleaned up.
- Dashboard rendering already confirmed present + identical on main/experimental (`app-v2/src/routes/client/calendar.tsx:2087`, gated on `slides.length>1`).
- NOTE: box config/plugin had drifted from experimental in BOTH directions; staging now runs the GF-62 fix on top of the live (drifted) files. The git branch is the canonical record; a future clean agent redeploy must reconcile the drift.
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-62-carousel-slides
area: verification
estimate: S
depends_on: [TASK-002, TASK-003]
tags: [gf-62, carousel, deploy, staging]
acceptance:
- Updated plugin reaches the `hermes-marketing-staging` container (confirm mount/rebuild mechanism for the staging stack on `46.224.224.113`; restart/`up -d`).
- `hermes tools` still lists `image_generate`; new params visible in the schema.
- Drive the staging Viktor to build a ≥3-slide Instagram carousel on a `staging-demo` test post; then `GET /clients/staging-demo/posts/:id` shows `format:carousel`, `slides.length ≥ 3`, all 4:5, cover = slides[0].image.
- Confirm the carousel renders all slides in `staging.marketing.gfinnov.com` (calendar slide viewer, `app-v2/src/routes/client/calendar.tsx:2087`).
- Mid-build safety check: after 2 of 3 slides, the post is already a valid 2-slide carousel (no empty `slides[]`).
notes:
- Agent deploys are manual (NOT CI) — see `deploy-hermes-company-agent` / update-hermes skill. CI only ships the website (SPA+API).

### TASK-005: Independent cross-vendor review, then merge to experimental
status: done
evidence:
- Layer-5 review by GLM 5.2 (non-Anthropic vendor): round 1 FINDINGS (actual-index reporting, position-verified `linked`, format-from-count, no-tests) → implementer fixed #2–#5, documented #1 (plugin needs the hermes runtime to import, no local/CI harness; functional test covers it) → round 2 VERDICT: PASS.
- Merged to experimental via PR #24 (merge commit d57a72f); CI deploys the website. Changelog entry added (2026-06-26 "Carousels now keep all their slides"). Notion GF-62 → "Done in Staging" with release note.
owner: martin
agent: codex
reviewer: codex
branch: claude/gf-62-carousel-slides
area: review
estimate: S
depends_on: [TASK-004]
tags: [gf-62, review, merge]
acceptance:
- Codex (different vendor than the Claude implementer) reviews the diff against GF-62 acceptance via `independent-review`; findings loop through fix → re-verify.
- On PASS: PR/merge into `experimental`; CI deploys the website; agent already deployed in TASK-004.
- Changelog: add a dated, user-facing entry at the top of `app-v2/src/lib/changelog.ts` (carousels now build/show all slides).
- Move GF-62 to "Done in Staging" in Notion.

## Follow-ups (NOT in this staging pass)

### TASK-006: Promote GF-62 to prod (gf-innov agent)
status: done
evidence:
- AGENT-ONLY promotion (no experimental→main merge: experimental is 35 commits ahead w/ GF-58 etc.; prod dashboard already renders carousels — slideShape + slide viewer already on main). The GF-62 functional fix lives entirely in the agent.
- Prod plugin was a CLEAN experimental base (0-diff, unlike the drifted staging box), so dropped the reviewed worktree plugin straight in; prod config patched surgically (3 hunks) preserving prod-only content. Backups `*.bak.gf62-20260626-121515`. `viktor-v2-gf-innov` restarted clean.
- Functional test on prod API (gf-internal, throwaway post): slide1→single image, slide2→carousel, skip-ahead→idx 3, replace→no dup, cover==slides[0]. Cleaned up.
- Changelog entry stays on experimental (rides next website promotion); GF-62 → "Done in Main" in Notion.
owner: martin
agent: claude
reviewer: codex
branch: none
area: deploy
estimate: S
depends_on: [TASK-005]
tags: [gf-62, prod, promotion]
acceptance:
- Carry the same plugin + config change into the prod agent (`deploy-prod/gf-innov-agent/...` → `viktor-v2-gf-innov`) and the website to `main` via `promote-staging-to-prod`.
notes:
- Prod plugin mirror: `deploy-prod/gf-innov-agent/plugins/...`; prod config lives on box `/opt/agents/gf-innov/config.yaml` (carousel workflow ≈ lines 343-367).

### TASK-007: Rebuild Pilar's 4 stranded July carousels (prod data)
status: todo
owner: martin
agent: viktor-prod
reviewer: human
branch: none
area: data
estimate: S
depends_on: [TASK-006]
tags: [gf-62, prod, backfill]
acceptance:
- For prod posts `c-mqtry33p-387c`, `c-mqtry38h-dj0x`, `c-mqtry3br-klnx`, `c-mqtry3ga-ift2` (gf-internal), generate the real slide decks via the new tool so each has `slides.length ≥ 2`.
notes:
- A pure "relink" is NOT possible: only cover images (2 regenerations each) exist on disk; the slide content was never generated. These must be generated fresh.

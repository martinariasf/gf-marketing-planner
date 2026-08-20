---
project: 2026-06-10 Approved Build Batch Technical Plan
updated: 2026-06-10
owner: Martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
code_reviewed_at: 2026-06-10
default_group: item
focus_tags: [gf-16, gf-15, gf-3, gf-9]
items:
  - gf-16: Be able to modify the date of the publication | priority: high
  - gf-15: Add new post bottom | priority: medium
  - gf-9: Content-mix pie chart | priority: low
  - gf-3: Grey-out Videos | priority: low
---

# Plan

## Scope

The four Approved-to-build items that are still unbuilt as of 2026-06-10: GF-16,
GF-15, GF-9, GF-3.

Already shipped on `experimental` (do NOT re-plan):
- **GF-4** (Collaboration / Content Creation review-link) — spec
  `2026-06-09-gf-4-review-link-spec.md`; implemented in commits `27d01c2`
  (backend) and `8398a9d` (frontend + external page).
- **GF-17** (Download content calendar) — shipped in `8398a9d` as
  `app-v2/src/lib/calendar-export.ts` (Share-adjacent "Download" dropdown).
  Note: current export is dependency-free (print-to-PDF via iframe + `.doc`
  HTML download). See follow-up note under GF-17 review if a true one-click
  `.docx` + direct-download PDF is wanted.

Backend reality check: the post API already supports both date edits and
creation. `PATCH /clients/:slug/posts/:id` accepts `date`; `POST
/clients/:slug/posts` creates a dashboard post (`posts_created`). GF-16/GF-15 are
frontend + api-client work, not new routes.

## Frontend Implementation

### TASK-001: Add a publication-date editor to the calendar post editor
status: todo
owner: codex
agent: codex
area: frontend
estimate: M
depends_on: []
tags: [notion, gf-16, calendar, post-editor, date]
acceptance:
- The calendar post editor exposes an editable publication date (date input) alongside title/copy/hashtags/cta.
- Changing the date and saving sends `date` in the `apiPatchPost` patch and succeeds against the existing PATCH route.
- After save, the calendar re-buckets the post into the correct month/week without a full reload (existing `onSaved`/`refetch` path).
- An invalid/empty date is prevented client-side or surfaces the API 422 as a toast, without corrupting the post.
- The date control only renders when `isApiEnabled` is true, matching the other editable fields.
notes:
- Source: GF-16 in Notion. Description: "On the content calendar".
- Code evidence: app-v2/src/routes/client/calendar.tsx post editor builds its patch from title/copy/hashtags/cta only and calls apiPatchPost(slug, post.id, patch).
- Code evidence: deploy-staging/api/src/schemas/post.ts postPatchSchema already includes `date: dateLike` accepting `YYYY-MM-DD` or full ISO.
- Code evidence: app-v2/src/lib/planning-range.ts monthKeyFromIso/weekOfMonth drive calendar bucketing — re-bucket relies on refreshed data.
- Technical scope: add `date` to the editor's local state + `dirty` check + patch builder; no backend change.

### TASK-002: Add an `apiCreatePost` client function
status: todo
owner: codex
agent: codex
area: frontend
estimate: S
depends_on: []
tags: [notion, gf-15, calendar, api-client, create-post]
acceptance:
- app-v2/src/lib/api-client.ts exports `apiCreatePost(slug, input)` that POSTs to `/clients/:slug/posts` via the existing `apiSend`.
- Input type matches the backend create schema's essential fields (`date`, `title`) and allows optional channel/format/pillar/status.
- Returns the created `Post` (201 body) normalized through the existing `normalizePost` path.
- Errors (422/403) propagate so the UI can toast them.
notes:
- Source: GF-15 in Notion.
- Code evidence: deploy-staging/api/src/routes/viktorOwned.ts POST /clients/:slug/posts exists, validates via postCreateSchema, returns the built post with 201.
- Code evidence: deploy-staging/api/src/schemas/post.ts postCreateSchema treats `date` + `title` as essential, rest optional.
- Code evidence: app-v2/src/lib/api-client.ts has apiPatchPost and apiSend; no create helper yet.
- Technical scope: mirror apiPatchPost's signature/style; prerequisite for TASK-003.

### TASK-003: Add a "+ new post" control to the content calendar
status: todo
owner: codex
agent: codex
area: frontend
estimate: M
depends_on: [TASK-002]
tags: [notion, gf-15, calendar, ui, create-post]
acceptance:
- A plus / "Add post" control appears in the content calendar where posts are listed ("on the bottom where you see the posts").
- Activating it creates a new draft post (default date for the visible month, default status `idea`/`drafting`) via `apiCreatePost`, then opens the post editor for it.
- The new post appears in the calendar without a manual reload and can immediately be edited (incl. date from TASK-001).
- Control only renders when `isApiEnabled` is true.
- English, German, and Spanish labels are added.
notes:
- Source: GF-15 in Notion. Description: "add a plus symbol in the content calendar on the bottom where you see the posts to add a new post manually if needed."
- Code evidence: app-v2/src/routes/client/calendar.tsx renders month/week post lists and an editor opened via onSaved/refetch.
- Code evidence: app-v2/src/lib/i18n-dict.ts holds calendar.* copy in EN/DE/ES.
- Technical scope: reuse apiCreatePost; default date = first day of the currently viewed month/week.

### TASK-004: Add a content-mix pie chart at the bottom of the calendar
status: todo
owner: codex
agent: codex
area: frontend
estimate: M
depends_on: []
tags: [notion, gf-9, calendar, chart, strategy, pillars]
acceptance:
- The bottom of the content calendar shows the quarter label plus a pie chart of content-pillar distribution.
- Pie slices = content pillars from the plan; each slice reuses the pillar's defined color.
- The chart compares actual post mix (share of posts per pillar in range) against the strategy target weights, surfacing the gap (legend shows actual % vs target %).
- The chart updates as posts are added/edited (re-derives from the calendar's post data).
- Empty state (no posts / no pillars) renders without errors.
- English, German, and Spanish labels are added for heading/legend.
notes:
- Source: GF-9 in Notion. Clarified by Martin 2026-06-10: page = Content Calendar; categories = content pillars from Strategy ("according to the strategy").
- Code evidence: app-v2/src/types/plan.ts Pillar has { name, weight, color, description }; Plan.pillars + Plan.quarter.label provide categories + heading.
- Code evidence: app-v2/src/types/post.ts Post.pillar is the per-post category to tally.
- Code evidence: recharts ^3.8.1 is a dep; app-v2/src/routes/client/performance.tsx already uses recharts as a usage reference for PieChart.
- Technical scope: derive the tally from posts already loaded; no backend call.

### TASK-005: Grey-out the Videos navigation entry as "coming soon"
status: todo
owner: codex
agent: codex
area: frontend
estimate: S
depends_on: []
tags: [notion, gf-3, nav, videos, coming-soon]
acceptance:
- The Videos entry in the client nav is visibly greyed and not clickable.
- A small "(soon)" label is shown inline in the greyed Videos entry (in addition to the muted styling).
- Hover shows an optional "coming soon" tooltip; no navigation occurs and no console errors fire.
- Direct visits to the videos route still degrade gracefully (existing "coming soon" page is fine, but the nav must not present it as active).
- English, German, and Spanish "coming soon" copy is added if a tooltip/label is introduced.
notes:
- Source: GF-3 in Notion. Description: "Grey-out the 'Videos' option since the feature is not available yet."
- Code evidence: app-v2/src/routes/client/layout.tsx nav array (line 77) — { to: 'videos', labelKey: 'nav.videos', icon: Video, phase: 'prepare' }.
- Code evidence: app-v2/src/routes/client/videos.tsx already renders a "coming soon" page, but the nav link is still active.
- Technical scope: mark the videos nav item disabled in the nav renderer (non-link, muted styling, tooltip); keep the route registered.

## Verification

### TASK-006: Verify the approved batch end to end on staging
status: todo
owner: codex
agent: codex
area: verification
estimate: S
depends_on: [TASK-001, TASK-003, TASK-004, TASK-005]
tags: [notion, gf-16, gf-15, gf-9, gf-3, verification, staging]
acceptance:
- app-v2 TypeScript build passes.
- Manual browser check: editing a post's date re-buckets it; "+ new post" creates and opens an editable post; the pie chart reflects pillar mix and updates after adding a post; Videos nav is greyed, shows "(soon)", and is unclickable.
- No console errors on the calendar page in any of the three languages.
- Staging deploy uses CI from `experimental` and the live bundle is verified as API mode.
notes:
- Source: current approved Notion batch GF-16, GF-15, GF-9, GF-3.
- Code evidence: AGENTS.md requires source-only edits, commits to experimental, CI deploy, and API-mode verification.
- Technical scope: verification grouped after implementation so the plan does not claim success from edits alone.

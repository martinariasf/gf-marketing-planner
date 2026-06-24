---
project: Friendly post names + Approvals→Calendar link
updated: 2026-06-23
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: false
focus_tasks: [TASK-003, TASK-004, TASK-005, TASK-007]
items:
  - gf-44: Friendly post names (sequential 'Post N') | priority: medium
  - gf-13: Connect Approvals & Calendar | priority: high
---

# Plan

## Build Note (2026-06-23)

Implemented on branch `claude/gf-44-friendly-post-names` (on top of
`origin/experimental`). The running number is computed **client-side** from the
post set the dashboard already holds (`postSeqMap` in `post-status.ts`), so the
planned backend/schema tasks (TASK-001/002) were **not needed** and are marked
cancelled — this is presentation only, no API change. Verified: `tsc -b` +
`vite build` pass; browser preview confirms "Post N" in Approvals + activity
log, the name links to the calendar, and an out-of-range post (demo p006 in
September) auto-widens the range and is shown. Pending: independent cross-vendor
review, then merge to `experimental` + move GF-44/GF-13 to "Done in Staging".

## Simple Words

Today, posts that the dashboard or chat creates get cryptic computer names like
`c-lxk3j9-a4f2`, and that ugly code is shown as the post's name in the Approvals
list. We will instead show a friendly, stable number per client plus the title —
e.g. **"Post 12 — The 3-Bottle Rule"**. The real internal ID does not change, so
nothing breaks (including the Telegram `approve <id>` command).

On top of that, the friendly post name in **Approvals** becomes clickable:
clicking it jumps straight to that exact post in the **Content Calendar** (right
month, that post selected). This is the still-open part of GF-13.

Not in scope yet: renaming the actual database IDs, making `approve` accept the
"Post N" number, or any change to how Viktor names files internally.

## Decisions and API Contracts

### TASK-001: Compute a stable per-client sequential number for every post
status: cancelled
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-44-friendly-post-names
area: backend
estimate: M
depends_on: []
tags: [notion, gf-44, api, posts, naming]
acceptance:
- Each post returned by the API carries a `seq` number that is unique and stable per client.
- Ordering is by creation order, not publish date, so editing a post's date does not change its number.
- `seq` does not reshuffle on a normal reload (only a deletion of an earlier post can leave a gap).
notes:
- Source: GF-44 in Notion.
- Code evidence: deploy-staging/api/src/posts.ts `listPostIds`/`buildPost`/`listAllPosts` assemble the per-client post set (disk `pNNN` files + PB `posts_created`).
- Code evidence: created IDs are `c-<base36 ts>-<rand>` (deploy-staging/api/src/routes/viktorOwned.ts:137); disk IDs are `pNNN` (deploy-staging/api/src/diskData.ts:60).
- Technical scope: derive `seq` deterministically — sort disk posts by their numeric `pNNN`, then created posts by the base36 timestamp embedded in `c-<ts>-...`, then number 1..N. Document the delete-gap trade-off; persisting a counter is a possible follow-up only if gaps become a problem.

### TASK-002: Add `seq` to the Post contract (type + schema + normalizer)
status: cancelled
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-44-friendly-post-names
area: decisions
estimate: S
depends_on: [TASK-001]
tags: [notion, gf-44, types]
acceptance:
- `seq?: number` exists on the SPA `Post` type and is preserved by `normalizePost`.
- The API post schema includes `seq` so it is not stripped before reaching the SPA.
- Typecheck passes with no `any` leaks.
notes:
- Source: GF-44 in Notion.
- Code evidence: app-v2/src/types/post.ts (Post interface), app-v2/src/lib/normalize-post.ts (last line of defense), deploy-staging/api/src/schemas/post.ts.
- Technical scope: additive + optional so legacy readers keep working.

## Frontend Implementation

### TASK-003: Render "Post N — Title" instead of the raw ID everywhere it shows
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-44-friendly-post-names
area: frontend
estimate: M
depends_on: [TASK-002]
tags: [notion, gf-44, ui, approvals, calendar]
acceptance:
- Approvals waiting list shows "Post N" as the headline name; the raw `c-...` ID is removed from the visible name (still used only for the `approve <id>` copy command).
- Approvals recent-activity log shows "Post N" by mapping `entry.postId` → seq via the loaded posts.
- Calendar surfaces the friendly name where the ID would otherwise appear.
- A single `postName(post)` helper is reused; no ad-hoc string building per call site.
notes:
- Source: GF-44 in Notion.
- Code evidence: app-v2/src/routes/client/approvals.tsx:237 (the monospace ID badge in `WaitingRow`) and `LogRow` (uses `entry.postId`).
- Code evidence: app-v2/src/routes/client/calendar.tsx (CompactPostCard / thumbnail strip render title; delete dialog uses `post.id`).
- Technical scope: add `postName(post)` in a shared lib (e.g. app-v2/src/lib/post-status.ts or a new helper); keep `post.id` for the Telegram command string.

### TASK-004: Make the post name in Approvals link to the Content Calendar
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-13-approvals-calendar-link
area: frontend
estimate: S
depends_on: [TASK-003]
tags: [notion, gf-13, ui, approvals, navigation]
acceptance:
- Clicking the friendly post name in the Approvals waiting list navigates to `/:slug/calendar?post=<id>`.
- The control is keyboard-accessible (button/link, not a bare div) and visually reads as clickable.
notes:
- Source: GF-13 in Notion (remaining scope = the Approvals↔Calendar link).
- Code evidence: routes are siblings under `/:slug` — App.tsx:121 (calendar) and App.tsx:122 (approvals); use react-router `useNavigate`/`Link`.
- Code evidence: `WaitingRow` in app-v2/src/routes/client/approvals.tsx currently renders the title as a plain `<h3>`.

### TASK-005: Calendar deep-links to a post from `?post=<id>`
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-13-approvals-calendar-link
area: frontend
estimate: S
depends_on: [TASK-004]
tags: [notion, gf-13, ui, calendar, navigation]
acceptance:
- On load with `?post=<id>`, the calendar switches to Month view, selects that post's month, and focuses that post.
- An unknown/stale id is ignored without crashing; the param is cleared after it is consumed.
notes:
- Source: GF-13 in Notion.
- Code evidence: `jumpToPost(post)` already exists at app-v2/src/routes/client/calendar.tsx:479 and does exactly the month+slide+Month-view selection; wire it to a `useSearchParams` read in an effect.
- Technical scope: reuse `jumpToPost`; do not duplicate the selection logic.

### TASK-006: i18n copy for the friendly name + "view in calendar"
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-44-friendly-post-names
area: frontend
estimate: XS
depends_on: [TASK-003]
tags: [notion, gf-44, gf-13, i18n]
acceptance:
- Any new strings (e.g. `Post {n}`, the calendar-link tooltip/aria-label) exist in ES, DE, and EN.
- No hard-coded user-facing English remains in the touched components.
notes:
- Code evidence: app-v2/src/lib/i18n-dict.ts holds the ES/DE/EN dictionaries used via `useT()`.

## Verification

### TASK-007: Verify, changelog, and ship to staging
status: in_progress
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-44-friendly-post-names
area: verification
estimate: S
depends_on: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006]
tags: [notion, gf-44, gf-13, verification, deploy]
acceptance:
- `cd app-v2 && npx tsc -b` and `npx vite build` pass; eslint clean on changed files.
- `cd deploy-staging/api && npx tsc --noEmit` passes.
- Browser preview: Approvals shows "Post N — Title"; clicking it lands on that post in the Content Calendar; `approve <id>` copy still uses the real ID.
- Dated entry added to the top of app-v2/src/lib/changelog.ts (user-facing).
- Independent cross-vendor review (codex) is PASS; GF-44 and GF-13 moved to "Done in Staging".
notes:
- Process: new-task-workflow steps 5–7; independent-review before merge to `experimental`.
- Branches: `claude/gf-44-friendly-post-names` (naming) + `claude/gf-13-approvals-calendar-link` (link); both off `origin/experimental`. Can ship together in one PR since the clickable name depends on the friendly name.

---
project: GF-106 — Strategy link revision UX + split feedback panel
updated: 2026-08-20
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
default_group: item
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008]
items:
  - gf-106: Strategy link — company-named title, swipe-deck default, mandatory change comment, labelled continuing copy, split feedback panel | priority: high
---

# Plan

## Simple Words

The Share Strategy link is the page a client opens to approve the *plan* for the
month — the topics, formats, networks and timing — before anything is designed.
It shipped last night as a plain text list. Six things change.

The header will say **"Strategy Revision — «Company»"**, so the client sees whose
strategy this is instead of a generic link title.

The page will open as a **card deck**, one post at a time, swipe right to approve
and left to request changes — exactly like the content review link the same
client uses later. A small toggle in the header switches back to the old list.
Dragging a card only animates the swipe; it never reorders the plan and never
moves a post to a different date.

When the client requests changes they now **must write why**. The send button
stays greyed out until they type something. Approving stays one click.

The post text will be clearly **labelled as the copy**, so nobody reads it as the
description of the picture. And "see the text" now **continues** the few lines
already on screen instead of restarting the text from the first word.

Finally, on our side of the dashboard, the External feedback box under each post
splits into **two clearly separated sections** — what the client said about the
posts, and what they said about the strategy — so we know whether they were
reacting to the finished creative or to the plan.

Not in scope: no images are added to the strategy page (that rule stays), no
drag-to-reschedule, no change to how the team approves posts internally, and no
production promotion.

## Decisions and API Contracts

### TASK-001: Tag review feedback rows with the originating link view
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: claude/gf-106-feedback-split
area: api
estimate: M
depends_on: []
tags: [gf-106, api, review]
acceptance:
- `GET /clients/:slug/review-feedback` returns a `view` field of `"content"` or `"strategy"` on every decision entry and every comment entry.
- A row whose `linkId` no longer resolves to a `review_links` record is returned with `view: "content"` and is NOT dropped from the response.
- A `review_links` record with no `view` field (every link created before GF-105) yields `view: "content"`.
- A new unit test alongside `deploy-staging/api/src/routes/reviewPublic.strategy.test.ts` covers all three cases above.
- `npx tsc --noEmit` in `deploy-staging/api` passes with no new errors.
notes:
- Source: GF-106 in Notion (Proposed change item 6).
- Code evidence: the handler is `deploy-staging/api/src/routes/reviewLinks.ts:420`. It already reads `review_events` (filtered to `postId != "" && (kind="approved" || kind="changes_requested")`) and `review_comments`, both of which carry `linkId`.
- Implementation: fetch the client's `review_links` once into a `Map<linkId, view>` and stamp each decision/comment as it is bucketed. Do NOT filter by view server-side — the dashboard needs both.
- Gotcha (memory: platform-gotchas): these PB collections have no autodate `created`; keep sorting by the text `createdAt` we write ourselves.
- The `view` union type already exists as `ReviewLinkView` in `app-v2/src/lib/api-client.ts`; mirror the same literal union on the API side rather than a bare string.

## Backend Implementation

### TASK-002: Split the dashboard External feedback panel into Posts and Strategy
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: claude/gf-106-feedback-split
area: frontend
estimate: M
depends_on: [TASK-001]
tags: [gf-106, dashboard, review]
acceptance:
- `ReviewFeedbackComment` and the decision entry type in `app-v2/src/lib/api-client.ts` carry an optional `view?: 'content' | 'strategy'`; absent is treated as `content` so an un-upgraded API never blanks the panel.
- `ExternalFeedbackPanel` renders two visually differentiated sections with their own headings — one for content-link feedback, one for strategy-link feedback.
- A post with feedback from only one kind of link renders only that section (no empty heading).
- The `ReviewSignals` badge row keeps counting all feedback regardless of view — it is a single at-a-glance count, not a split.
- `npx tsc -b` and `npx vite build` in `app-v2` pass.
notes:
- Source: GF-106 in Notion, clarified by Martin on 2026-08-20 ("the Feedback tab ... two sections, one for the posts and one for the strategy, and they should be differentiated").
- Code evidence: `app-v2/src/routes/client/calendar.tsx:1657` is `ExternalFeedbackPanel`; `:1612` is `ReviewSignals`; the loader is `apiLoadReviewFeedback` at `app-v2/src/lib/api-client.ts:1057`, whose catch-all fallback `{ byPost: {}, general: { comments: [] } }` must keep working unchanged.
- Differentiation should be structural (separate bordered sections + heading + icon), not colour alone — the dashboard is used in light and dark.

## Frontend Implementation

### TASK-003: Name the company in the strategy link header
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: claude/gf-106-strategy-review-ux
area: frontend
estimate: XS
depends_on: []
tags: [gf-106, review, external]
acceptance:
- With `payload.brand.name` present, the header H1 reads the equivalent of "Strategy Revision — «Company»" in the active locale.
- With no brand on the payload, the header falls back to `payload.link.title`, and to `review.strategy.title` when that is empty too — i.e. today's behaviour, never a dangling dash.
- The string is a single i18n key with a `{company}` variable, not concatenated in JSX.
notes:
- Source: GF-106 in Notion (Proposed change item 1).
- Code evidence: the header is `app-v2/src/routes/review/strategy-view.tsx`, in `StrategyReviewShell`, currently `payload.link.title || t('review.strategy.title')`. `PublicReviewBrand { name, handle, logoInitials }` is already on the payload (`api-client.ts:1099`) and already reaches the content deck — no API change needed.
- Note the eyebrow above the H1 already says "Strategy review"; do not duplicate the word twice in a row — adjust the eyebrow if the result reads redundantly.

### TASK-004: Add a swipe card deck to the strategy link and make it the default view
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: claude/gf-106-strategy-review-ux
area: frontend
estimate: L
depends_on: [TASK-003]
tags: [gf-106, review, external, deck]
acceptance:
- `StrategyReviewShell` holds a `mode: 'deck' | 'list'` state initialised to `'deck'`, with a header toggle identical in placement and styling to the content link's.
- Deck mode shows one post per card with the same fields the list row shows (date, title, pillar, format, platforms, visual description, copy), progress bar on top, and the month grids + overall verdict on the end-of-deck summary screen.
- Swiping right (or the accept button, or ArrowRight) records `approved`; swiping left (or the changes button, or ArrowLeft) opens the change-request sheet.
- Dragging a card never changes a post's date, order, or any server state — it is presentation only.
- List mode renders exactly today's page, unchanged.
- No `<img>`, background-image, lightbox or mockup is introduced anywhere in the new code — the strategy page's hard rule.
- `npx tsc -b` and `npx vite build` in `app-v2` pass.
notes:
- Source: GF-106 in Notion (Proposed change item 2). Martin clarified on 2026-08-20 that "drag and drop" means the Tinder-style swipe the content link already has — visual only, and the deck is the DEFAULT.
- Code evidence to mirror, not to import blindly: `app-v2/src/routes/review/external.tsx:483` (`mode` state), `:524-546` (the toggle markup), `:591` (`DeckView`: index/exitDir/busy/sheetOpen, `accept`/`requestChanges`/`skip`, the ArrowLeft/ArrowRight keyboard parity, the `AnimatePresence` card stack), and `SWIPE_COMMIT` near `:62`.
- The content deck's card renders artwork and platform mockups, which the strategy page must not. Build a `StrategyDeckCard` that reuses the existing row's field rendering; extract the shared field rendering out of `StrategyRow` so deck and list cannot drift.
- `framer-motion` is already a dependency (`motion`, `useMotionValue`, `useTransform`, `useReducedMotion`). Honour `useReducedMotion` as the content deck does.
- Keep the file split intact: the deck belongs in `strategy-view.tsx` or a new sibling under `routes/review/`, never merged into the 1435-line content shell.

### TASK-005: Require a written comment before a change request is sent
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: claude/gf-106-strategy-review-ux
area: frontend
estimate: S
depends_on: [TASK-004]
tags: [gf-106, review, external]
acceptance:
- In `RejectSheet`, the submit control is disabled while the combined reason chips + free text are empty, and `onSubmit` can no longer be called with `undefined`.
- `decide(postId, 'changes_requested')` is never invoked without a comment from any entry point — deck swipe-left, deck button, keyboard ArrowLeft, list button.
- Approving a post still takes one click and still accepts an optional comment.
- The overall (end-of-review) verdict keeps its own current rules; this task does not change it.
- The sheet's hint text tells the reviewer a reason is required, in EN, DE and ES.
notes:
- Source: GF-106 in Notion (Proposed change item 3). Martin chose "block it — button disabled until they type" over warn-and-allow on 2026-08-20.
- Code evidence: `app-v2/src/routes/review/external.tsx:919` is `RejectSheet`; its `submit()` at `:944` currently passes `undefined` when nothing was written. `reasonKeys` at `:935` means a chip alone already counts as a reason — a selected chip satisfies the requirement, an empty sheet does not.
- This sheet is shared with the CONTENT link. The change therefore applies to both link kinds; that is intended and consistent, and is recorded as such in the Notion item.
- The strategy list view at `strategy-view.tsx` `StrategyRow.onDecide` calls `decide` directly with no comment — that path must be routed through the same sheet or given the same guard.

### TASK-006: Label the copy block and make "see text" continue the preview
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: claude/gf-106-strategy-review-ux
area: frontend
estimate: M
depends_on: [TASK-004]
tags: [gf-106, review, external, copy]
acceptance:
- Wherever the post text appears on the strategy page it carries a visible label identifying it as the post copy.
- Expanding the copy continues the text already visible: the clamped opening lines stay in place and the remainder is revealed below/after them. The reader never sees the opening words re-render from the first character or jump position.
- Collapsing returns to the clamped preview without a scroll jump.
- The "no authored visual brief" case keeps its current meaning: the copy standing in for a missing brief is still muted and still reads as a fallback, not as a real brief — but it is now labelled as copy rather than unlabelled.
- Both deck and list modes get the same treatment via the shared field rendering from TASK-004.
notes:
- Source: GF-106 in Notion (Proposed change items 4 and 5). Martin's wording: "under platforms it should be written which ... that's a copy. And if you click on see the text, you should actually continue seeing the text, not from zero, but the continuation."
- Code evidence: two separate places render the copy today and they conflict. `strategy-view.tsx` renders the fallback preview as a `line-clamp-3` muted italic paragraph (the `brief.kind === 'fallback'` branch), and *separately* the `post.copy && ...` block toggles `showCopy` to render the full copy from the start in its own box. That is exactly the "restarts from zero" complaint.
- Implementation direction: one copy element. Clamp it with `line-clamp-3` collapsed and remove the clamp when expanded, so the DOM node and its opening lines are continuous. Do not swap between two different paragraphs.
- `visualBrief()` in `strategy-view.tsx` decides brief-vs-fallback; keep that logic, change only how the fallback is presented and labelled.

### TASK-007: Complete EN / DE / ES coverage for every new string
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: claude/gf-106-strategy-review-ux
area: frontend
estimate: S
depends_on: [TASK-003, TASK-004, TASK-005, TASK-006]
tags: [gf-106, i18n]
acceptance:
- Every key added by TASK-002 through TASK-006 exists in all three locale blocks of `app-v2/src/lib/i18n-dict.ts`.
- No hardcoded user-facing English string is introduced in any file this plan touches.
- A grep for keys added in the EN block finds the same count in the DE and ES blocks.
notes:
- Source: GF-106 acceptance criteria.
- Code evidence: the existing `review.strategy.*` block starts at `i18n-dict.ts:962` (EN) and `:1932` (DE); ES follows the same shape. GF-105 added 30 keys across all three, and commit 58378bc was a dedicated fix for i18n gaps — this project has a history of English leaking into DE/ES, so treat this as a real task, not a formality.
- TASK-002 lives on a different branch and adds its own keys in the same file; whichever branch merges second must rebase and re-run the count check before merge.

## Verification

### TASK-008: Verify on live staging and close the loop
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: none
area: verification
estimate: M
depends_on: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007]
tags: [gf-106, verification, staging]
acceptance:
- Layer-5 independent review (GLM 5.2 via OpenRouter) returns PASS on both branches.
- Changelog entry added at the TOP of `app-v2/src/lib/changelog.ts` with the actual staging deploy date.
- Staging boundary verified live, not from green CI: API-mode bundle present in `app-dist/assets/api-client*.js`, `/api/v1/health` reports `pb:"up"`, clients list non-empty.
- On `staging-demo`: a strategy link is created and opened, the deck is confirmed as the default view, a post is approved by swipe, a change request is confirmed impossible without a comment and then sent with one, the copy label and continuing expansion are confirmed, and the resulting feedback is confirmed to appear under the Strategy section (not the Posts section) of the dashboard panel. All created ids recorded and cleaned up in the same run.
- A content link on the same client is opened to confirm it still renders as content and its feedback lands under the Posts section.
- Notion GF-106 moved to "Done in Staging" with a Release note.
notes:
- Source: ship-gf-task Phases 5-8, HIGH tier (read AND write paths + rollback note).
- Rollback note: both branches are additive. The API change is a response-field addition with a safe default; reverting the SPA branches restores the previous strategy page with no data migration.
- Prod promotion is explicitly NOT part of this plan — that is a separate human-triggered `promote-staging-to-prod` run.

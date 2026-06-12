---
project: GF-4 Review Page v3 — swipe deck + feedback in the dashboard
updated: 2026-06-12
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
default_group: item
items:
  - gf-4: Collaboration layer | priority: high
---

# Plan

Third iteration of the GF-4 external review experience plus first-class
surfacing of reviewer feedback inside the dashboard. Decisions confirmed by
Martin (2026-06-12): swipe deck is the reviewer's DEFAULT view (list stays as a
secondary toggle); swiping left prompts an OPTIONAL comment with quick reasons;
the dashboard shows badges on calendar cards plus the full feedback thread in
the post detail; finishing the deck shows a summary screen with the overall
verdict. Reviewer decisions remain signals only (review_events — never
approvals_v2 or post status). Branch: `feat/gf4-review-page-v3` off
`experimental`, merged back at the end.

## Backend Implementation

### TASK-001: Dashboard review-feedback aggregation endpoint
status: done
owner: claude
agent: claude
area: backend
estimate: S
depends_on: []
tags: [gf-4, api, review]
acceptance:
- GET /clients/:slug/review-feedback (bearer dash/admin) returns per-post reviewer feedback across ALL of the client's review links: decisions (latest per reviewer per postId, with reviewerName, decision, createdAt) and comments (id, linkId, postId, reviewerName, body, source, status, createdAt).
- Response shape is { byPost: { [postId]: { decisions: [...], comments: [...] } }, general: { comments: [...] } } so the calendar can index by post in O(1).
- PB query failures degrade to empty objects, never 500.
notes:
- Source: GF-4 in Notion (Collaboration layer).
- Code evidence: deploy-staging/api/src/routes/reviewLinks.ts already queries review_events/review_comments per link; this aggregates by slug instead.
- Sort by the text `createdAt` field, NOT `created` (collections have no autodate field — see 2026-06-12 bugfix 382a02a).

## Frontend Implementation — dashboard

### TASK-002: api-client — review feedback types + loader
status: done
owner: claude
agent: claude
area: frontend
estimate: XS
depends_on: [TASK-001]
tags: [gf-4, api-client]
acceptance:
- apiLoadReviewFeedback(slug) returns the typed byPost/general structure; errors resolve to an empty structure.
notes:
- Code evidence: app-v2/src/lib/api-client.ts (~line 690 review types).

### TASK-003: Calendar — reviewer badges + feedback thread on the post
status: done
owner: claude
agent: claude
area: frontend
estimate: M
depends_on: [TASK-002]
tags: [gf-4, ui, calendar]
acceptance:
- CompactPostCard (week/quarter views) and the month-view thumbnail strip show a small indicator per post: ✓ (any reviewer approved), ✎ (changes requested), and a 💬 count of reviewer comments; nothing renders when there is no feedback.
- The month slide view shows an "External feedback" section for the active post: reviewer decisions as chips (name + decision) and the comment thread (reviewer vs team styling), with a reply box that posts via apiReplyReviewComment using the comment's linkId.
- Reviewer signals are visually distinct from the internal Approve/Reject controls and never change internal status.
- Feedback loads once per calendar mount (no per-card requests) and refreshes after a reply.
notes:
- Code evidence: app-v2/src/routes/client/calendar.tsx — CompactPostCard usage (~line 476, 526), thumbnail strip (~line 728), CopyPane slide (~line 563); review-share-dialog.tsx Activity tab stays as the chronological feed.
- Conflicting decisions across reviewers: show ALL reviewers' latest chips, no aggregation verdict.

## Frontend Implementation — external review page

### TASK-004: Image lightbox on the external page
status: done
owner: claude
agent: claude
area: frontend
estimate: S
depends_on: []
tags: [gf-4, ui, review]
acceptance:
- Tapping/clicking the post image (in deck card, list card, and details view) opens a full-screen lightbox (dark backdrop, image object-contain, close on backdrop/Esc).
- Carousel posts page through slides inside the lightbox.
notes:
- Code evidence: app-v2/src/routes/client/calendar.tsx already has a zoom Dialog + LightboxCarousel pattern (~line 777) to mirror; external page is app-v2/src/routes/review/external.tsx.

### TASK-005: Swipe deck — one post at a time with gesture + button decisions
status: done
owner: claude
agent: claude
area: frontend
estimate: L
depends_on: [TASK-004]
tags: [gf-4, ui, review, deck]
acceptance:
- Deck shows one post card at a time with progress ("3 / 8") and the platform mockup (fallback: details layout) plus a details flip/expand.
- Swipe right (framer-motion drag, threshold + velocity) or Accept button records approved for that post; swipe left or Request-changes button opens a bottom sheet "What should change?" with quick-reason chips (wording / image / timing) + optional free text + Skip; submitting records changes_requested (and a review comment when text/reasons given).
- Desktop parity: visible Accept/Request-changes buttons and ←/→ keyboard support; cards animate off in the chosen direction.
- A decided card shows its badge when revisited (back navigation) and the decision can be changed (latest wins, same as today).
notes:
- Reuses POST /review/:publicId/decision with postId and /comment — no new public API.
- Code evidence: app-v2/src/routes/review/external.tsx PostReviewCard (tabs, decide(), comment box); framer-motion already a dependency (motion import).
- Comment from the reject sheet posts via existing reviewComment() with postId; quick reasons are prefixed into the body text (no schema change).

### TASK-006: Deck as default + list toggle + end-of-deck summary with overall verdict
status: done
owner: claude
agent: claude
area: frontend
estimate: M
depends_on: [TASK-005]
tags: [gf-4, ui, review]
acceptance:
- After the code gate, reviewers land in the deck; a header toggle switches Deck ↔ List (current scroll view, kept fully functional incl. per-post buttons and comments).
- After the last card, a summary screen recaps decisions (n accepted / n changes requested / n skipped) with tappable rows to revisit a post, and presents the overall verdict (approve / request changes + note) as the closing step — same overall /decision call as today.
- Posts skipped in the deck are clearly marked in the summary; the reviewer can finish without deciding every post.
notes:
- Code evidence: app-v2/src/routes/review/external.tsx ReviewBody owns the overall verdict block (~line 272) — summary screen reuses submitDecision.

### TASK-007: i18n for deck, reject sheet, summary, lightbox, dashboard feedback (ES/DE/EN)
status: done
owner: claude
agent: claude
area: frontend
estimate: XS
depends_on: [TASK-003, TASK-006]
tags: [gf-4, i18n]
acceptance:
- All new UI strings resolve in ES, DE and EN; no raw keys rendered in either the external page or the calendar.
notes:
- Code evidence: app-v2/src/lib/i18n-dict.ts review.ext.* / review.* blocks.

## Verification

### TASK-008: Typecheck, build, and browser walkthrough (deck + dashboard)
status: done
owner: claude
agent: claude
area: verification
estimate: M
depends_on: [TASK-007]
tags: [gf-4, verify]
acceptance:
- deploy-staging/api npm run typecheck passes; app-v2 build (tsc -b + vite) passes.
- Browser (stub API): reviewer flow — gate → deck with progress → swipe right accepts → swipe left opens sheet, quick reason + text recorded → image lightbox opens/closes → summary shows counts → overall verdict submits → list toggle still works; decisions persist after reload.
- Browser (stub API): dashboard — calendar badges render in week/quarter/thumbnail strip, month view shows the feedback thread, team reply posts and appears.
notes:
- Mirror the v2 stub-API verification approach (node http stub + vite dev with VITE_API_BASE).

### TASK-009: Merge to experimental, deploy, staging smoke test
status: todo
owner: claude
agent: claude
area: deployment
estimate: S
depends_on: [TASK-008]
tags: [gf-4, deploy]
acceptance:
- Branch merged to experimental; CI deploy green; live staging review link walks the deck end-to-end on a real link; dashboard shows the resulting feedback.
- Notion GF-4 decision log updated.
notes:
- Per new-task-workflow: never commit directly on experimental.

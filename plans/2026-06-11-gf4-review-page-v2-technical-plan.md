---
project: GF-4 Review Page v2 â€” platform previews + per-post decisions
updated: 2026-06-11
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
default_group: item
items:
  - gf-4: Collaboration layer | priority: high
---

# Plan

Improve the GF-4 external review page (`/review/:publicId`): platform-accurate
previews (Instagram/LinkedIn mockups per the post's chosen channel) behind a
Preview/Details tab, plus per-post Accept / Request-changes buttons. Reviewer
decisions stay **signals only** (recorded as `review_events`, never touching
`approvals_v2` or post status). The auto-generated access-code gate is kept
unchanged. Branch: `feat/gf4-review-page-v2` off `experimental`, merged back at
the end.

## Backend Implementation

### TASK-001: Extend public decision endpoint with optional postId
status: done
owner: claude
agent: claude
area: backend
estimate: S
depends_on: []
tags: [gf-4, api, review]
acceptance:
- POST /review/:publicId/decision accepts an optional postId (validated, max 100 chars) and records the decision event with that postId.
- A per-post decision does NOT create the "Review decision â€”" general comment (that stays for the overall verdict only).
- Decisions still never write approvals_v2 or mutate posts.
notes:
- Source: GF-4 in Notion (Collaboration layer).
- Code evidence: deploy-staging/api/src/routes/reviewPublic.ts decisionSchema + /decision handler; recordEvent() already supports postId + kind approved/changes_requested.

### TASK-002: Expose brand block and per-post decisions in the review payload
status: done
owner: claude
agent: claude
area: backend
estimate: S
depends_on: [TASK-001]
tags: [gf-4, api, review]
acceptance:
- buildReviewPayload returns brand { name, handle, logoInitials } read from the client's plan.json client block (display-only; nothing from brief/goals/strategy).
- buildReviewPayload returns postDecisions: latest decision per postId for this link, derived from review_events (reviewerName, decision, createdAt).
- Missing plan.json or events never break the payload (safe fallbacks).
notes:
- Code evidence: deploy-staging/api/src/routes/reviewPublic.ts buildReviewPayload; deploy-staging/api/src/diskData.ts plan(slug) reads clients/<slug>/plan.json with client.name/handle/logoInitials (see app-v2/src/types/plan.ts).

## Frontend Implementation

### TASK-003: api-client â€” per-post decision support + payload types
status: done
owner: claude
agent: claude
area: frontend
estimate: XS
depends_on: [TASK-002]
tags: [gf-4, api-client]
acceptance:
- PublicReviewPayload type gains brand and postDecisions fields.
- reviewDecision() accepts an optional postId and sends it.
notes:
- Code evidence: app-v2/src/lib/api-client.ts reviewDecision + PublicReviewPayload (~line 780-886).

### TASK-004: ChannelMockup adapter for sanitized review posts
status: done
owner: claude
agent: claude
area: frontend
estimate: S
depends_on: []
tags: [gf-4, ui, mockup]
acceptance:
- The external page can render InstagramMockup/LinkedinMockup from a PublicReviewPost (hashtags default to [], no metrics passed so no fake numbers).
- Channels without a mockup (or missing channel) fall back to the details card.
notes:
- Code evidence: app-v2/src/components/channel-mockup/{index,instagram,linkedin}.tsx take post: Post; PublicReviewPost in api-client.ts is a compatible subset except hashtags is optional.

### TASK-005: External review page â€” Preview/Details tabs + per-post decisions
status: done
owner: claude
agent: claude
area: frontend
estimate: M
depends_on: [TASK-003, TASK-004]
tags: [gf-4, ui, review]
acceptance:
- Each post card shows tabs: Preview (default, platform mockup per post.channel) and Details (current copy/hashtags/CTA view).
- Each post card has Accept / Request changes buttons; submitting shows a decision badge and allows changing the decision (latest wins).
- Existing per-post comments and the overall "finish review" verdict + note remain functional.
notes:
- Code evidence: app-v2/src/routes/review/external.tsx PostReviewCard + ReviewBody.

### TASK-006: i18n keys for tabs, per-post decisions, badges (ES/DE/EN)
status: done
owner: claude
agent: claude
area: frontend
estimate: XS
depends_on: [TASK-005]
tags: [gf-4, i18n]
acceptance:
- All new UI strings resolve in ES, DE and EN (no raw keys rendered).
notes:
- Code evidence: app-v2/src/lib/i18n-dict.ts holds review.ext.* keys.

### TASK-007: Dashboard share dialog â€” label per-post decision events
status: done
owner: claude
agent: claude
area: frontend
estimate: XS
depends_on: [TASK-001]
tags: [gf-4, ui, dashboard]
acceptance:
- Events with kind approved/changes_requested and a postId render with a clear label (reviewer + decision + post) in the share dialog activity list.
notes:
- Code evidence: app-v2/src/components/review-share-dialog.tsx renders ReviewEvent list (~line 342-355).

## Verification

### TASK-008: Typecheck, build, and browser walkthrough of the reviewer flow
status: done
owner: claude
agent: claude
area: verification
estimate: S
depends_on: [TASK-005, TASK-006, TASK-007]
tags: [gf-4, verify]
acceptance:
- deploy-staging/api: npm run typecheck passes.
- app-v2: pnpm build (tsc -b + vite) passes.
- Browser preview: open a review link with the code, see the mockup tab, switch tabs, accept one post, request changes on another, post a comment, submit the overall verdict; decision badges persist after refresh.
notes:
- Verify against a locally running API or staging data per repo conventions.

### TASK-009: Merge feat/gf4-review-page-v2 into experimental
status: done
owner: claude
agent: claude
area: deployment
estimate: XS
depends_on: [TASK-008]
tags: [gf-4, deploy]
acceptance:
- Branch merged to experimental; CI deploys staging.
- Notion GF-4 decision log notes the v2 review page shipped to staging.
notes:
- Per new-task-workflow: never commit directly on experimental; PR or fast-forward merge.

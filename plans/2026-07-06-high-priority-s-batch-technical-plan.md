---
project: High-Priority S Batch (GF-65/66/68/72/73/74)
updated: 2026-07-06
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
items:
  - gf-65: AI Generated msg in the Collaboration Link and in the Content Calendar | priority: high
  - gf-66: Give Viktor access to the external feedback comments with the API (read and reply) | priority: high
  - gf-68: Be able to load images or documents also in the chat in the dashboard | priority: high
  - gf-72: Content calendar: video preview must render as a playable reel showing real content | priority: high
  - gf-73: Reload button not working (regression) | priority: high
  - gf-74: General comment cannot be read completely | priority: high
---

# Plan

## Simple Words

- Six small, high-priority items move into work at once. Three are bug fixes a
  client can see (video previews that don't play, a reload button that stopped
  working, a client comment that gets cut off), and three are small features
  (an "AI generated" label on AI-made images/videos, letting Viktor read and
  answer client feedback from the review link, and letting Martin/Pilar attach
  images or documents in the dashboard chat).
- The external reviewer keeps using the same limited review link — nothing new
  to log into. Viktor's replies will simply appear in that comment thread,
  clearly marked as coming from the team/Viktor.
- Not included yet: automatic triggers (Viktor only processes feedback when
  asked in chat), and any decision about what Viktor *does* with uploaded chat
  files beyond using them as context — that choice is an explicit task here.
- Everything ships branch-per-task off `experimental` to staging first; prod
  promotion is a separate later step.

## Decisions and API Contracts

### TASK-001: Decide v1 behavior for files uploaded in dashboard chat
status: todo
owner: martin
agent: human
reviewer: human
branch: none
area: decisions
estimate: XS
depends_on: []
tags: [notion, gf-68, chat, planning]
acceptance:
- Martin confirms (or amends) the suggested v1: uploaded file lands in the chat thread and is passed to Viktor as context/reference (image → reference for generation; document → readable context), nothing more.
- The decision is recorded in the Notion GF-68 page body and in this task's notes.
notes:
- Source: GF-68 in Notion — backlog review 2026-07-05 left this open ("Martin: not sure").
- Suggested v1 from the backlog review is the default if Martin does not object; build tasks below assume it.

### TASK-002: Add aiGenerated flag to the media contract and set it in the agent write path
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-65-ai-generated-flag
area: backend
estimate: S
depends_on: []
tags: [notion, gf-65, api, data-contract]
acceptance:
- Media items created via Viktor's image/video generation tools carry aiGenerated: true through the write contract; manually uploaded assets do not.
- The client bundle and the public review payload expose the flag to both frontends.
- Existing posts without the flag render unchanged (flag absent = no label).
notes:
- Source: GF-65 in Notion (refined 2026-07-05 — label on AI-generated media in both views, EN/DE/ES).
- Code evidence: no ai_generated/aiGenerated flag exists anywhere in deploy-staging/api/src (grep 2026-07-06); agent media writes go through deploy-staging/api/src/routes/viktorOwned.ts.
- Technical scope: contract first — UI task TASK-003 depends on this.

## Backend Implementation

### TASK-004: Open review-comment read+reply routes to the agent role
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-66-agent-review-comments
area: backend
estimate: S
depends_on: []
tags: [notion, gf-66, api, review-links]
acceptance:
- With an agent token scoped to the client, GET review-links, GET review-links/:id/comments, GET review-feedback, and POST review-links/:id/comments succeed; cross-client agent tokens still get 403.
- A reply posted by the agent is attributed clearly (actor label "Viktor" / agent label, source dashboard) and appears in the external review-link thread.
- Audit entries record the agent actor for reads-with-write and replies as they do for dashboard users.
notes:
- Source: GF-66 in Notion (refined 2026-07-05 — manual trigger via dashboard chat only, no auto-wake in v1).
- Code evidence: deploy-staging/api/src/routes/reviewLinks.ts:231/252/405 use requireRole('dash','admin') — 'agent' is excluded; role model in auth.ts:21; viktorOwned.ts:119 shows the requireRole('dash','admin','agent') pattern to copy.
- Code evidence: external thread renders source 'dashboard' comments as "team" — app-v2/src/routes/review/external.tsx CommentRow (line 290).

### TASK-005: Give Viktor a feedback-processing recipe (list, read, reply)
status: todo
owner: codex
agent: claude
reviewer: codex
branch: claude/gf-66-viktor-feedback-skill
area: agent
estimate: S
depends_on: [TASK-004]
tags: [notion, gf-66, agent-skills, viktor]
acceptance:
- Asking Viktor in the dashboard chat "check the new feedback on <client/post>" makes him list open external comments via the API and summarize them.
- Asking Viktor to reply posts the reply through the API and it shows up in the live external review link.
- No automatic trigger exists — behavior only runs when asked.
notes:
- Source: GF-66 in Notion.
- Code evidence: canonical agent skills live in agent-skills/ (core+clients) and sync via sync-agent-skills.sh; Viktor already calls the write-contract API from plugins (deploy-prod/gf-innov-agent).
- Technical scope: prefer a skill/API-recipe over a new plugin tool if the generic HTTP tooling suffices; decide in-branch.

### TASK-006: Stop truncating the general review comment at 300 chars
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-74-general-comment-full
area: backend
estimate: S
depends_on: []
tags: [notion, gf-74, api, review-links]
acceptance:
- A general comment longer than 300 characters submitted through the review link is stored and returned in full through every surface that displays it (external link thread, dashboard feedback panel, activity feed preview may stay short but must not be the only copy).
- Reproduction recorded first: confirm on staging which path truncates (decision-note → review_events.preview at 300 chars vs. plain comment) before fixing.
notes:
- Source: GF-74 in Notion (refined 2026-07-05 — scope is both fixes; TASK-007 covers the per-post display half).
- Code evidence: deploy-staging/api/src/routes/reviewPublic.ts:200 slices activity preview to 300 chars; decision note (max 20_000, reviewPublic.ts:48) survives only inside that preview for per-link decisions — review_comments bodies are NOT truncated (reviewLinks.ts:405-461).
- Technical scope: likely fix = persist the full note as a review_comments row (postId empty) alongside the event, so existing display paths pick it up.

### TASK-011: Accept chat attachments in the API and pass them to Viktor as context
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-68-chat-attachments-api
area: backend
estimate: S
depends_on: [TASK-001]
tags: [notion, gf-68, api, chat]
acceptance:
- The chat send path accepts an uploaded image or document (bounded size/type allowlist), stores it, and returns a public/authed URL.
- The attachment URL (plus filename/type) is included in the message sent to the Hermes run so Viktor receives it as context/reference per the TASK-001 decision.
- Oversized or disallowed files return a clear 4xx, not a crash (zod 422 discipline).
notes:
- Source: GF-68 in Notion.
- Code evidence: deploy-staging/api/src/routes/chat.ts POST run path is JSON-only today; deploy-staging/api/src/routes/assetFiles.ts already handles file upload + extension allowlisting — reuse its storage path rather than inventing a new one.

## Frontend Implementation

### TASK-003: Show an "AI generated" label on AI media in calendar and review link (EN/DE/ES)
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-65-ai-generated-label
area: frontend
estimate: S
depends_on: [TASK-002]
tags: [notion, gf-65, ui, i18n]
acceptance:
- Media flagged aiGenerated shows a small "AI generated" badge in the content-calendar post preview/mockups and in the external collaboration link.
- The label is localized in EN/DE/ES via the existing i18n dictionaries (app-v2 i18n-dict.ts and the review page's t()).
- Non-flagged media shows no badge; layout unchanged.
notes:
- Source: GF-65 in Notion.
- Code evidence: calendar media rendering in app-v2/src/routes/client/calendar.tsx (~1068/1496/2092) and channel mockups app-v2/src/components/channel-mockup/instagram.tsx / linkedin.tsx; external view app-v2/src/routes/review/external.tsx PostContent (line 308).

### TASK-007: Repeat the general comment under each shared post in the review link
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-74-general-comment-per-post
area: frontend
estimate: S
depends_on: [TASK-006]
tags: [notion, gf-74, ui, review-links]
acceptance:
- In the external review link, each shared post card shows the general comment(s) beneath it (clearly marked as applying to all posts), in addition to the overall comments section.
- Long comments wrap/expand fully — no clamping.
notes:
- Source: GF-74 in Notion.
- Code evidence: app-v2/src/routes/review/external.tsx:1148 already computes generalComments (comments with no postId) and renders them only in the overall section (line 1191-1204); per-post cards render via PostContent/CommentRow.

### TASK-008: Fix content-calendar reload button regression
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-73-reload-button
area: frontend
estimate: S
depends_on: []
tags: [notion, gf-73, bug, regression]
acceptance:
- Reproduction on staging recorded first (systematic-debugging): change a post status via the API, click reload, confirm current failure mode before touching code.
- After the fix, clicking the reload button reflects API/agent-made changes (e.g. a post moved to in_review) without a full page refresh.
- The GF-29 no-skeleton behavior is preserved (reload must not unmount the chat panel mid-stream).
notes:
- Source: GF-73 in Notion — regression of GF-41 ("Actualizar" button, Done in Main).
- Code evidence: button at app-v2/src/routes/client/calendar.tsx:620-629 calls refetch(); app-v2/src/hooks/use-client.ts:25-61 bumps tick and re-runs loadClient with the same-slug loading-skip guard (candidate culprit); apiGet uses cache:'no-store' (app-v2/src/lib/api-client.ts:196) so HTTP caching is unlikely.
- Suspect window: the guard or a data-identity check added around GF-29/GF-64 may be swallowing the refreshed bundle.

### TASK-009: Make video posts preview as a playable 9:16 reel with the real .mp4
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-72-video-reel-preview
area: frontend
estimate: S
depends_on: []
tags: [notion, gf-72, bug, video]
acceptance:
- Reproduction on staging recorded first: open the preview of a real Viktor-generated video post and record what renders (static thumbnail vs playable video) and what post.media contains.
- After the fix, the post preview renders vertical 9:16 with a visible play control and plays the actual .mp4 (not a generic/static thumbnail).
- Image-only and carousel posts are unaffected.
notes:
- Source: GF-72 in Notion.
- Code evidence: app-v2/src/components/channel-mockup/instagram.tsx:13-45 already renders <video src={video.url}> when post.media has a type 'video' item with url — so the bug is likely the data shape (video stored without media type 'video'/url on some paths) or a preview surface that ignores it; calendar.tsx renders <video> at ~1068/1496/2092.
- Technical scope: fix where the reproduction points — data write path vs preview component — smallest change wins.

### TASK-012: Add file/image upload to the dashboard chat UI
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-68-chat-attachments-ui
area: frontend
estimate: S
depends_on: [TASK-011]
tags: [notion, gf-68, ui, chat]
acceptance:
- The chat panel offers an attach control (file picker; images and common documents), shows the pending attachment before send, and renders it in the sent message bubble.
- Sending with an attachment reaches Viktor and he can act on it (e.g. use an image as reference) per the TASK-001 decision.
- Upload errors (size/type/network) surface inline in the chat without breaking the stream.
notes:
- Source: GF-68 in Notion.
- Code evidence: app-v2/src/components/chat-sheet.tsx has no upload/attach support today (grep 2026-07-06); it already renders inline images from URLs in assistant messages (line ~777), so the display half mostly exists.

## Verification

### TASK-010: Staging verification pass + independent review for the batch
status: todo
owner: martin
agent: claude
reviewer: glm-5.2
branch: none
area: verification
estimate: S
depends_on: [TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009, TASK-011, TASK-012]
tags: [verification, staging, independent-review]
acceptance:
- Each merged branch is verified live on staging.marketing.gfinnov.com against its task's acceptance list, with evidence (screenshots/API responses) noted per GF item.
- The Layer-5 independent review (independent-review skill, GLM 5.2 via OpenRouter) passes for each branch before merge to experimental.
- Notion statuses move to Done in Staging per item as they pass.
notes:
- Batch gate — individual branches still run review before their own merge; this task is the roll-up check.
- PS gotcha for the review script: cast message content to [string] and run in background (see reference_independent_review_openrouter_ps_gotcha).

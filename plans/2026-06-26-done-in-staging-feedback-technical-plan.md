---
project: Done-in-Staging Feedback Fixes (GF-26/29/32/37/39)
updated: 2026-06-26
owner: Martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009]
items:
  - gf-26: Programmed = real scheduling via a provider port (Postiz as first adapter) | priority: medium
  - gf-29: Fix chat edits synchronization in Dashboard | priority: high
  - gf-32: Agent: Instagram font sizes and text density | priority: medium
  - gf-37: Handle approval of posts with past dates | priority: high
  - gf-39: Lenguage Tecnico | priority: medium
---

# Plan

## Simple Words

Martin tested five things on staging and left a comment on each saying what is
still broken. None of them are brand-new features — they are regressions or
"not fully done" follow-ups on work that already shipped to staging. This plan
turns each comment into concrete code fixes. All five Notion items were moved
from "Done in Staging" back to "In progress" so the board reflects that they
still need work.

What each comment asks for, in plain terms:

- **GF-26** — Posts now actually get published, but the text goes out with
  literal `\n` instead of real line breaks. Make published posts keep their real
  line breaks.
- **GF-29** — Two small things: the agent should tell the user "update the page
  to see the post" after generating an image, and the dashboard's "refresh"
  icon should be a more visible colour so people notice it.
- **GF-32** — The Instagram font-size / text-density rules exist somewhere but
  not where the agent reads them; put them into the image-generation skill.
- **GF-37** — You can still approve/schedule a post for a date in the past, and
  posts that are already published should be greyed out (read-only). Both still
  need to work.
- **GF-39** — Text that is hard-coded inside the Hermes agent still comes out in
  English; it must come out in Spanish for the current agents, and the
  agent-creation skill should ask which language a new agent should speak.

Not in scope yet: building any new provider beyond Postiz (GF-26's port already
exists), and any language beyond Spanish/the agent's configured language.

## Decisions and API Contracts

- "Comment" source of truth: each task below is driven by the exact Notion
  comment Martin left on 2026-06-26 (quoted in notes). Comments were read via the
  Notion comments API after the integration's "Read comments" capability was
  enabled.
- GF-26's newline bug overlaps GF-63 (separate Inbox item that fixed the
  agent-side Postiz plugin). There are TWO publish paths — the agent's Postiz
  plugin (GF-63 territory) and the API `SchedulingProvider` Postiz adapter
  (`deploy-staging/api/src/scheduling/postiz.ts`). Both must emit real newlines.
- For GF-37, "published" detection already exists (`isPublished()` in
  `app-v2/src/lib/post-status.ts`); the fix is to (a) reject past-dated
  scheduling and (b) make the published lane visibly read-only, not to invent a
  new status.

## Backend Implementation

### TASK-001: Normalize newlines in the API Postiz publish payload
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-26-postiz-newlines
area: backend
estimate: S
depends_on: []
tags: [gf-26, postiz, scheduling, newlines]
acceptance:
- The text sent to the Postiz public API in `deploy-staging/api/src/scheduling/postiz.ts` contains real line breaks, never the literal two-character sequence backslash-n.
- A post whose stored copy contains line breaks is scheduled and published with those line breaks intact (verified against a real Postiz test post).
- If copy was previously stored with literal `\n`, it is normalized to real newlines before sending.
notes:
- Source: GF-26 in Notion. Comment (2026-06-26): "Check it again, like now it was posted but with /n errors".
- Code evidence: `deploy-staging/api/src/scheduling/postiz.ts` builds the `/public/v1/posts` payload; this is the API-side publish path.
- Technical scope: add a single normalize step (replace literal `\n` and `\r\n` artifacts with real newlines) on the content field before the POST. Mirror whatever normalization GF-63 applied agent-side.

### TASK-002: Align the agent-side Postiz plugin with the GF-63 newline fix and re-test end-to-end
status: todo
owner: martin
agent: viktor-staging
reviewer: claude
branch: none
area: agent
estimate: M
depends_on: [TASK-001]
tags: [gf-26, gf-63, postiz, agent, verification]
acceptance:
- A post moved to "Programmed" on staging is scheduled, actually publishes via Postiz, and the live published post shows real line breaks (no literal `\n`).
- Both publish paths (agent Postiz plugin and API adapter) are confirmed to produce identical, correct newline output for the same copy.
notes:
- Source: GF-26 in Notion; overlaps GF-63 (postiz newlines, currently Inbox).
- Memory: the GF-63 fix was applied on prod surgically but the branch is not merged and the live plugin had drifted; confirm the staging agent's Postiz plugin carries the same normalization before re-testing.
- Code evidence: worktree `.worktrees/gf-63-postiz-newlines/` holds the agent-side fix; reconcile with the live staging plugin rather than copying the repo over live config.

## Frontend Implementation

### TASK-004: Make the dashboard "refresh / update" icon a more visible colour
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-29-refresh-icon-color
area: frontend
estimate: XS
depends_on: []
tags: [gf-29, dashboard, ui]
acceptance:
- The refresh/update control on the client dashboard renders in a clearly visible accent colour (not muted/ghost) and remains visible in light and dark.
- Hover and disabled states still read correctly.
notes:
- Source: GF-29 in Notion. Comment (2026-06-26): "...make the icon for updating in another more visible colour."
- Code evidence: refresh/refetch controls live in `app-v2/src/routes/client/layout.tsx` and per-tab routes (`approvals.tsx`, `calendar.tsx`, `assets.tsx`, `suggestions.tsx`, `videos.tsx`). Confirm whether the icon is shared in `layout.tsx` (preferred single change) or duplicated per route.
- Technical scope: swap the icon's muted class for the brand accent (e.g. `text-brand-blue`); keep it a one-line styling change.

### TASK-006: Reject approving/scheduling a post with a past publication date
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-37-block-past-dates
area: frontend
estimate: M
depends_on: []
tags: [gf-37, calendar, approvals, validation]
acceptance:
- Attempting to set/approve a post to "Programmed" (or any scheduled state) with a publication date earlier than now is blocked in the UI with a clear message.
- The same guard is enforced server-side so the API rejects a past-dated schedule (the scheduling adapter never receives a past `when`).
- Existing valid (future-dated) scheduling is unaffected.
notes:
- Source: GF-37 in Notion. Comment (2026-06-26): "Not yet fully working, I still can like plan for past dates...".
- Code evidence: `app-v2/src/routes/client/calendar.tsx` already has month `isPast` awareness (lines ~686/721) but does not block scheduling; `deploy-staging/api/src/scheduling/postiz.ts` schedules for the post date.
- Technical scope: add a `publishDate > now` guard at the approve-to-Programmed boundary, both client and API.

### TASK-007: Make already-published posts visibly greyed out / read-only
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-37-greyout-published
area: frontend
estimate: S
depends_on: []
tags: [gf-37, gf-57, published, ui]
acceptance:
- A post for which `isPublished(post)` is true renders visually greyed out and its status/move controls are disabled (read-only), in both the Kanban and Calendar views.
- The existing Published lane + post link behaviour is unchanged.
notes:
- Source: GF-37 in Notion. Comment (2026-06-26): "...if a post is like already published, it should be greyed out."
- Related: GF-57 (grey out + auto-publish when posted via Postiz) — same greying behaviour; keep consistent.
- Code evidence: `isPublished()` in `app-v2/src/lib/post-status.ts`; consumers in `app-v2/src/components/approval-kanban.tsx` and `app-v2/src/routes/client/calendar.tsx`.

## Agent / Skill Implementation

### TASK-003: Add the "update the page to see the post" instruction to the image-generation skill
status: todo
owner: codex
agent: codex
reviewer: human
branch: codex/gf-29-skill-update-hint
area: agent
estimate: XS
depends_on: []
tags: [gf-29, skill, image-generation]
acceptance:
- The image-generation skill instructs the agent to tell the user, after generating/replacing an image, to "update the page to see the post" (wording per Martin).
- The instruction is in the canonical skill and synced to the agents that use it.
notes:
- Source: GF-29 in Notion. Comment (2026-06-26): "Make that the Agents should say 'update the page to see the post' (written in the Image generation skill)...".
- Code evidence: `deploy-staging/staging-demo-agent/skills/image-generation/SKILL.md` (142 lines) is the canonical skill; prod agent reloads skills from its mounted copy.
- Technical scope: copy edit to SKILL.md; ensure it reaches the running agent (skills are not always hot-loaded — confirm per prod-agent internals).

### TASK-005: Put Instagram font-size / text-density rules into the image-generation skill
status: todo
owner: codex
agent: codex
reviewer: human
branch: codex/gf-32-ig-font-density-skill
area: agent
estimate: S
depends_on: []
tags: [gf-32, skill, image-generation, instagram]
acceptance:
- The image-generation skill contains explicit Instagram font-size and text-density guidance the agent can follow when composing IG images.
- Guidance is consistent with the already-shipped IG format work (GF-32/GF-33 vertical 1080x1350).
notes:
- Source: GF-32 in Notion. Comment (2026-06-26): "Review Image generation Skill. This information should be there".
- Code evidence: `deploy-staging/staging-demo-agent/skills/image-generation/SKILL.md`.
- Technical scope: add an Instagram typography section (min font sizes, max text density / words-per-image, hierarchy) sourced from the existing GF-32 spec text.

### TASK-008: Output hard-coded Hermes agent strings in Spanish for current agents
status: todo
owner: codex
agent: codex
reviewer: claude
branch: codex/gf-39-agent-spanish-strings
area: agent
estimate: M
depends_on: []
tags: [gf-39, gf-61, agent, i18n, spanish]
acceptance:
- User-facing strings that are hard-coded in the Hermes agent (plugins/config) are output in Spanish for the current production/staging agents.
- No remaining English-only hard-coded user-facing string in the agent's tool/progress/error messages for those agents.
notes:
- Source: GF-39 in Notion. Comment (2026-06-26): "Not totally working. Everything that is hard coded in the Hermes Agent needs to be outputed in Spanish (at least for the current agents...)".
- Related: GF-61 (agent language sometimes flips to English) — same root area.
- Code evidence: worktree `.worktrees/gf-61-39-agent-i18n/` already targets this; reconcile with the live agent config/plugins rather than overwriting drifted live config.
- Technical scope: locate hard-coded strings in the agent plugins, move them to the agent's configured language (Spanish for current agents).

### TASK-009: Make the agent-creation skill ask which language a new agent should speak
status: todo
owner: codex
agent: codex
reviewer: human
branch: codex/gf-39-agent-creation-language-prompt
area: agent
estimate: S
depends_on: [TASK-008]
tags: [gf-39, skill, deploy-hermes, i18n]
acceptance:
- The deploy-hermes-company-agent skill prompts for / records the language a new agent should use, and wires that choice into the new agent's config so its hard-coded strings come out in that language.
- Documented so a new client bot ships in the correct language from day one.
notes:
- Source: GF-39 in Notion. Comment (2026-06-26): "...update also the skill for creating agents for it to ask which lenguage should the agent have".
- Code evidence: the `deploy-hermes-company-agent` skill is the agent-provisioning playbook; add a language step that feeds TASK-008's string mechanism.

## Verification

- GF-26: schedule a real test post with multi-line copy on staging, let it
  publish via Postiz, confirm the live post shows real line breaks.
- GF-29: regenerate an image in chat and confirm the agent says "update the page
  to see the post"; visually confirm the refresh icon's new colour.
- GF-32: have the agent compose an IG image and confirm it honours the font-size
  / density rules now in the skill.
- GF-37: try to schedule a past-dated post (blocked, client + API); confirm a
  published post is greyed out and read-only in Kanban and Calendar.
- GF-39: confirm current agents output Spanish for previously-English hard-coded
  strings; create a throwaway agent via the skill and confirm the language prompt.
- Each item moves from "In progress" back through the normal branch → staging
  flow; re-test on staging before flipping to "Tested in Staging" / "Done".

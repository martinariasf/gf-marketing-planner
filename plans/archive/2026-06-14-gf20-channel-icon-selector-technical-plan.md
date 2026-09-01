---
project: GF-20 Social-network icon + channel selector
updated: 2026-06-14
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004]
items:
  - gf-20: Add Social Network icon and also be able to select | priority: high
---

# Plan

## Decisions and API Contracts

### TASK-001: Confirm channel write-path already exists (no backend work)
status: done
owner: martin
agent: claude
area: backend
estimate: XS
depends_on: []
tags: [notion, gf-20, api, decision]
acceptance:
- PATCH /clients/:slug/posts/:id accepts a `channel` value out of the 5 known networks.
- The SPA api-client already types `channel` on the patch/create payloads.
notes:
- Source: GF-20 in Notion (Bug, High, S).
- Code evidence: deploy-staging/api/src/schemas/post.ts:75 — `channel: z.enum(CHANNELS).optional()` in postFields; postPatchSchema (line 96) inherits it.
- Code evidence: app-v2/src/lib/api-client.ts:312 — apiCreatePost already accepts `channel`; apiPatchPost takes an arbitrary patch record.
- Decision: GF-20 is FRONTEND-ONLY. Backend + types already support a channel patch; only the UI affordance (icon + picker) is missing.

## Frontend Implementation

### TASK-002: Extract a single shared ChannelIcon component
status: todo
owner: martin
agent: claude
area: frontend
estimate: S
depends_on: []
tags: [notion, gf-20, ui, refactor]
acceptance:
- One module exports a `ChannelIcon` (brand glyph) plus the network label/color maps for all 5 networks (linkedin, instagram, facebook, x, tiktok).
- context.tsx and kpi-card.tsx import the shared glyphs instead of redefining NETWORK_PATHS locally (no behavior change there).
- `pnpm build` (tsc -b + vite) passes.
notes:
- Source: GF-20 in Notion.
- Code evidence: the SAME brand-glyph `NETWORK_PATHS` is duplicated in app-v2/src/routes/client/context.tsx:430 and app-v2/src/components/kpi-card.tsx:12; labels/colors duplicated again.
- Technical scope: new file app-v2/src/components/channel-icon.tsx (or src/lib/social-networks.tsx). Reuse the existing `Channel` type (app-v2/src/types/post.ts:11). Pure dedupe — keep glyph paths byte-identical.

### TASK-003: Show the channel icon on the post card / copy header
status: todo
owner: martin
agent: claude
area: frontend
estimate: S
depends_on: [TASK-002]
tags: [notion, gf-20, ui, dashboard]
acceptance:
- The post card surfaces the network as a brand-tinted icon at the top-right of the copy header instead of (or alongside) the plain `· channel` text.
- Icon carries an accessible label (aria-label / title = network name).
- Renders correctly for all 5 channels and never crashes on a missing/unknown channel.
notes:
- Source: GF-20 in Notion ("Add Social Network icon ... on the top right of the copy").
- Code evidence: app-v2/src/components/post-card.tsx:32 renders `· {post.channel}` as text; status badge already sits top-right (line 36).
- Technical scope: place ChannelIcon in the card header row; keep layout consistent with existing badge spacing.

### TASK-004: Make the channel selectable from the post drawer (click-to-pick)
status: todo
owner: martin
agent: claude
area: frontend
estimate: M
depends_on: [TASK-002]
tags: [notion, gf-20, ui, dashboard, edit]
acceptance:
- The edit drawer shows a clickable ChannelIcon at the top-right of the copy editor.
- Clicking it opens a small picker (5 networks); choosing one updates local state and shows the new icon immediately.
- On Save, a changed channel is included in the PATCH payload (apiPatchPost) exactly like title/copy/date; unchanged channel is omitted.
- i18n keys added (EN + DE/ES per existing i18n-dict.ts) for the picker label.
- `pnpm build` passes; the change is exercised in the browser preview (open drawer, switch network, save, confirm card icon updates).
notes:
- Source: GF-20 in Notion ("be able to select which social network to use ... by clicking the icon").
- Code evidence: app-v2/src/components/post-drawer.tsx — currently edits title/copy/date only (line 50 `save()` builds the patch; line 86 shows `{post.channel}` as static text).
- Code evidence: existing select+icon pattern to mirror is app-v2/src/routes/client/context.tsx:487 (Active Channels network picker).
- Technical scope: add `channel` to drawer state + the patch delta; reuse ChannelIcon as the trigger; small popover/select for the 5 options.

## Verification

### TASK-005: Verify, cross-vendor review, ship to staging
status: todo
owner: martin
agent: claude
area: verification
estimate: S
depends_on: [TASK-002, TASK-003, TASK-004]
tags: [notion, gf-20, verification, review]
acceptance:
- `pnpm install && pnpm build` clean in app-v2.
- Browser-preview walkthrough: card shows icon; drawer lets you switch network and persist it.
- independent-review (different model vendor) returns PASS or findings are resolved.
- PR merged into `experimental`; Notion GF-20 moved to "Done in Staging".
notes:
- Source: GF-20 in Notion.
- Per new-task-workflow: branch feat/gf20-channel-icon off experimental; never commit on experimental directly.

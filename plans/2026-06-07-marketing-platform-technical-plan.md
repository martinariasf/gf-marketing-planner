---
project: 2026-06-07 Marketing Platform Technical Plan
updated: 2026-06-07
owner: Martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
code_reviewed_at: 2026-06-07
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009, TASK-010, TASK-011]
items:
  - gf-1: GF logo in header | priority: medium
  - gf-5: Delete assets | priority: medium
  - gf-6: Opaque image preview | priority: medium
  - gf-8: Review Strategy | priority: medium
  - gf-10: Simplify AI suggestions | priority: medium
  - gf-11: Postiz API in Integrations | priority: medium
---

# Plan

## Decisions and API Contracts

### TASK-001: Decide manifest asset deletion semantics
status: in progress
owner: codex
agent: codex
area: api
estimate: S
depends_on: []
tags: [notion, gf-5, assets, api-contract]
acceptance:
- Deletion behavior is defined as soft-delete overlay, physical file deletion, or manifest-only removal.
- Decision protects Viktor-owned disk assets from unsafe API mutation.
- Follow-up implementation tasks reference the chosen contract.
notes:
- Source: GF-5 in Notion.
- Code evidence: deploy-staging/api/src/routes/viktorOwned.ts exposes GET /clients/:slug/assets/manifest only.
- Code evidence: deploy-staging/api/src/diskData.ts reads clients/<slug>/assets/manifest.json from disk.
- Code evidence: deploy-staging/api/src/routes/inspiration.ts has DELETE support only for PocketBase inspiration assets.
- Technical scope: because manifest assets are Viktor-owned disk data, plan the data contract before adding a delete button.

### TASK-002: Add backend overlay for deleted manifest assets
status: in progress
owner: codex
agent: codex
area: api
estimate: S
depends_on: [TASK-001]
tags: [notion, gf-5, assets, backend, pocketbase]
acceptance:
- PocketBase bootstrap includes an asset deletion or asset state overlay collection.
- GET /clients/:slug/assets/manifest filters soft-deleted manifest items by default.
- DELETE /clients/:slug/assets/:id records deletion through the overlay and writes an audit entry.
- Route is scoped and limited to dash/admin unless agent deletion is explicitly approved.
notes:
- Source: GF-5 in Notion.
- Code evidence: deploy-staging/api/src/ensureCollections.ts defines overlay collections like posts_patches and suggestion_states.
- Code evidence: deploy-staging/api/src/overlays.ts contains merge helpers for disk plus PocketBase overlay state.
- Code evidence: deploy-staging/api/src/routes/viktorOwned.ts already uses overlay patterns for posts and suggestions.
- Technical scope: mirror the existing overlay pattern instead of editing the asset manifest file directly from the API.

### TASK-003: Add confirmed manifest asset deletion UI
status: in progress
owner: codex
agent: codex
area: frontend
estimate: S
depends_on: [TASK-002]
tags: [notion, gf-5, assets, ui]
acceptance:
- Assets detail dialog shows a delete control only for deletable manifest assets.
- Confirmation dialog names the asset and requires explicit confirmation.
- Confirm calls the new API route, removes the asset from the current view, closes stale previews, and shows a toast.
- Cancel leaves the asset unchanged.
notes:
- Source: GF-5 in Notion.
- Code evidence: app-v2/src/routes/client/assets.tsx stores selected manifest asset in selected and renders the detail Dialog around lines 390-472.
- Code evidence: app-v2/src/lib/api-client.ts has apiLoadAssetsManifest but no manifest asset delete client.
- Code evidence: inspiration deletion in app-v2/src/routes/client/assets.tsx around remove() is a useful optimistic-delete pattern.
- Technical scope: add the client function first, then wire the dialog action and i18n strings.

### TASK-004: Replace AI suggestion copy actions with Accept and Reject
status: in progress
owner: codex
agent: codex
area: frontend
estimate: S
depends_on: []
tags: [notion, gf-10, ai-suggestions, chat]
acceptance:
- Open suggestions show Accept and Reject actions, with Copy and Dismissed Copy removed.
- Accept opens the in-app chatbot with the suggestion action prefilled.
- Reject calls apiPatchSuggestion with status dismissed and refreshes suggestions.
- English, German, and Spanish suggestion labels are updated.
notes:
- Source: GF-10 in Notion.
- Code evidence: app-v2/src/routes/client/suggestions.tsx copy() and dismiss() currently write to clipboard.
- Code evidence: app-v2/src/routes/client/layout.tsx listens for mp:open-chat and opens ChatSheet with an initial message.
- Code evidence: app-v2/src/lib/api-client.ts already has apiPatchSuggestion.
- Code evidence: app-v2/src/lib/i18n-dict.ts contains suggestions.copyAccept and suggestions.dismissCopy in three languages.
- Technical scope: Accept should dispatch mp:open-chat instead of copying text; Reject should use the existing API mutation.

### TASK-005: Add secure Postiz configuration backend contract
status: in progress
owner: codex
agent: codex
area: api
estimate: S
depends_on: []
tags: [notion, gf-11, integrations, postiz, secrets]
acceptance:
- Backend accepts a Postiz API key through a scoped dash/admin route.
- GET integration metadata returns only masked/status information, not the raw key.
- Stored value is kept server-side for automation use and is not committed to source.
- Audit records configuration changes without logging the secret.
notes:
- Source: GF-11 in Notion.
- Code evidence: deploy-staging/api/src/routes/integration.ts currently exposes GET metadata only.
- Code evidence: deploy-staging/api/src/ensureCollections.ts has org_configs for per-client config but currently only calendarRange.
- Code evidence: app-v2/src/routes/client/integration.tsx is read-only and only loads apiLoadIntegration.
- Technical scope: extend org_configs or create a dedicated integration credential collection; avoid returning the plaintext secret to the SPA after save.

## Frontend Implementation

### TASK-006: Add Postiz API field to Integrations UI
status: in progress
owner: codex
agent: codex
area: frontend
estimate: S
depends_on: [TASK-005]
tags: [notion, gf-11, integrations, postiz, ui]
acceptance:
- Integrations page renders a Postiz API key section at the bottom.
- Saving sends the key through the new backend route and clears the plaintext input after success.
- Existing configured state is shown as masked or configured, not as a full secret.
- English, German, and Spanish integration labels are updated.
notes:
- Source: GF-11 in Notion.
- Code evidence: app-v2/src/routes/client/integration.tsx currently renders REST API, Agent token, Asset workflow, and examples sections.
- Code evidence: app-v2/src/lib/api-client.ts IntegrationInfo currently has no Postiz fields or save function.
- Code evidence: app-v2/src/lib/i18n-dict.ts contains integration.* copy in three languages.
- Technical scope: add UI only after the backend contract prevents secret echoing.

### TASK-007: Add GF logo to the client dashboard header
status: in progress
owner: codex
agent: codex
area: frontend
estimate: S
depends_on: []
tags: [notion, gf-1, branding, header]
acceptance:
- GF Innovative Solutions logo is visible in the top header on client dashboard pages.
- Header keeps the client identity readable and responsive on mobile.
- Logo links back to the home/dashboard route.
- Logo image remains crisp on high-DPI screens.
notes:
- Source: GF-1 in Notion.
- Code evidence: app-v2/src/components/gf-logo.tsx already renders /gf-logo.svg.
- Code evidence: app-v2/src/routes/index.tsx uses GFLogo in the home header.
- Code evidence: app-v2/src/routes/client/layout.tsx currently shows client logoInitials as the primary header mark and GFLogo only in help/mobile footer areas.
- Technical scope: reuse GFLogo in the client layout header instead of creating a new asset.

### TASK-008: Make asset preview dialog opaque
status: in progress
owner: codex
agent: codex
area: frontend
estimate: S
depends_on: []
tags: [notion, gf-6, assets, preview]
acceptance:
- Opening a manifest asset preview shows an opaque dialog surface and image frame.
- Page content behind the preview does not bleed through the preview box.
- Dialog remains visually consistent for draft and approved assets.
notes:
- Source: GF-6 in Notion.
- Code evidence: app-v2/src/routes/client/assets.tsx renders DialogContent for selected assets around the selected asset preview.
- Code evidence: the image wrapper currently uses bg-paper-muted but the dialog content should explicitly carry an opaque surface.
- Technical scope: add explicit opaque background classes to DialogContent and preview frame; verify over visually busy pages.

### TASK-009: Clarify strategy review scope against current code
status: in progress
owner: martin
agent: human
area: product
estimate: S
depends_on: []
tags: [notion, gf-8, strategy, clarification]
acceptance:
- Decision records whether GF-8 means reviewing generic UI copy, generated strategy content, or both.
- Fixed period wording to change is listed before implementation.
- If generated content is in scope, the source of that content is identified.
notes:
- Source: GF-8 in Notion.
- Code evidence: app-v2/src/routes/client/strategy.tsx has ReviewButton prompts that say "este trimestre".
- Code evidence: app-v2/src/lib/i18n-dict.ts contains fixed labels like "Positioning this quarter" and "Campaign roadmap (12 weeks)".
- Code evidence: app-v2/src/routes/client/strategy.tsx already computes planningMonths from calendar range.
- Technical scope: clarify scope before changing translated UI copy or data generation prompts.

### TASK-010: Make strategy period wording dynamic
status: in progress
owner: codex
agent: codex
area: frontend
estimate: S
depends_on: [TASK-009]
tags: [notion, gf-8, strategy, i18n]
acceptance:
- Strategy page avoids fixed quarter-only wording where calendar range should drive the period.
- Campaign roadmap label reflects the active planning range instead of always saying 12 weeks.
- Review prompts sent to Viktor avoid hardcoded "this quarter" phrasing when range context is available.
- English, German, and Spanish copy stay coherent.
notes:
- Source: GF-8 in Notion.
- Code evidence: app-v2/src/routes/client/strategy.tsx has access to planningRange, planningMonths, and totalWeeks.
- Code evidence: app-v2/src/lib/i18n-dict.ts contains the relevant strategy.* translations.
- Technical scope: use dynamic labels in the component where i18n strings are too rigid.

## Verification

### TASK-011: Verify current GF backlog changes end to end
status: todo
owner: codex
agent: codex
area: verification
estimate: S
depends_on: [TASK-003, TASK-004, TASK-006, TASK-007, TASK-008, TASK-010]
tags: [notion, gf-1, gf-5, gf-6, gf-8, gf-10, gf-11, verification]
acceptance:
- app-v2 TypeScript build passes.
- deploy-staging/api TypeScript check passes when API files changed.
- Changed UI routes are manually checked in the browser.
- Staging deploy uses CI from experimental and live bundle is verified as API mode.
notes:
- Source: current approved Notion batch GF-1, GF-5, GF-6, GF-8, GF-10, GF-11.
- Code evidence: AGENTS.md requires source-only edits, committed experimental branch changes, CI deploy, and API-mode verification.
- Technical scope: verification is grouped after implementation tasks so the plan does not claim success from code edits alone.

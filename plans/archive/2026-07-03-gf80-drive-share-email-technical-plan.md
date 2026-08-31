---
project: GF-80 Show the Drive share email in Integrations
updated: 2026-07-03
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004]
items:
  - gf-80: Show Email to be used with the drive | priority: medium
---

# Addendum 2026-07-04 — design correction: read-only, wired from deploy config

Martin's feedback after the first staging cut: the Integration card must **show**
the email Viktor is wired to — not offer an input to paste one into. The email is
the agent's own identity (the `client_email` inside the mounted `GDRIVE_SA_KEY`),
so it belongs to the deployment, not to dashboard data entry. This supersedes the
editable/PocketBase design below. Branch: `claude/gf-80-drive-email-readonly`.

What changed vs. the original plan:

- **Source of truth:** a per-client deploy map `DRIVE_SHARE_EMAILS_JSON`
  (`{ "<slug>": "viktor-<slug>@<project>.iam.gserviceaccount.com" }`), parsed in
  `env.ts` (`resolveDriveShareEmail`) exactly like `CLIENT_LANGS_JSON` /
  `HERMES_AGENTS_JSON`. Set inline in the compose files (a public identifier, not
  a secret). Staging wires `gf-internal` → `viktor-staging-demo@gf-agents-drive.iam.gserviceaccount.com`.
- **API:** GET `/integration` now sources `driveShareEmail` from that map. The
  `PUT`/`DELETE /integration/drive-email` routes are **removed**; the Postiz
  DELETE reverts to a whole-row delete (the row is no longer shared). No
  `integration_secrets` fields for the email (removed from `ensureCollections`).
- **Frontend:** `DriveEmailCard` is read-only — code box + copy button when an
  email is wired, else a "not connected yet" note. `apiSaveDriveEmail` /
  `apiDeleteDriveEmail` removed; `IntegrationInfo.driveShareEmail` kept.
- **i18n:** dropped the editable strings (placeholder/save/replace/remove/saved),
  added `driveNotConnected`, reworded `driveIntro`.

The TASK-00x sections below describe the earlier editable design and are kept for
history only.

# Plan

## Simple Words

Each client's Viktor agent has its own Google "robot" email (a service-account
address like `viktor-<slug>@gf-agents-drive.iam.gserviceaccount.com`, from the
GF-19 Drive work). For Viktor to read a client's Drive folder, the client must
**share that folder with the robot email** (Viewer). Today that email lives only
in the operator's notes / the agent's `.env` — the client can't see it.

GF-80 adds a small **"Google Drive" card in the Integrations tab** that:

- **Shows** the robot email the client should share their folder with, with a
  copy button and the instruction "Use this email to share Google Drive folders
  with, so Viktor can access them."
- Lets an operator (dash/admin) **edit/save** that email per client, and clear it.

This is not a secret (it is meant to be shared), so — unlike the Postiz key — it
is stored and returned in plaintext. No Drive files are touched by this change; it
is a display+edit field only. The actual read plumbing is GF-19 and out of scope
here.

## Decisions and API Contracts

### TASK-001: Persist the Drive share email per client (backend storage + GET)
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-80-drive-share-email
area: api
estimate: S
depends_on: []
tags: [gf-80, drive, integration, api]
acceptance:
- `integration_secrets` collection gains a non-secret `driveShareEmail` (text, max 320) field and a `driveEmailUpdatedAt` (text, max 40) field in `deploy-staging/api/src/ensureCollections.ts`. Reuse the same slug-keyed record as the Postiz key.
- `GET /clients/:slug/integration` returns `driveShareEmail: string | null` (plaintext — it is meant to be shared, not masked).
- `IntegrationSecretRec` type in `deploy-staging/api/src/routes/integration.ts` extended with `driveShareEmail?` / `driveEmailUpdatedAt?`.
notes:
- Code evidence: `deploy-staging/api/src/routes/integration.ts` (loadSecretRecord/loadPostizStatus pattern), `ensureCollections.ts:223` (integration_secrets schema).
- Unlike Postiz, do NOT encrypt or mask — the whole point is the client sees it.

### TASK-002: Save / clear routes for the Drive share email
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-80-drive-share-email
area: api
estimate: S
depends_on: [TASK-001]
tags: [gf-80, drive, integration, api]
acceptance:
- `PUT /clients/:slug/integration/drive-email` (dash/admin, requireScope) validates a basic email shape and upserts `driveShareEmail` + `driveEmailUpdatedAt` on the slug record; returns `{ driveShareEmail, updatedAt }`.
- `DELETE /clients/:slug/integration/drive-email` (dash/admin) clears the field; returns `{ driveShareEmail: null, updatedAt: null }`.
- Both audited via `audit(...)` with action `integration.driveEmail.update` / `.delete` (email is not a secret, so the value may be recorded).
- Invalid / empty email on PUT → 422 problem+json (mirror the Postiz PUT validation shape).
notes:
- Mirror the existing Postiz PUT/DELETE handlers in `integration.ts`; reuse `loadSecretRecord` + `withPb` upsert.

### TASK-003: Integration tab "Google Drive" card (frontend)
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-80-drive-share-email
area: dashboard
estimate: M
depends_on: [TASK-001, TASK-002]
tags: [gf-80, drive, integration, dashboard]
acceptance:
- `app-v2/src/lib/api-client.ts`: `IntegrationInfo` gains `driveShareEmail: string | null`; add `apiSaveDriveEmail(slug, email)` and `apiDeleteDriveEmail(slug)` mirroring the Postiz helpers.
- `app-v2/src/routes/client/integration.tsx`: new "Google Drive" `<section>` (Postiz-style card) that shows the current email with a copy button when set, an editable text input to set/replace it, a Save and a Clear (Trash) button, and a description line.
- All user-visible strings go through `useT()` with new `integration.drive*` keys added to en/de/es in `app-v2/src/lib/i18n-dict.ts` (no hardcoded copy).
- Empty state (no email saved) shows just the input + description; saved state shows the email card + "replace"/clear affordances, matching the Postiz UX.
notes:
- Code evidence: `integration.tsx` PostizCard (lines ~258-347) is the template; `Field` component already gives copy-to-clipboard.
- Icon: reuse a lucide icon already imported or add `HardDrive`/`FolderOpen`.

## Verification

### TASK-004: Verify build, types, and the card in the browser
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-80-drive-share-email
area: verification
estimate: S
depends_on: [TASK-001, TASK-002, TASK-003]
tags: [gf-80, drive, integration, verification]
acceptance:
- `cd app-v2 && npx tsc -b` passes; `cd deploy-staging/api && npx tsc --noEmit` passes.
- `cd app-v2 && npx vite build` succeeds.
- Manual/preview: Integration tab renders the Drive card; saving an email persists across reload; the copy button copies it; clearing removes it.
- Changelog entry added at the top of `app-v2/src/lib/changelog.ts` (dated 2026-07-03) with a user-facing bullet.
- Independent (cross-vendor) review PASS before merge to `experimental`; Notion GF-80 → "Done in Staging".
notes:
- Then merge to experimental (CI deploys to staging.marketing.gfinnov.com). Prod is a separate promote step.

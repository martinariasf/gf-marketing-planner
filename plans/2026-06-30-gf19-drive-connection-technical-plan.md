---
project: GF-19 Viktor ↔ Google Drive (Phase 1, read-only)
updated: 2026-06-30
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008, TASK-009]
items:
  - gf-19: Connectar Viktor con el Drive | priority: high
---

# Plan

## Simple Words

We give each client's Viktor agent its own free "robot" Google identity (a Google
Cloud **service account**). The client shares **one** Drive folder with that
robot's email (Viewer access) — that's their only step. Viktor can then **read**
the files in that one folder (logos, briefs, reference images) and use them, e.g.
to brand generated images.

Each agent container holds **only its own** robot key, so it can reach **only**
its own client's folder — any other folder is blocked by Google itself (403/404),
not by our code being careful. A buggy or hacked agent still cannot read another
client's data.

**Not in this phase:** Viktor cannot *save* files back into the folder yet (that
needs a paid Google Workspace identity — Phase 2, designed to be additive). No
self-serve "Connect Drive" button, no access beyond the one shared folder.

Design doc: `plans/2026-06-30-gf19-drive-connection-phase1-design.md`.

Status note: GF-19 is **In discussion** in Notion (not yet "Approved to build").
The empty Notion body was clarified entirely in the 2026-06-30 brainstorm; the
clarified shape is the service-account, read-only, one-folder model below.

## Decisions and API Contracts

### TASK-001: Lock the Phase 1 technical decisions
status: todo
owner: martin
agent: claude
reviewer: human
branch: none
area: decisions
estimate: XS
depends_on: []
tags: [notion, gf-19, drive, decisions]
acceptance:
- Credential delivery chosen: service-account JSON as a **mounted file** referenced by `GDRIVE_SA_KEY_FILE`, OR a base64 blob in `GDRIVE_SA_KEY` — one is selected and recorded.
- Listing depth chosen: recurse into subfolders by default, or top-level only.
- Tool surface confirmed for Phase 1: `drive_list_files` + `drive_read_file` only (no `drive_search_files` yet — YAGNI).
- Drive scope confirmed: `https://www.googleapis.com/auth/drive.readonly`.
notes:
- Source: GF-19 in Notion (clarified 2026-06-30 brainstorm).
- Recommendation: mounted file (easier rotation, no 100KB env bloat), recurse one level into immediate subfolders, list+read only.
- No CASA/app verification applies: service accounts do not use the OAuth consent screen.

## Cloud Infrastructure (one-time, platform-wide)

### TASK-002: Create the Google Cloud "robot factory" project
status: todo
owner: martin
agent: human
reviewer: human
branch: none
area: infra
estimate: S
depends_on: []
tags: [notion, gf-19, drive, gcp, infra]
acceptance:
- A dedicated Google Cloud project exists (e.g. `gf-agents-drive`) with the **Google Drive API** enabled.
- Project owner/billing recorded; no billing needed for service-account reads but the project must exist.
- Decision recorded on naming convention for per-client SAs: `viktor-<slug>@<project>.iam.gserviceaccount.com`.
notes:
- Source: GF-19 in Notion.
- One project serves all 25–50 clients; isolation is per service account, not per project.
- Technical scope: enable Drive API, no OAuth consent screen configured (not needed for SA).

### TASK-003: Per-client service-account provisioning script
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-19-drive-provisioning
area: infra
estimate: M
depends_on: [TASK-001, TASK-002]
tags: [notion, gf-19, drive, provisioning, infra]
acceptance:
- A script (gcloud or IAM API) creates `viktor-<slug>` in the factory project and emits its JSON key.
- The script prints the SA email and a copy-paste client instruction ("Share your folder with <email> as Viewer").
- Re-running for an existing slug is safe (idempotent or clear "already exists").
- Optional helper: given the SA can see the folder, read back and print the `GDRIVE_FOLDER_ID` so the operator need not ask the client for it.
notes:
- Source: GF-19 in Notion.
- Lives alongside the deploy-hermes-company-agent onboarding flow (extend that skill's runbook in TASK-008).
- Service accounts are free and scriptable — 50 clients is a loop.

## Agent Implementation

### TASK-004: Build the `drive` Hermes plugin (read-only)
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-19-drive-plugin
area: agent
estimate: M
depends_on: [TASK-001]
tags: [notion, gf-19, drive, plugin, agent]
acceptance:
- New plugin at `deploy-staging/<agent>/plugins/drive/{plugin.yaml,__init__.py}` (then mirrored to deploy-prod) with `def register(ctx)`.
- `drive_list_files` lists files under the configured folder only: every `files.list` uses `q="'<FOLDER_ID>' in parents"`; returns name, id, mimeType, modifiedTime, size.
- `drive_read_file(id)` verifies the file's ancestry resolves to the configured root before returning content; exports Google Docs as text; returns images as a local path/base64 usable by `image_generate` reference_images.
- Folder-scoped at both layers: credential (only that folder shared with the SA) **and** code (only the configured FOLDER_ID is ever queried; no broad "shared with me" call).
- Tools fail gracefully when creds/folder are unset (mirror postiz check_fn behavior); `requires_env: []`.
- Large-file cap enforced (return metadata + "too large" note instead of dumping).
notes:
- Source: GF-19 in Notion.
- Code evidence (pattern to copy): deploy-prod/gf-innov-agent/plugins/postiz/__init__.py + plugin.yaml (register/check_fn/graceful-degrade pattern).
- Auth: google-auth service-account creds, scope drive.readonly.
- Build on the staging agent first, then promote to prod (see deploy notes).

### TASK-005: Add Google Drive client libs to the agent image
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-19-drive-plugin
area: agent
estimate: S
depends_on: [TASK-004]
tags: [notion, gf-19, drive, docker, agent]
acceptance:
- `google-api-python-client` and `google-auth` installed in the per-company image (not the shared base), layered like the `npm install -g postiz` step.
- `hermes tools | grep drive_` lists both tools after rebuild (plugin imports cleanly — no missing-dep ImportError).
notes:
- Source: GF-19 in Notion.
- Code evidence: deploy-prod/gf-innov-agent/Dockerfile installs postiz + COPY plugins/ -> /opt/data/plugins/; add a pip install layer the same way.
- Keep base image (hermes-agent:base) untouched so other stacks are unaffected.

### TASK-006: Wire per-stack Drive config (.env + compose mount)
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-19-drive-plugin
area: agent
estimate: S
depends_on: [TASK-001, TASK-004]
tags: [notion, gf-19, drive, config, agent]
acceptance:
- `.env.example` documents `GDRIVE_SA_KEY_FILE` (or `GDRIVE_SA_KEY`) and `GDRIVE_FOLDER_ID`.
- If mounted-file path chosen: docker-compose mounts the per-stack SA key file read-only into the container; chmod 600 on host.
- Each stack holds ONLY its own client's key + folder ID (isolation invariant documented next to the config).
notes:
- Source: GF-19 in Notion.
- Code evidence: deploy-prod/gf-innov-agent/docker-compose.yml (single gateway service, named volume) — add the key mount here.
- Mirrors how POSTIZ_API_KEY lives per-stack in .env.

### TASK-007: Teach the persona to use the Drive folder
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-19-drive-plugin
area: agent
estimate: XS
depends_on: [TASK-004]
tags: [notion, gf-19, drive, persona, agent]
acceptance:
- A short `system_prompt` addition in `config.yaml` tells Viktor it can read the connected Drive workspace folder and WHEN to use it (e.g. "before generating images, check the Drive folder for the client's logo/brand references and pass them to image_generate").
- Kept brief; no behavior change when no folder is connected.
notes:
- Source: GF-19 in Notion.
- Code evidence: deploy-prod/gf-innov-agent/config.yaml holds the German marketing system_prompt.

## Onboarding & Docs

### TASK-008: Extend onboarding runbook with the Drive step
status: todo
owner: martin
agent: claude
reviewer: human
branch: claude/gf-19-drive-plugin
area: docs
estimate: S
depends_on: [TASK-003, TASK-006]
tags: [notion, gf-19, drive, onboarding, docs]
acceptance:
- `deploy-hermes-company-agent` skill/runbook gains a "Connect a Drive folder (read-only)" section: run provisioning script -> give client the SA email + Viewer-share instruction -> set GDRIVE_* in .env -> rebuild.
- Includes the exact client-facing one-liner and a note that only that one folder is ever accessed.
notes:
- Source: GF-19 in Notion.
- Keeps the per-company isolation invariant explicit in the operator docs.

## Verification

### TASK-009: Verify read + the isolation guarantee
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-19-drive-plugin
area: verification
estimate: S
depends_on: [TASK-004, TASK-005, TASK-006, TASK-007]
tags: [notion, gf-19, drive, verification, agent]
acceptance:
- `hermes tools` shows `drive_list_files` + `drive_read_file` on the staging agent.
- With a test folder shared to the test SA: list returns its files; read returns a known file's content; an image read flows into `image_generate` as a reference and produces a branded image (Telegram end-to-end).
- ISOLATION TEST: set `GDRIVE_FOLDER_ID` to a folder the SA was NOT shared into -> Google returns 403/404 and the tool refuses to return content. Proves the credential, not the code, is the wall.
- With creds unset: tools report "Drive not connected"; the agent otherwise works normally.
notes:
- Source: GF-19 in Notion.
- Run independent-review (Layer 5, different vendor) before promoting staging -> prod.

## Blockers / Decisions for Martin

### TASK-010: Approve GF-19 and move it out of "In discussion"
status: blocked
owner: martin
agent: human
reviewer: human
branch: none
area: decisions
estimate: XS
depends_on: []
tags: [notion, gf-19, approval]
acceptance:
- GF-19 moved to "Approved to build" in Notion once the read-only Phase 1 scope is accepted.
- Confirm: read-only-first is acceptable, and the GF-owned-write Phase 2 path is the intended follow-up.
notes:
- Source: GF-19 in Notion (currently In discussion, High, Idea, Estimate M).
- This plan should not start implementation until GF-19 is approved (new-task-workflow).

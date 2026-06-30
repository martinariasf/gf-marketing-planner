# GF-19 — Google Drive Connection (Phase 1: read-only) — Design

**Date:** 2026-06-30
**Status:** Design — pending Martin's review, then implementation plan
**Scope:** Phase 1 only (read-only). Phase 2 (write-back) is sketched at the end, not designed in detail.

---

## Goal

Let each per-client Viktor agent **read** a single Google Drive folder that the
client controls — to pull brand assets, logos, briefs, and reference images into
its work (e.g. as `reference_images` for image generation, or as source material
for copy). Onboarding for a client must be "share one folder with one email,"
and the design must scale cleanly to **25–50 clients**.

### Non-goals (Phase 1)

- Writing/saving files back into the client's Drive (deferred to Phase 2).
- Browsing the client's whole Drive — access is limited to **one** folder.
- Any self-serve OAuth "Connect Google Drive" button in the dashboard.
- Client-ownership of files (irrelevant in Phase 1 — Viktor only reads).

---

## The hard requirement that shapes everything: isolation

With 25–50 agents on a shared server, the design must guarantee that **agent A
can never read agent B's folder** — and this guarantee must hold even if an
agent is buggy, confused (LLM hallucination), or fully compromised.

**Principle: isolation lives in the credential, not the code.**
Each agent container holds exactly **one** Drive credential, and that credential
can reach exactly **one** folder. Cross-client access is then blocked by Google's
own servers (`403/404`), not by application logic being careful. A compromised
agent cannot exfiltrate another client's folder because it never possesses a
credential Google will accept for it. Blast radius of any single compromise =
that one client's folder.

This fits the existing architecture: each client already runs as an isolated
Docker stack under `/opt/agents/<slug>/` with its own `.env`. The Drive
credential is just one more per-stack secret, exactly like `POSTIZ_API_KEY`.

---

## Architecture

### Identity model — one free service account per agent

- A **single Google Cloud project** ("robot factory") is created once,
  platform-wide, with the Drive API enabled. No Google Workspace, no custom
  domain, no billing required for Phase 1.
- **Per client**, a dedicated **service account** is provisioned:
  `viktor-<slug>@<project>.iam.gserviceaccount.com`. Service accounts are free
  and scriptable (IAM API / `gcloud`), so 50 of them is a loop, not 50 manual
  signups.
- The client shares **one folder** in their own normal Drive with that service
  account's email as **Viewer**. That is the client's entire onboarding action.
- The service account's **JSON key** + the **folder ID** are placed into that
  client's agent stack `.env`. The container holds only its own key.

> **No CASA / no app verification.** The Google "restricted scope" security
> assessment (CASA) and the OAuth consent-screen verification apply to **OAuth
> apps that request scopes from end users via the consent screen**. A service
> account reading a folder a user shared with it does not use the consent screen,
> so `drive.readonly` here carries **zero verification cost**. This is the key
> reason Phase 1 is free and fast.

### Why a service account (not a real Gmail) for Phase 1

A service account cannot *write* into a personal-Drive folder (it has no storage
quota — files it creates would be owned by a quota-less identity and rejected).
But it *can* **read** a shared folder perfectly. Since Phase 1 is read-only, the
quota limitation does not bite, and we get the free + no-verification benefits.
Write-back is what forces the paid Workspace identity in Phase 2.

### Runtime component — the `drive` Hermes plugin

A new plugin lives next to `postiz` at
`deploy-prod/gf-innov-agent/plugins/drive/` (and the staging mirror), copied into
the image at `/opt/data/plugins/drive/`. Same shape as every other plugin:
`plugin.yaml` + `__init__.py` exposing `def register(ctx)`.

**Tools exposed to the LLM:**

| Tool | Purpose |
|---|---|
| `drive_list_files` | List files in the configured folder (and optionally its subfolders): `name`, `id`, `mimeType`, `modifiedTime`, `size`. |
| `drive_read_file` | Fetch one file's content by `id`: text/Docs exported as text; images returned as a local path / base64 usable as a `reference_images` input to `image_generate`. |

Both tools are **hard-scoped to the configured folder ID** in code: every
`files.list` is constrained with `q="'<FOLDER_ID>' in parents"` (recursing only
into subfolders discovered *under* that root), and `drive_read_file` verifies the
requested file's ancestry resolves to the configured root before returning
content. The plugin never calls a broad "shared with me" listing. So access is
folder-scoped at **two** layers: the credential (only that folder was shared with
the SA) and the code (only that folder ID is queried).

**Auth & scope:** `google-auth` + `google-api-python-client`, service-account
credentials, scope `https://www.googleapis.com/auth/drive.readonly`.

### Configuration (per-stack `.env`)

| Var | Meaning |
|---|---|
| `GDRIVE_SA_KEY` | The service-account JSON key — either a base64 blob or a path to a mounted file (decide in impl plan; mounted file is simpler to rotate). |
| `GDRIVE_FOLDER_ID` | The ID of the single folder the client shared. |

Following the Postiz precedent, the plugin's gating (`check_fn`) makes both tools
**fail gracefully** when these are unset — the agent reports "no Drive folder is
connected yet" instead of crashing. `requires_env: []` in `plugin.yaml`.

### Dependency

Add `google-api-python-client` + `google-auth` to the agent image. Decide in the
implementation plan whether to extend the per-company `Dockerfile` or the base
image; per-company is safer (keeps the base untouched and matches how `postiz`
is layered).

---

## Data flow

**Onboarding (operator, scripted):**
1. Run provisioning script → creates `viktor-<slug>` service account + JSON key.
2. Give the client the SA email + a one-line instruction: "Right-click your
   folder → Share → paste this email → Viewer → Send."
3. Obtain the folder ID (from the client's URL, or read it back via the API once
   the share lands).
4. Write `GDRIVE_SA_KEY` + `GDRIVE_FOLDER_ID` into the stack `.env`; rebuild /
   restart the stack.

**Runtime (per agent turn):**
1. Viktor calls `drive_list_files` → plugin authenticates with the SA key →
   `files.list(q="'<FOLDER_ID>' in parents", ...)` → returns the listing.
2. Viktor calls `drive_read_file(id)` → plugin verifies ancestry → downloads /
   exports content → hands it to the model (or to `image_generate` as a
   reference image).

---

## Error handling

- **Creds unset** → tools return a clear "Drive not connected" message; no crash
  (mirrors how `postiz_*` behaves with no key).
- **Folder not shared yet** (SA has no access) → empty list / explicit "I can't
  see the folder — has it been shared with `<sa-email>`?" message.
- **File too large** → cap download size (set a sane limit in the impl plan) and
  return metadata + a "too large to read inline" note.
- **Wrong/foreign file ID** (not under the configured root) → refuse; never
  return content for a file outside the scoped folder.
- **Rate / transient API errors** → bounded retry, then a graceful tool error.

---

## Persona / config.yaml

Add a short note to the agent's `system_prompt` so Viktor knows it can read the
client's connected Drive folder, and *when* to use it — e.g. "Before generating
images, check the Drive workspace folder for the client's logo and brand
references and pass them to `image_generate`." Keep it brief; the tools are
self-describing.

---

## Verification (acceptance)

1. `hermes tools | grep drive_` lists `drive_list_files` and `drive_read_file`.
2. With a test folder shared to the SA: `drive_list_files` returns its files;
   `drive_read_file` returns a known file's content.
3. **Isolation test (the important one):** point the plugin at a *different*
   client's folder ID (one the SA was NOT shared into) → Google returns
   `403/404` and the tool refuses. Confirms the credential, not the code, is the
   wall.
4. With creds unset: tools report "not connected," agent keeps working otherwise.
5. End-to-end: from Telegram, "use the logo in my Drive folder to generate a
   post image" → Viktor lists the folder, reads the logo, passes it to
   `image_generate`, returns a branded image.

---

## Phase 2 (sketch — not part of this build)

When write-back is wanted, swap the free service account for a real, quota-bearing
identity so Viktor can also *save* files into the folder:

- Stand up **Google Workspace** on a GF domain.
- Mint a per-client real account `viktor-<slug>@<gf-domain>` via the Admin SDK
  (scripted, no manual signup) — **only for clients who need write**, one cheap
  seat each (~€6/mo).
- Same isolation model unchanged (one identity per agent, one folder per
  identity, credential held only by that container).
- Extend the `drive` plugin with `drive_save_file` and adjust the scope to
  `drive.file` or `drive` as needed.

The Phase 1 plugin, credential wiring, and isolation model are all forward-
compatible, so Phase 2 is additive — no rework.

---

## Open questions for the implementation plan

- `GDRIVE_SA_KEY` as a mounted file vs base64 env blob (rotation ergonomics).
- Recurse into subfolders by default, or list top-level only?
- Where the provisioning script lives and whether it also auto-detects the
  folder ID after the client shares.
- Whether to also surface a `drive_search_files` tool, or keep Phase 1 to
  list + read only (YAGNI default: list + read only).

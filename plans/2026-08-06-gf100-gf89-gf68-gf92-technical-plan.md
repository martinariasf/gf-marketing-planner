---
title: "GF-100 / GF-89 / GF-68 / GF-92 — high-priority batch"
date: 2026-08-06
status: done_in_staging
merged_commit: a00fe4a
staging_deployed: 2026-08-07
default_group: item
base_branch: experimental
base_commit: 6c6fa95
---

# High-priority batch — 2026-08-06

Four Notion items taken from the GF Platform Backlog: all High/Urgent, all
S/M, all clear enough to build. Planned by four Opus research agents against
the real repo; implemented by Sonnet agents, one worktree per branch.

Martin's decisions (2026-08-06, this session):
1. **GF-89** — fix the two *confirmed* defects now; reproduce before fixing the
   unconfirmed typing bug. Do not speculate.
2. **Config toggles** — **per client/workspace**, stored in the existing
   `org_configs` collection. No new store.
3. **Auto-schedule on approve** — approval always succeeds even if scheduling
   fails (warning, never a 502). The **agent is excluded**: Viktor's
   `PATCH {status:'approved'}` must NOT auto-schedule. Human approval only.
4. **GF-68** — text formats only in v1 (PDF/DOCX → GF-68b). Document files are
   **not** publicly served; only images are.
5. **GF-92 ships as two branches** — the bug fix standalone, then the
   Configuration feature.

## Branches

| Branch | Item | Scope |
|---|---|---|
| `claude/gf-92a-scheduled-status-bug` | GF-92 (A) | Programmed-not-listed bug |
| `claude/gf-92b-configuration-toggles` | GF-92 (B–E) | Configuration menu + 2 toggles |
| `claude/gf-89-encoding` | GF-89 | Mojibake + subprocess UTF-8 + repro |
| `claude/gf-68-chat-attachments` | GF-68 | Chat uploads v1 |
| `claude/gf-100-limit-notifications` | GF-100 | Silent-limit patches |

Dependency: **92a must merge before 92b** (D2 relies on A1's status writes).
The other three are independent and run in parallel.

---

## GF-92 (A) — Programmed-not-listed bug

Two independent defects; either alone reproduces part of the report.

**BUG-1** `deploy-staging/api/src/routes/viktorOwned.ts:548-559` — the approvals
path writes an `approvals_v2` row and a `publishing` patch but never patches
top-level `status`. A "Programado" post stays `status:'approved'`. Downstream
consumers key off top-level `status`, so Postiz is never polled
(`scheduling/sync.ts:174`), moving out of Programmed never cancels the job, and a
date change never reschedules. The PATCH path does it correctly
(`viktorOwned.ts:280`) — the asymmetry is the bug.

**BUG-2** `deploy-staging/api/src/schemas/post.ts:259-263` — when an `approval`
block exists without a `status` key (the shape Viktor writes), it defaults to
`'idea'`, so `laneFor()` puts the post in Draft regardless of
`status:'scheduled'`. The SPA mirror (`normalize-post.ts:99`) already does this
correctly; the API is the outlier.

- **A1** Mirror the scheduling status into the post on the approvals path
  (`viktorOwned.ts:533-559`). Capture `result.status` (discarded at `:539`) and
  include `status` in the `persistSchedulingPatch` body at `:558`, for every
  decision. Never write `status` for an already-`published` post.
  *Accept:* `POST /approvals {decision:'scheduled'}` → `GET` returns both
  `status:"scheduled"` and `approval.status:"scheduled"` + non-null
  `publishing.providerJobId`.
- **A2** Fix the `coalescePost` default (`post.ts:262`): inherit `p.status`
  instead of `'idea'`. Unit test in the `approvalFromPatch.test.ts` style.
  *Accept:* `coalescePost({status:'scheduled', approval:{version:2}})` →
  `approval.status === 'scheduled'`.
- **A3** Harden lane detection in `scheduling/sync.ts:92,174` with a local
  `laneOf(post) = post.approval?.status ?? post.status`, so cancel-on-move-out,
  reschedule-on-date-change and publish polling work for legacy rows too.
- **A4** Surface scheduling confirmation in the UI
  (`approval-kanban.tsx`, `calendar.tsx`). Requires widening
  `normalize-post.ts:105-109` and `types/post.ts` to keep `provider`,
  `providerJobId`, `scheduledFor`, `lastError`.
  *Accept:* a Programmed card shows "Scheduled for <date> via Postiz"; a
  Programmed post with no `providerJobId` shows a warning chip.
  New i18n keys `schedule.confirmedAt|notConfirmed|failed` × EN/DE/ES.
- **A5** (ops, no code) Report staging posts with `approval.status='scheduled'`
  but no `providerJobId`. **Do not auto-backfill** — a missing job means it was
  never scheduled, and silently re-scheduling could publish unreviewed content.

## GF-92 (B–E) — Configuration menu

- **B1** Add a `settings` json field to `org_configs`
  (`ensureCollections.ts:206-214`). Additive, idempotent.
- **B2** `GET`/`PUT /clients/:slug/config/settings` in
  `routes/planningConfig.ts`, copying the `calendar-range` handler shape
  including `audit()`. Defaults: `showAiGeneratedLabel: true` (GF-65 shipped on —
  do not silently regress it), `autoScheduleOnApprove: false`.
  PUT is `requireRole('dash','admin')`; the **agent role may not flip these**.
  Unknown keys → 422.
- **B3** `apiLoadOrgSettings` / `apiSaveOrgSettings` in `lib/api-client.ts`, with
  client-side defaults so file-mode never breaks.
- **B4** Add `settings` to `ClientBundle` (`lib/client-data.ts:165-176`, `:225`)
  so every client route gets it via `useOutletContext` with no prop drilling.
- **B5** Expose **only** `showAiGeneratedLabel` on the public review payload
  (`routes/reviewPublic.ts:170-181`). `autoScheduleOnApprove` must not leak.
- **C1** New `app-v2/src/components/ui/info-hint.tsx` — no reusable tooltip
  exists in the repo (only native `title=` and recharts' chart-only Tooltip).
  No new dependency; keyboard-focusable, Escape-dismissible.
- **C2** New route `app-v2/src/routes/client/configuration.tsx`, registered in
  `App.tsx` and `routes/client/layout.tsx:73-83`. A **new sibling nav entry**,
  not folded into Integrations (that page is developer/credential-facing).
- **C3** i18n keys in all three dicts (`i18n-dict.ts`, EN ~:20, DE ~:915,
  ES ~:1783). Plain-language info copy for both toggles.
- **D1** `loadOrgSettings(slug)` helper; never throws into a request path.
- **D2** Apply on the approvals path (`viktorOwned.ts:528-559`). On
  `decision==='approved'` + toggle on, attempt the `scheduled` transition.
  **If scheduling fails the approval still succeeds** as `approved` with a
  non-fatal `scheduleWarning` (HTTP 201, not problem+json).
- **D3** ~~Same on the agent PATCH path~~ — **cut per Martin's decision.** The
  agent's `PATCH {status:'approved'}` must not auto-schedule. Add a test
  asserting this.
- **D4** Surface `scheduleWarning` as `toast.warning` in `approval-kanban.tsx`
  and `calendar.tsx`.
- **E1/E2** Gate the GF-65 AI label by passing `undefined` for `aiLabel` at
  `calendar.tsx:939` and `review/external.tsx:361`. The mockup components already
  document "omit to hide" — **no component change**. External default `true` when
  the field is absent, so an older API never blanks the badge.

## GF-89 — encoding

Chain traced end to end: **no character-stripping transform found** on
SPA → API → PocketBase → Postiz(REST). Ruled out: PocketBase field types,
`sanitizePost`, every `encodeURIComponent`, every `readFile`/`Buffer.from`,
`_normalize_newlines` (GF-63's code — a red herring here).

- **1** Add an encoding round-trip regression test in `deploy-staging/api/src`
  (probe `áéíóú ñ Ñ ¿ ¡ ü « » — …`) through `postSchema` → merge →
  `sanitizePost` → `toPostizPayload`. It should pass today; that is the point.
- **2** Repair 16 mojibake sequences in
  `app-v2/src/routes/client/calendar.tsx` (entered via commit `8398a9d`).
  Three are **user-visible**: `:441` export range label, `:1991` and `:2010`
  placeholders. Save UTF-8 **without BOM**. Do not use PowerShell
  `Set-Content`/`Out-File` without `-Encoding utf8` or the bug returns.
- **3** Force UTF-8 in the agent Postiz subprocess
  (`deploy-prod/gf-innov-agent/plugins/postiz/__init__.py:113-120`): add
  `encoding="utf-8", errors="replace"`, set `PYTHONUTF8=1` / `LANG=C.UTF-8` in
  the env dict at `:106-111`, and add `ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
  PYTHONUTF8=1` to the Dockerfile. Gate the *urgency* on the locale probe but
  apply regardless — `text=True` with no `encoding=` is a latent defect.
- **4** (gated on repro) explicit `; charset=utf-8` on outbound Content-Type.
- **5** (gated on repro) dead-key/composition handling. `editable-textarea.tsx:32-34`
  resets `draft` on every `value` prop change, which can clobber an in-flight
  composition — a plausible mechanism for "the accent I just typed disappeared".
- **Repro** (before 4/5): probe string typed into the copy field → DevTools raw
  payload → API GET → PocketBase `posts_patches` → reload → Postiz via dashboard
  → Postiz via agent. Plus the one-command locale check:
  `docker exec <agent> python3 -c "import sys,locale;print(sys.getfilesystemencoding(), locale.getpreferredencoding(False), sys.stdout.encoding)"`.
  Plus the dead-key check: type `´`+`a` vs paste.
- **Open with Pilar:** "no se suman" (never appear — keyboard/IME) vs
  "se pierden/corrompen" (appear then mangle — encoding). Disjoint causes.

## GF-68 — chat attachments v1

Hard constraint: `deploy-staging/docker-compose.yml:31` mounts `./clients`
**read-only**, so the API cannot write to the workspace folder. Attachments go
to PocketBase, like `inspiration_assets`.

Already works, no agent code needed: `plugins/image_gen_openrouter`
`reference_images` accepts public URLs, and `_internal_api_url` rewrites any
`/api/v1/` URL to the in-container API base.

- **1** New PB collection `chat_attachments` + an `attachments` json field on
  `chat_messages` (`ensureCollections.ts`).
- **2** `POST /clients/:slug/chat/attachments` (new
  `routes/chatAttachments.ts`), mirroring `inspiration.ts:61-121`. Images
  png/jpeg/webp/gif ≤10 MB, max 4/message. Documents: hoist `TEXT_EXT_RE` /
  `isTextUpload` out of `planningConfig.ts:179-187` into a shared
  `textUpload.ts` so the two surfaces can't drift; ≤2 MB, text extracted
  server-side, truncated at 40 000 chars. Everything else → 415.
- **3** `GET /clients/:slug/chat/attachments/:id/file` in `assetFiles.ts`,
  unauthenticated (an `<img>` can't carry a bearer, and the agent must fetch
  it) — **but images only**; documents 404 there per Martin's decision, since
  their text is inlined anyway.
- **4** Relay (`routes/chat.ts`): accept `attachments:[{id}]`, re-read each from
  PB and **reject any whose `slug` ≠ the route slug**, cap at 4, persist
  metadata on the `chat_messages` row, and inject an `--- ATTACHMENTS ---`
  block into the Hermes `input`. Needs an absolute `PUBLIC_API_BASE`.
- **5/6** `apiUploadChatAttachment` + composer UI in `chat-sheet.tsx`
  (paperclip + drag-drop, handlers copied from `references.tsx:111-135`,
  removable chips, submit enabled when text **or** attachments present).
- **7** i18n keys × EN/DE/ES.
- **8** Agent prompt lines in `staging-demo-agent/config.yaml` telling Viktor to
  pass IMAGE urls to `reference_images` and treat DOCUMENT text as context.
  **Box-side: not covered by CI**, needs a container restart.

**Out of v1:** PDF/DOCX parsing (GF-68b), vision/multimodal passing, attachments
in history replay, Assets-manifest integration, Telegram uploads, deletion,
quotas, virus scanning, video.

**PROD PROMOTION BLOCKER (GF-68).** The agent-facing attachment URL uses the
public hostname, which is safe *only* because the image-gen plugin's
`_internal_api_url()` rewrites any `/api/v1/` URL to the in-container API base
before fetching. That rewrite was verified in
`deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/__init__.py`.
It is **NOT verified for prod**: the repo's two agent plugin trees are disjoint
— `deploy-prod/gf-innov-agent/plugins/` contains only `drive` and `postiz`,
while `deploy-staging/staging-demo-agent/plugins/` contains only `drive` and
`image_gen_openrouter`. Prod's image-gen plugin source lives solely on the box.
Before promoting GF-68 to production, confirm the prod plugin performs the same
rewrite, or the prod agent will be handed a public URL it may not resolve from
inside its container and reference images will silently fail.

## GF-100 — notify on limits instead of failing silently

Not greenfield: `plans/2026-06-26-agent-voice-non-llm-messages-technical-plan.md`
TASK-005 is still `in_progress`, and the dashboard/quota half already shipped —
`deploy-staging/api/src/agentMessages.ts` has the 3-language catalog and
`routes/chat.ts:306-358` already routes failures through it. GF-100 finishes the
**Telegram** side plus the **truncation** case.

**Blocker:** `agent/conversation_loop.py` is **not in this repo** — it exists
only inside `hermes-agent:base` on the box. The spec's "line 1490" is
unverified.

- **1** Extract the real source from the image and record an anchor table
  (file, line, exact string) + the base-image digest. **Nothing may be written
  before this.** Do not write a patch anchor from the ticket text.
- **2** Add `output_truncated` to `agentMessages.ts` (+ tests). Extend the quota
  classifier with the literal `'key limit'` / `'daily limit exceeded'` — **not**
  a bare `'403'`, which would swallow unrelated auth failures.
- **3** Wire `output_truncated` into the dashboard relay; the contract is that
  the agent patch emits the localized text and the relay must not overwrite it
  with `completed_with_writes`.
- **4** `patches/patch_localized_errors.py` (completes TASK-005) — append a
  marker-guarded block at the END of `gateway/run.py` rebinding
  `_gateway_provider_error_reply` and `_normalize_empty_agent_response`.
  Append-at-end wins on module-global lookup and avoids fragile body matching.
- **5** `patches/patch_truncation_reply.py` — target the `final_response = None`
  site in `conversation_loop.py`. Separate script from 4 (different file,
  different failure mode, independently revertible); share strings via
  `patches/_gf_messages.py`.
- **6** Wire both into `deploy-prod/gf-innov-agent/Dockerfile` inside the
  existing `USER root` block, after `patch_api_server.py`, before `USER 10000`.
  **UPDATE (2026-08-10, GF-100 staging-base follow-up):** the round-1 worry
  below — that the staging box needs a hand-edited Dockerfile variant,
  applied out-of-band and invisible in this branch's diff — turned out to be
  avoidable. `patch_truncation_reply.py` now detects which of the two known
  `hermes-agent` base shapes it's running against and patches accordingly, so
  the **same** `COPY`/`RUN` lines added to `deploy-prod/gf-innov-agent/
  Dockerfile` in this commit can be applied to the staging box's Dockerfile
  unmodified — no hand-edited variant, no box drift. `patch_localized_errors.py`
  already worked on both bases unmodified; now both of GF-100's patch scripts
  do.

  Base images and shapes, verified 2026-08-10 by extracting
  `agent/conversation_loop.py` directly from both images on the box
  (`docker run --rm --entrypoint python3 <image> -c "print(open('/opt/hermes/agent/conversation_loop.py').read())"`):

  | Base image | Digest | Shape | Sites |
  |---|---|---|---|
  | `hermes-agent:base` (prod) | `sha256:7912de37a2ad4bca0a10cec0d61060b4a3287ac010ffe1992004cad9c5dac538` | none-form — all 4 truncation returns use `"final_response": None` | 4 sites, each paired with a literal `"error"` string |
  | `hermes-agent:base-v2026.7.1` (staging) | `sha256:b43257d3de7a8a363431a7fa1ab8d5e5b7b7b910218d65e581f693413ca8f73d` | literal-form — `"final_response": None` occurs 0 times; upstream already partially fixed this by putting the raw English literal directly into `final_response` | 4 sites: 1 ternary (only the truncated branch is a target; the stall-message branch is a different string and stays untouched) + 3 paired `final_response`/`error` literal sites (only `final_response` is localized; all 3 sibling `error` literals are internal diagnostics and stay untouched) |

  `patch_truncation_reply.py` tries the none-form anchor first (exactly 4
  matches expected); if that doesn't match, it tries the literal-form anchors
  (exactly 1 ternary + 3 paired matches expected); if neither shape matches
  its expected count, it hard-fails with `sys.exit(1)` rather than silently
  no-op'ing or patching the wrong number of sites. Both shapes are covered by
  `patches/test_patch_truncation_reply.py`, including against the real
  extracted sources from both images.

  Original round-1 concern (now resolved, kept for history): "this
  staging-box hand-edit is NOT visible in this branch's diff — the prod
  Dockerfile change ships in this commit, but the equivalent lines on the
  staging box's Dockerfile must be hand-added separately when this deploys...
  if that hand-edit is skipped, staging silently keeps failing while prod is
  fixed." That workaround is no longer needed: apply the identical
  `COPY`/`RUN` block to the staging box's Dockerfile, same as prod — no
  divergent script, no divergent Dockerfile content, no drift to hand-track.
- **7** Verify both paths on staging: temporarily set `max_tokens: 64`, force a
  tool call from Telegram **and** from the dashboard chat; evaluate the patched
  fns in-container against a synthetic `403 Key limit exceeded`. Leak-check the
  output for `403`, `Traceback`, `sk-or-`, `Bearer` — zero hits.
- **8** Close TASK-005 in the 2026-06-26 plan and cross-reference GF-100.
- **Split out:** proactively notifying Martin when the daily cap is crossed —
  needs a channel decision and is not in the acceptance criteria.

---

## Verification (all branches)

```bash
cd app-v2 && npx tsc -b && npx vite build
cd deploy-staging/api && npx tsc --noEmit && npm test
```
Agent/plugin changes: `python -m py_compile` the touched files.

Then per the house process: Layer-5 `independent-review` (cross-vendor) before
merge → changelog entry at the top of `app-v2/src/lib/changelog.ts` for every
user-visible change → merge to `experimental` → Notion → "Done in Staging".

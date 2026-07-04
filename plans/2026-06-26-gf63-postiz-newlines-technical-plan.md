---
project: Literal \n appears only in Postiz-published posts (GF-63)
updated: 2026-06-26
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004]
items:
  - gf-63: Platform writing \n in the post sent to Postiz | priority: urgent
---

# Plan

## Simple Words

A published post (the real social post, pushed out through Postiz) shows the
literal characters `\n` between paragraphs. **In the dashboard the same post looks
perfect** — the line breaks render normally.

That single fact (dashboard fine, Postiz broken) is the whole diagnosis:

- The dashboard renders post copy with CSS `whitespace-pre-line`
  (`app-v2/src/components/post-card.tsx:50`, `channel-mockup/instagram.tsx:89`).
  That CSS renders **real newline bytes** as line breaks but would show a literal
  two-character `\n` verbatim. Since the dashboard looks correct, the **stored
  `copy` contains real newlines** — the database is clean.
- Therefore the corruption is **only in the publish path to Postiz**, where a real
  newline (one byte, `0x0A`) is turned into the two visible characters `\` + `n`.
  Turning a real newline into a visible `\n` is exactly what JSON-escaping does —
  so somewhere on the way to Postiz the text is being JSON-escaped one extra time
  (or a literal `\n` is being introduced), with no matching decode.

**This invalidates the earlier theory** that the stored data was corrupt. It is
not. The bug lives strictly between "approved post" and "Postiz API call".

There are **two** code paths that can send a post to Postiz, and they behave
differently — the fix depends on which one actually published the bad posts:

- **Path A — the platform (dashboard "Programmed" lane).** `viktorOwned.ts` PATCH
  → `applyStatusToSchedule` → `PostizProvider.schedule` →
  `toPostizPayload` (`deploy-staging/api/src/scheduling/postiz.ts:87`) →
  `JSON.stringify` once in `postizFetch`. Reading the code, this path encodes the
  real newline **correctly** (one stringify → standard `\n` on the wire → Postiz
  decodes to a real newline). For this path to be guilty, Postiz must mishandle our
  payload shape — possible but not yet evidenced.
- **Path B — Viktor's agent tool `postiz_schedule_post`** (`plugins/postiz/__init__.py`).
  This is the strong suspect. The handler **loads the approved dashboard post only
  to verify it, then publishes Viktor's re-typed `content` argument instead of the
  post's stored `copy`** (`__init__.py:328`, `content = args.get("content")`). When
  the model re-transcribes a multi-paragraph caption into a tool argument it readily
  emits a literal `\n`; that literal then flows `posts:create -c <content>` → CLI
  JSON-encodes → Postiz → published as a visible `\n`. This perfectly explains
  "dashboard clean, Postiz broken": the stored copy is never touched; only Viktor's
  transient re-typed copy carries the literal `\n`.

**Strong corroborating evidence (code, 2026-06-26):** the **staging** agent
(`deploy-staging/staging-demo-agent/plugins/`) has only `image_gen_openrouter` —
**no Postiz plugin**. The Postiz plugin exists **only in prod**
(`deploy-prod/gf-innov-agent/plugins/postiz/`). So Path B can only fire in prod —
which is exactly where the bug bit real published posts. Path A's adapter, read
line by line, JSON-encodes newlines correctly (a literal `\n` from it would be a
universal Postiz bug, not a GF-only one). Together this makes **Path B the
overwhelming favorite** and explains the prod-only symptom.

**Decisive discriminator (no guessing):** inspect one of the bad posts. If it has
`publishing.providerJobId` set, it went out via **Path A** (the platform). If not,
it was published by **Path B** (Viktor's tool). TASK-001 settles this with evidence
before any code changes — per the debugging rule, no fix without a confirmed root
cause.

**Verification asymmetry to plan around:** because staging has no Postiz plugin, a
Path B fix **cannot be exercised on staging as-is** — verification must happen on
prod, or by temporarily adding the plugin to the staging agent. TASK-004 accounts
for this.

**Leading fix (Path B), and it is a real root-cause fix, not a patch:** the tool
already fetches the authoritative approved post — it should **publish that post's
stored `title`+`copy`** (byte-identical to the dashboard) and ignore Viktor's
re-typed `content`. That removes the entire class of "agent re-transcribes and
drifts/escapes the copy", not just the `\n` symptom. A defensive
`\n`→newline normalize is the belt-and-suspenders second layer.

Scope: staging only; prod promotion is a follow-up (TASK-005).

## Diagnosis (do this first — no fix before root cause)

### TASK-001: Confirm the publish path + capture the exact bytes sent to Postiz
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-63-postiz-newlines
area: diagnosis
estimate: S
depends_on: []
tags: [gf-63, postiz, diagnosis]
acceptance:
- For a known-bad post (one that published with literal `\n`), record whether `publishing.providerJobId` is set — `GET /clients/<slug>/posts/<id>`. Set ⇒ Path A (platform); unset ⇒ Path B (agent tool). Result written into this task's notes.
- Confirm the stored `copy` for that post contains a REAL newline (e.g. `GET …/posts/<id>` and inspect the raw bytes / `od -c`), proving storage is clean. Expected: real `\n` byte, not `\\n`.
- Capture the actual content string at the Postiz boundary for the live path:
  - Path A: log `JSON.stringify(toPostizPayload(...))` (or the `content` field) right before `postizFetch` POSTs to `/posts`.
  - Path B: log the `content` value at `plugins/postiz/__init__.py:328` AND the exact `posts:create -c` argument, before the CLI call.
- Conclusion recorded: at which boundary does a real newline first become a literal `\n` (or where is a literal `\n` first introduced).
notes:
- Source: GF-63 (Notion, Urgent, Inbox, Bug). Symptom corrected by Martin: dashboard renders fine; only Postiz/real post shows `\n`.
- Hypothesis ranking from code review: Path B (agent re-typed `content`) most likely; Path A (platform → Postiz contract) secondary. Corroborated 2026-06-26: the Postiz plugin exists only in `deploy-prod/gf-innov-agent/plugins/postiz/` — staging has none — so Path B is prod-only, matching the prod-only symptom.
- **Access note:** this box has no marketing-platform API token (`API_TOKEN`/`API_BASE` unset locally), so the live `GET …/posts/<id>` and the prod-Viktor reproduction must be run by Martin (or with a token handed over). The instrumentation in this task is the fast way to capture the boundary bytes.
- Fastest confirmation without code: ask prod Viktor in chat to schedule an approved multi-paragraph post to Postiz, then check the Postiz preview. If it shows `\n`, Path B is confirmed.
- Diagnosis result: __TBD — fill in before starting any fix task.__

## Fix — Path B (agent tool) — apply if TASK-001 confirms it

### TASK-002: Publish the approved post's stored copy, not Viktor's re-typed argument
status: blocked
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-63-postiz-newlines
area: agent
estimate: M
depends_on: [TASK-001]
tags: [gf-63, postiz, agent, plugin]
acceptance:
- In `_handle_postiz_schedule_post` (`deploy-prod/gf-innov-agent/plugins/postiz/__init__.py` — the plugin's only home; staging has none), the text published comes from the verified post returned by `_load_approved_dashboard_post` (its stored `title`/`copy`), NOT from `args.get("content")`. Build the caption the same way the platform does: `[title, copy]` joined by a blank line.
- `content` becomes optional in the schema (kept only as an ignored/legacy hint, or dropped from `required`); the docstring states the tool always publishes the dashboard's stored copy so chat and the real post can never drift.
- Defense in depth: whatever string is finally passed to `posts:create -c` is run through `normalize = lambda s: s.replace("\\r\\n", "\n").replace("\\n", "\n")` so any stray literal `\n` is collapsed to a real newline before the CLI call.
- `python -m py_compile` passes on the plugin file; no other tool path changed.
notes:
- This is the root-cause fix for Path B: the authoritative, dashboard-verified copy (real newlines) is what gets published, so the output is byte-identical to what the user approved. It also closes copy-drift/hallucination, not just `\n`.
- Plugin is bind-mounted on prod (per `reference_prod_agent_gf_innov_internals`): a container restart reloads it, no rebuild.
- Because the plugin is prod-only, this fix lands on the prod agent directly. If a staging dry-run is wanted first, copy the plugin into `deploy-staging/staging-demo-agent/plugins/postiz/` temporarily to exercise it (see TASK-004).

## Fix — Path A (platform → Postiz) — apply if TASK-001 points here instead

### TASK-003: Correct the Postiz payload/content contract in the scheduling adapter
status: blocked
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-63-postiz-newlines
area: api
estimate: M
depends_on: [TASK-001]
tags: [gf-63, postiz, api]
acceptance:
- Using the bytes captured in TASK-001 and the Postiz public API docs (https://docs.postiz.com — `/public/v1/posts`), reconcile what `toPostizPayload` (`deploy-staging/api/src/scheduling/postiz.ts:87`) sends with what Postiz actually expects for post content (flat `content` string vs the documented per-integration `value[].content`, and whether line breaks must be real `\n` vs `<br>`).
- Apply the minimal change so a real newline in `copy` is published as a real line break (no visible `\n`). If Postiz needs HTML, convert `\n` → `<br>` at the adapter boundary only; if Postiz double-decodes, stop the extra escape.
- Add a focused unit test in the api package: given a `SchedulablePost` whose `copy` has a real newline, the Postiz request body is asserted to carry the line break in the form Postiz renders correctly.
- `cd deploy-staging/api && npx tsc --noEmit` passes; new test passes.
notes:
- Only do this branch if TASK-001 shows the bad posts carry `publishing.providerJobId` (platform path). Otherwise this code is not the culprit and changing it risks masking nothing.

## Verification

### TASK-004: Verify the real Postiz output, merge, update Notion + changelog
status: blocked
owner: martin
agent: human
reviewer: human
branch: none
area: verification
estimate: S
depends_on: [TASK-002, TASK-003]
tags: [gf-63, verification]
acceptance:
- End-to-end through the SAME path TASK-001 identified: approve a post with a multi-paragraph caption, publish it, and confirm the REAL Postiz post (preview or live) shows true line breaks — no visible `\n`. Dashboard must still render identically.
- **Path B caveat:** staging has no Postiz plugin, so a Path B fix is verified either (a) directly on prod with a throwaway approved post, or (b) by temporarily copying the patched plugin into `deploy-staging/staging-demo-agent/plugins/postiz/` and exercising it against staging Postiz, then removing it. Decide which with Martin before verifying.
- Regression: the other (non-guilty) path is spot-checked to confirm it was already correct and remains correct.
- Whichever fix was applied is committed on `claude/gf-63-postiz-newlines`; for the prod plugin, follow `promote-staging-to-prod`/`reference_prod_agent_gf_innov_internals` (bind-mounted config+plugins, restart reloads).
- Notion GF-63 → "Done in Staging" (or "Done in Main" if the prod plugin fix is applied straight to prod — record which).
- Dated entry at the TOP of `app-v2/src/lib/changelog.ts` (user-visible: published posts now keep their line breaks).
notes:
- Independent cross-vendor review (codex) before merge per new-task-workflow.
- The earlier hypothesis (corrupt stored data) is explicitly retired; do not add storage/coalescePost normalization for this bug — the database is clean.

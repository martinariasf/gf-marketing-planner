---
project: Agent Voice — Localized, Friendly Non-LLM Messages
updated: 2026-06-26
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004]
items:
  - gf-61: Lenguage of agent sometimes changing to english | priority: medium
  - gf-59: Daily limit msg to be clear | priority: medium
  - gf-39: Lenguage Tecnico | priority: medium
---

# Plan

## Simple Words

When Viktor writes his own answers, he already speaks the right language (Spanish
for GF). The problem is the text that does **not** come from Viktor's brain — it
comes from the plumbing around him:

- The "you have no more credits" / daily-limit message (today: raw English).
- Technical status lines like "Still working.. iteration 3", "interrupting
  current task", "file mutation verifier: 1 file were NOT modified".
- Internal run errors ("the agent run did not complete cleanly", "timed out").

These never pass through the language model, so telling Viktor "speak Spanish"
in the prompt cannot fix them. This plan builds a small **message catalog** (one
friendly sentence per known situation, in ES/DE/EN) plus a **classifier** that
recognizes "I know this type of message" and swaps the raw plumbing text for the
friendly localized version. Each client gets a fixed language (GF = Spanish), so
even a system message with no user text knows which language to use.

What is fully solved now: every non-LLM message **in the dashboard chat**.
**INVESTIGATION RESULT (2026-06-26):** Hermes already ships a full i18n system
(`agent/i18n.py` + `locales/es.yaml`, complete Spanish translation). It is
switched on with one config key — `display.language: es` — and NO deployed
stack currently sets it (all default to English, including the Spanish-market
biomas bot). Turning it on makes every slash-command reply, approval prompt,
usage/token report, restart/compression notice etc. Spanish for free. BUT the
i18n scope **deliberately excludes** error tracebacks, tool outputs, and
agent-generated text — so the three things Martin actually complained about are
only *partly* covered:
  - "Still working… (N min elapsed)" → hardcoded English (`run.py:17089`),
    suppressible via `tool_progress: off` (already set on gf-innov) +
    `cleanup_progress: true`.
  - "File-mutation verifier: N file(s) were NOT modified" → hardcoded English
    footer (`run_agent.py:1815`), suppressible via `display.file_mutation_verifier: false`.
  - "No more credits / quota" error → classified by `error_classifier.py` but
    surfaced as raw English provider text; **NOT** in the locale catalog. This is
    the ONE item that still needs real code. The LLM never sees it (the model
    call itself failed), so a system prompt can't fix it either.

This collapses most of TASK-004/005 into config (TASK-007). What survives:
the quota/credit message, which must be localized in GF's relay for the
dashboard (TASK-004, shrunk) and via a gateway hook for Telegram (TASK-005,
shrunk to one message).

Out of scope: changing how Viktor writes his own (LLM) replies — that already
works.

## Decisions and API Contracts

### TASK-002: Add a fixed per-client `language` setting and plumb it to the chat relay
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-61-59-39-agent-voice
area: api
estimate: S
depends_on: []
tags: [notion, gf-61, gf-59, gf-39, i18n, config]
acceptance:
- Client config carries a `language` value (`es` | `de` | `en`); gf-innov = `es`.
- The chat route resolves the active client's language and passes it to the
  message-catalog helper (TASK-003) for every non-LLM message it emits.
- A client with no `language` set falls back to `en` without throwing.
notes:
- Source: GF-61 ("The Agent should speak spanish all the time") — clarified by
  Martin 2026-06-26: the LLM language is fine; only NON-LLM/automatic messages
  are wrong. Decision: fixed per-client locale, not detect-from-history, because
  system messages (e.g. quota) have no user text to detect from.
- DONE 2026-06-26 (commit 3997d20 on claude/gf-59-quota-message-catalog).
  IMPLEMENTATION DECISION: the API does NOT read clients/<slug>/index.json (that
  is SPA seed data; the API is PocketBase-backed and index.json has no language
  field). So per-client language is an ENV map — CLIENT_LANGS_JSON + DEFAULT_LANG
  — parsed in env.ts, resolved via resolveClientLang(slug). This mirrors the
  existing HERMES_AGENTS_JSON/resolveHermesAgent pattern exactly and is set at
  deploy time. Behavior: map entry wins (value normalized; garbage → en); absent
  slug → DEFAULT_LANG (en unless set). DEPLOY ACTION REQUIRED: set
  CLIENT_LANGS_JSON={"gf-internal":"es","biomas":"es"} on the staging+prod API
  containers (note: GF's dashboard slug is `gf-internal`, not `gf-innov`).
- Unit test: env.test.ts (resolveClientLang map/default/garbage cases).
- Code evidence: deploy-staging/api/src/routes/chat.ts resolves `slug` per
  request — language looked up right after resolveHermesAgent.

## Backend Implementation

### TASK-003: Build a message catalog + classifier module (ES/DE/EN)
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-59-quota-message-catalog
area: api
estimate: M
depends_on: [TASK-002]
tags: [notion, gf-59, gf-61, gf-39, i18n]
acceptance:
- A new module exports `classify(rawError: string): MessageKey` and
  `message(key: MessageKey, lang: Lang): string`.
- Keys cover at least: `quota_exhausted`, `rate_limited`, `timed_out`,
  `run_failed`, `no_final_text`, `stream_ended`.
- `classify` maps OpenRouter/provider quota text (regex: `402`, `daily limit`,
  `quota`, `insufficient credits`, `rate.?limit`) to `quota_exhausted` /
  `rate_limited`; anything unrecognized returns `run_failed` (safe generic).
- Each key has a friendly, non-technical ES/DE/EN string. `quota_exhausted` ES ≈
  "Has alcanzado el límite diario de uso. Los créditos se renuevan a medianoche —
  ¡hasta mañana!".
- Unit-tested: known raw strings classify correctly; every key has all 3 langs.
notes:
- DONE 2026-06-26 (commit 3379458 on claude/gf-59-quota-message-catalog).
  Module deploy-staging/api/src/agentMessages.ts: classify() + message() +
  friendlyError() + normalizeLang(); keys quota_exhausted, rate_limited,
  timed_out, run_failed, no_final_text, completed_with_writes, stream_ended.
  Patterns mirror Hermes error_classifier.py. 9 node:test cases (typecheck OK,
  build clean, dist excludes *.test.ts). NOT yet wired — TASK-004 imports it.
- NOTE: depends_on listed TASK-002 (per-client language), but the module itself
  is standalone (takes a Lang param). TASK-002 + TASK-004 do the wiring/lookup.
notes:
- Source: GF-59 (clear daily-limit msg), GF-61 (Spanish), GF-39 (no jargon).
- Code evidence: no quota/402/limit handling exists anywhere in
  deploy-staging/api/src today (confirmed via grep) — this is net-new.
- Keep templates plain-language; no tool names, iteration counts, or codes.

### TASK-004: Apply the catalog in the dashboard chat relay (replace raw English)
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-61-59-39-agent-voice
area: api
estimate: M
depends_on: [TASK-003]
tags: [notion, gf-59, gf-61, gf-39, chat]
acceptance:
- chat.ts:308 `run.failed` no longer emits `String(ev.error)` raw; it runs the
  error through `classify` + `message(key, clientLang)`.
- chat.ts:312 `run.cancelled`, chat.ts:298 no-final-text, and chat.ts:334
  stream-ended fallbacks are localized via the catalog.
- agentJobs.ts `fallbackFor()` takes a `lang` argument and returns localized
  copy for all four branches (completed-no-text, timed_out, run-failed, recovered).
- GF-39 leak check: the relay no longer forwards raw tool names
  (chat.ts:268) or raw `reasoning.available` text (chat.ts:290) as user-visible
  jargon — either suppress or route through a plain-language label.
- Verified in the dashboard: forcing a `run.failed` shows the Spanish friendly
  message, not raw English.
notes:
- Source: GF-59, GF-61, GF-39.
- DONE 2026-06-26 (commit 3997d20 on claude/gf-59-quota-message-catalog).
  chat.ts: run.failed classifies the raw provider error (402/daily-limit →
  Spanish quota copy) via friendlyError(); run.cancelled, the no-final-text
  path, the catch block (where a thrown 402 from the initial /v1/runs POST
  lands — the real quota entry point), and the stream-ended recovery all use the
  catalog. agentJobs.ts fallbackFor() now takes a lang and returns catalog copy
  for every branch; finalizeAgentJob resolves the client language. BONUS
  CONSISTENCY FIX: the raw failure detail is threaded into finalizeAgentJob so
  the PERSISTED bubble classifies the same as the live toast (a quota failure
  stays the clear daily-limit message on reload, not generic).
- TOOL-NAME / REASONING LEAK (acceptance bullet 4): NOT changed in the relay by
  design. The dashboard already localizes tool names client-side via the
  chat.tool.<name> i18n dict (chat-sheet.tsx:944), which is the correct layer
  (it knows the viewer's UI-language toggle; the relay only knows the fixed
  client language). reasoning.available is the MODEL's own text (already in the
  right language), not engine jargon. Left as-is intentionally; documented here
  so review doesn't flag it as a miss.
- Tests: agentJobs.test.ts (fallbackFor incl. quota classification + no-raw-leak
  guard). 16/16 pass; typecheck + build clean.
- INDEPENDENT REVIEW (Layer 5, cross-vendor GLM 5.2) 2026-07-01: round 1 =
  FINDINGS (4): (1) classify() put bare `quota` in RATE_LIMIT so "quota exceeded"
  mis-bucketed as transient — moved to QUOTA_PATTERNS; (2) added bare-quota
  tests; (3) added chat.relay.test.ts source-level wiring guard (fails if
  String(ev.error)/old English fallbacks return); (4) GF-39 dashboard tool-name
  leak — SPA chip fell back to RAW tool name for tools absent from the
  chat.tool.* i18n dict; now falls back to a generic localized label
  (Working…/Trabajando…/Arbeitet…) + added image_generate label. Round 2 = PASS
  (all findings verified fixed, all acceptance criteria met, no new issues).
  Commits: fixes 479a96b, changelog 97054cf. Verdicts in .claude/review/.
- REMAINING for full closure: live dashboard verification of a forced
  run.failed showing Spanish (TASK-006), and the CLIENT_LANGS_JSON env must be
  set on deploy (see TASK-002).
- Code evidence: deploy-staging/api/src/routes/chat.ts; agentJobs.ts fallbackFor().
- This task closes GF-59/61/39 for the DASHBOARD surface (GF-owned code).

## Hermes Config (the cheap wins — done on the box)

### TASK-001: Spike — map Hermes' built-in i18n + message sources (DONE)
status: done
owner: martin
agent: claude
reviewer: human
branch: none
area: decisions
estimate: S
depends_on: []
tags: [notion, gf-61, gf-59, gf-39, hermes, spike]
acceptance:
- Confirmed: Hermes ships `agent/i18n.py` + `locales/es.yaml` (full Spanish),
  switched via `display.language` (or `HERMES_LANGUAGE` env). Resolution order:
  explicit arg → env → `display.language` → `en`.
- Confirmed i18n scope EXCLUDES error tracebacks / tool output / agent text.
- Located: "Still working" `gateway/run.py:17089`; verifier footer
  `run_agent.py:1815` (toggle `display.file_mutation_verifier`, default true);
  cleanup knob `cleanup_progress` in `gateway/display_config.py`.
- Located quota path: `agent/error_classifier.py` (402/insufficient/quota →
  billing vs rate_limit) drives failover; final user text is raw English, NOT
  localized.
notes:
- Source: GF-39/59/61. Box 46.224.224.113, runtime at /opt/agents/_upstream,
  per-company stacks /opt/agents/<slug>/. gf-innov mounts ./config.yaml.

### TASK-007: Turn on Hermes' built-in localization + suppress jargon — STAGING FIRST
status: done
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-61-39-staging-agent-i18n
area: agent
estimate: S
depends_on: [TASK-001]
tags: [notion, gf-61, gf-39, hermes, config, staging]
acceptance:
- Worktree branch off `experimental` edits the repo staging agent config
  `deploy-staging/staging-demo-agent/config.yaml`: add `display.language: es`
  and `display.file_mutation_verifier: false` under the existing `display:` block.
- The SAME two lines are applied SURGICALLY to the live box config
  `/opt/agents/staging-demo/config.yaml` (in-place edit, NOT scp — the box is
  drifted ahead with WhatsApp/caching), then the staging-demo container is
  recreated.
- "Still working…" confirmed already suppressed (staging tool_progress is `off`
  for both platforms); add `cleanup_progress: true` only if the elapsed-time
  notifier still leaks.
- Verified on staging: a `/usage` or `/status` reply comes back in Spanish; a
  failed write turn shows no English verifier footer.
notes:
- Source: GF-61 (automatic replies in English), GF-39 (technical jargon).
- This is the STAGING leg of the GF pipeline (new-task-workflow). Prod gf-innov
  + biomas get the same change via promote-staging-to-prod (TASK-008), not here.
- Box: /opt/agents/staging-demo/config.yaml mounted into the container; surgical
  edit + `docker compose up -d --force-recreate`. Never scp over live config
  (repo-drift incident). Closes most of GF-61 and GF-39 with zero app code.
- EVIDENCE 2026-06-26: repo commit 26f73a7 on claude/gf-61-39-staging-agent-i18n
  (worktree .worktrees/gf-61-39-agent-i18n). Box config patched (backup
  config.yaml.bak.20260626-i18n), gateway restarted clean. Live check in
  hermes-marketing-staging: get_language()=es; t("approval.denied")="✗ Denegado";
  t("gateway.usage.header_session")="📊 **Uso de tokens de la sesión**". YAML
  parses; file_mutation_verifier=False confirmed in loaded config.
- DONE: independent review GLM 5.2 = PASS; changelog entry added; PR #25 merged
  to experimental (6a42e4e) 2026-06-26. REMAINING: set Notion GF-61 → Done in
  Staging (needs user OK — Notion write). The quota/"no more tokens" message is
  NOT fixed by this (out of i18n scope) — see TASK-003/004/005.

### TASK-008: Promote the i18n config to prod (gf-innov + biomas)
status: done
owner: martin
agent: claude
reviewer: human
branch: none
area: agent
estimate: S
depends_on: [TASK-007]
tags: [notion, gf-61, gf-39, hermes, prod]
acceptance:
- `display.language: es` + `display.file_mutation_verifier: false` applied to
  `/opt/agents/gf-innov/config.yaml` and the biomas stack, containers recreated.
- Verified in prod: Spanish system messages, no verifier footer.
notes:
- DONE 2026-06-26. Both boxes patched surgically (backups
  config.yaml.bak.20260626-i18n), containers viktor-v2-gf-innov + viktor-biomas
  restarted clean. Live check: cfg lang=es, get_language()=es,
  t("approval.denied")="✗ Denegado" on BOTH. Notion GF-61 → Done in Staging,
  GF-39 release note updated.
- Repo record: prod config sync (deploy-prod/gf-innov-agent/config.yaml) — see
  follow-up PR so the repo doesn't drift from the live box.

### TASK-005: Localized quota/credit message on Telegram (the one real gap)
status: in_progress
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-61-59-39-agent-voice
area: agent
estimate: M
depends_on: [TASK-001, TASK-003]
tags: [notion, gf-61, gf-59, hermes, telegram]
acceptance:
- When OpenRouter credits/quota are exhausted, the Telegram user sees a clear
  Spanish message ("Has alcanzado el límite diario…"), not raw English.
- Implemented as a gateway error hook / small plugin that catches the
  `error_classifier` billing/rate_limit classification and emits catalog copy —
  NOT an in-place edit of upstream error text (keeps upgrades safe).
notes:
- This is the only item Hermes' i18n cannot cover (errors are out of scope by
  design) and the LLM cannot cover (the model call already failed).
- SPIKE DONE 2026-07-01 (box 100.92.24.75, staging-demo). Findings:
  * The Telegram user-facing failure text is built by TWO hardcoded-English
    module-global fns in gateway/run.py: `_gateway_provider_error_reply(text)`
    (the Telegram funnel `_sanitize_gateway_final_response` routes provider
    errors through it; its rate-limit regex ALSO matches "quota", so a billing
    error currently gets the transient "wait a moment" reply — wrong + English)
    and `_normalize_empty_agent_response(agent_result, response, *, history_len)`
    ("The request failed: <raw 402>"). i18n `t()` is imported but deliberately
    NOT used for these (errors out of i18n scope, confirmed).
  * Gateway EVENT hooks (~/.hermes/hooks, gateway:startup…) are fire-and-forget
    observers — cannot rewrite outgoing text. Plugin hooks (VALID_HOOKS incl.
    transform_llm_output) don't cover gateway-generated failure text either.
  * CONFIRMED in-container: hermes_home=/opt/data; both fns exist as patchable
    module globals in /opt/hermes/gateway/run.py; agent.i18n.get_language()='es';
    app venv = /opt/hermes/.venv/bin/python.
- APPROACH (chosen — mirrors GF's existing pattern): a BUILD-TIME patch script
  `patches/patch_localized_errors.py` (exactly like the existing
  `patch_api_server.py`, wired in the agent Dockerfile: COPY + RUN venv python +
  py_compile). It appends an idempotent, marker-guarded block to the END of
  gateway/run.py that rebinds the two fns to localized wrappers (classify →
  quota/rate/context/no_text/failed → ES/DE/EN copy via get_language()). Append-
  at-end wins over the originals (module-global lookup at call time) and avoids
  fragile function-body matching. NOT a live in-place edit (survives rebuilds;
  no _upstream fork). Copy adapted for Telegram (mentions /compact,/reset — no
  "el panel"); mirrors the dashboard TASK-003 catalog tone.
- DEPLOY: add to repo canonical template deploy-prod/gf-innov-agent/patches/ +
  Dockerfile; STAGING FIRST — apply to staging-demo box (its own patches/ +
  Dockerfile RUN line) then `docker compose build && up -d`. Verify by evaluating
  the patched fns in-container (force a real 402 is impractical; same proof style
  as the dashboard). Prod gf-innov + biomas via promotion afterwards.
- Investigate the cleanest hook point in `gateway/run.py` error handling vs a
  builtin_hook before implementing. Reuses TASK-003 catalog copy.

## Verification

### TASK-006: Verify both surfaces, review, and ship to staging
status: todo
owner: martin
agent: claude
reviewer: codex
branch: claude/gf-61-59-39-agent-voice
area: verification
estimate: S
depends_on: [TASK-004, TASK-005]
tags: [notion, gf-61, gf-59, gf-39, verification]
acceptance:
- API typecheck passes: `cd deploy-staging/api && npx tsc --noEmit`.
- Catalog unit tests pass.
- Dashboard chat: simulated quota error renders the Spanish friendly message;
  no raw tool names / jargon leak.
- Telegram: quota + progress strings confirmed localized/plain (per TASK-005).
- independent-review (Codex) PASS before merge.
- changelog.ts gets a dated user-facing entry; Notion updated (GF-61 → Approved
  then Done in Staging; GF-59 → Done in Staging; GF-39 reopened/closed for the
  Telegram gap).
notes:
- Source: GF-61, GF-59, GF-39. Follows new-task-workflow steps 5-7.
- GF-39 is currently "Done in Staging" but only the LLM-echo path was fixed; the
  engine-emitted strings on Telegram are the remaining gap this plan closes.
- PROGRESS 2026-07-01: DONE = API typecheck + 19 unit tests + build clean (dist
  excludes *.test.ts); SPA tsc -b clean; independent-review GLM 5.2 = PASS
  (round 2); changelog entry added.
- SHIPPED TO STAGING 2026-07-01: PR #28 (catalog+relay+SPA) squash-merged to
  experimental (9c3d25b), CI deploy green. PR #29 (activate CLIENT_LANGS_JSON in
  staging+prod compose env — non-secret, set directly since compose ${:-} can't
  carry JSON braces) squash-merged (c177e27), CI deploy green.
- STAGING VERIFICATION 2026-07-01 (in the live mp-staging-api container, on the
  deployed dist + deployed env): resolveClientLang('gf-internal')='es',
  'fitvibe-demo'='en' (fallback), 'biomas'='es'; classify('402 daily limit')=
  'quota_exhausted'; friendlyError(402,'es')= "Has alcanzado el límite de uso de
  hoy. Los créditos se renuevan a medianoche — ¡hablamos mañana!" (differs from
  en). chat.ts wiring proven by chat.relay.test.ts source guard. DASHBOARD
  surface = DONE + verified on staging.
- REMAINING: (a) Notion (needs Martin's OK — outward-facing): GF-59 → Done in
  Staging, GF-61 confirm, GF-39 note the Telegram gap; (b) prod: the compose
  CLIENT_LANGS_JSON is already in deploy-prod, activates at next
  promote-staging-to-prod; (c) TASK-005 (Telegram quota hook) still open/blocked
  — the DASHBOARD surface is fully done, Telegram is not.

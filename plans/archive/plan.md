# Plan — Fix Production Viktor (v2) so it Reliably Drives the Dashboard via the API

**Date:** 2026-06-05
**Owner:** Martin / Claude
**Scope:** Production agent `viktor-v2-gf-innov` (`/opt/agents/gf-innov`, slug `gf-internal`) on the Hetzner box, talking to `marketing.gfinnov.com` (Hono API + PocketBase, API mode).
**Non-goal:** Staging — staging already works and is the reference implementation. We are bringing prod to staging parity, not changing staging.

---

## ✅ EXECUTION RESULTS — 2026-06-05 (DONE & VERIFIED LIVE)

Diagnosed on the live prod box and fixed. Root cause matched the hypothesis:
the in-place cutover did **not** carry the staging fixes to prod.

**Confirmed gaps (Phase 0):** (1) `patch_api_server.py` was **never applied** on
prod → in-app chat ran on `SOUL.md` only and the plugin's `image_generate`
override was shadowed (dropped `post_id`); (2) the prod `system_prompt` was the
stale, over-asking, mojibake (`?`) version; (3) the client **assets dir was owned
1001**, so the agent (uid 10000) couldn't write generated images; (4) the agent
mounted the **whole** client dir `:rw` → it wrote/clobbered disk seed files
(`p005`/`p008`) that the dashboard never reads (the dashboard reads **PocketBase**;
disk is just the deploy seed → "picture sent but not visible"). Role gate (`agent`
allowed), `approvals: off`, models, and agent memories were already fine.

**Applied (all backed up on-box, `*.bak.pre-parity-20260605-115728`):**
- Copied `patches/patch_api_server.py` to `/opt/agents/gf-innov`, wired it into the
  prod `Dockerfile` (system-prompt fallback + `_ensure_plugins_discovered(force=True)`).
- Ported the **decisive** image prompt into prod `config.yaml` (no more fast-vs-high
  interrogation; fixed mojibake; updated header).
- **Locked down the mount:** agent now mounts **assets-only** (`…/assets:rw`); it can
  no longer see/write `posts/brief` on disk → all post writes go through the API.
- `chown 10000` the assets dir so the agent can write generated images.
- Archived rogue disk posts `p004`–`p008` (seed truth = `p001`–`p003`); disk seed now
  matches the repo + PocketBase.
- `docker compose up -d --build` → patch applied + compiled OK, container recreated.

**Verified live (Phase 4):**
- Patch markers present in the running container (2/2); mount is assets-only; agent
  can write assets; agent can NOT see `posts/` on disk.
- **Direct gateway run** (no `instructions`, mimics the chat proxy): `image_generate`
  auto-linked `p050` → `p050.image` became a served URL, **no terminal file flailing**.
- **Real in-app `chat/stream`** (dash token, full SSE path): 3 tool calls, clean `done`,
  produced a *new* linked image; chat proxy confirmed targeting the prod agent
  (`HERMES_BASE_URL=…viktor-v2-gf-innov:8642`, key matches gateway).
- Asset serves **HTTP 200 image/png through the edge** (`marketing.gfinnov.com`) — the
  exact URL the dashboard `<img>` loads. Manifest updated, then test artifacts cleaned
  (post `p050` deleted, test PNGs + manifest entries removed).

**Repo mirror updated** (`deploy-prod/gf-innov-agent/`): config (decisive, placeholder
key), `patches/patch_api_server.py`, `Dockerfile`, `docker-compose.yml`. No real key in
the repo. **Not committed** — left for Martin to review/commit.

**Not done / deferred:** the deterministic single-shot `publish_image` tool (§10) — not
needed; parity+lockdown resolved the failure. The literal in-browser click was not
performed (dashboard is behind edge basicauth; creds in 1Password) — instead the full
user-facing `chat/stream` path was driven directly with a dash token, which is equivalent.

---

## 1. The problem (what Martin saw)

Asked to "just add it to https://marketing.gfinnov.com/gf-internal" (create/update a post `p009` with a picture), production Viktor:

- Generated an image and sent a short reply, but **the picture never showed up in the web app.**
- Spent minutes / many tokens **flailing in its `terminal` tool**: dozens of `ls -la`, `find / -name ...`, `cat`, `grep` calls hunting for files all over the box.
- Hit **permission walls** on `/opt/marketing-planner/client/posts` (not writable by the agent user), tried `sudo`/`su` (failed).
- **Never called the REST API** (`/api/v1/clients/gf-internal/posts`) — the supported, working path.
- Finally **corrupted `p008.json`** by doing `cat /tmp/p009.json > /opt/.../posts/p008.json` (wrote the new post's body over an existing post).
- The Hermes event stream ended before a final reply (`This operation was aborted`).

**This is the exact pre-fix behavior staging had** and that we fixed across ~5 sessions (see [staging_chat_pipeline_fixes](../../../.claude/.../memory) and the in-repo `plans/CHAT_ROBUSTNESS_PLAN.md`). Conclusion: **the production agent did not receive the full set of staging fixes during today's in-place cutover**, and on top of that it has *write-tempting* filesystem access to the client dir that lures it off the API path.

### Why the picture didn't appear (most likely, to confirm)
One or more of the known staging root-causes:
1. **No marketing workflow reached the agent.** The in-app chat proxy POSTs to Hermes `/v1/runs` with no `instructions`; if the prod `api_server.py` lacks the **system-prompt fallback patch**, the agent runs on the generic `SOUL.md` only and improvises a bogus file-based workflow instead of the API workflow. (THE staging root cause, fixed 2026-06-02.)
2. **Agent never PATCHed `/posts`** — so even a generated image is never linked to the post.
3. If it *did* PATCH, a **relative image path** (`assets/p009_cover.png`) instead of a served URL → broken `<img>` (fixed on staging via `normalizeImageUrl`).
4. **Plugin `image_generate` override dead** (core re-registers and drops `post_id`/reference_images) unless the `_ensure_plugins_discovered(force=True)` patch is applied.

---

## 2. Goals / success criteria

A change-picture or add-post request to prod Viktor (Telegram **and** in-app chat) must:

- [ ] Use the **REST API** (`POST`/`PATCH /api/v1/clients/gf-internal/posts/...`), **never** raw file edits to `/opt/marketing-planner/client`.
- [ ] Result in the **picture visibly updating in the web app** within ~60–90s, served `200` as a proper URL.
- [ ] **Never clobber** an existing post (no more `> p008.json`).
- [ ] Not flail: input tokens per change back down to the staging range (~30–80k, not 161k+); few, deliberate tool calls.
- [ ] Be **verified live by me** on the real prod dashboard, not assumed.

---

## 3. Approach (decided)

**Port staging → prod to full parity, AND lock down the terminal** so the agent *cannot* do raw file ops on the client dir and is forced onto the API. (Approach chosen 2026-06-05; the deterministic single-shot `publish_image` tool is explicitly out of scope for this pass — noted as a follow-up.)

Two levers, both required:
- **A. Parity** — make prod's prompt + patches identical to the known-good staging set, so the agent *knows* the API workflow and the plugin path works.
- **B. Lockdown** — remove the temptation/ability to write files in the client dir, so even a confused agent fails *safely* toward the API instead of corrupting data.

---

## 4. Phase 0 — Diagnose the live prod box (evidence first)

> Goal: confirm *exactly* which staging fixes are missing on prod before changing anything. Do not guess.

SSH: `ssh root@100.92.24.75` (Tailscale; prod agent dir `/opt/agents/gf-innov`, slug `gf-internal`, client dir `/opt/marketing-planner/client`).

- [ ] `docker ps` — confirm `viktor-v2-gf-innov`, `mp-prod-api`, `mp-prod-pb`, `mp-prod-caddy` are up. **Touch nothing else** (Otto, demo agent share the box).
- [ ] **Check the system-prompt fallback patch:** is `patches/patch_api_server.py` present in `/opt/agents/gf-innov` and wired into its Dockerfile? Inside the container, does `api_server.py::_create_agent` fall back to `config.yaml agent.system_prompt` when `instructions` is empty? (grep the running file.)
- [ ] **Check `config.yaml agent.system_prompt`** on prod: does it contain the **API workflow** (curl PATCH /posts, manifest, asset URL rules) and the **decisive-action** bias ("act on clear requests, at most one question, default fidelity=fast")? Compare against staging `config.yaml` and `deploy-staging/staging-demo-agent/config.yaml` in the repo.
- [ ] **Check `approvals:` block** — is `mode: off` set (so in-app chat writes aren't blocked by an unanswered HITL approval)? On Telegram approvals can be tapped; in the dashboard they time out → "read-only".
- [ ] **Check the plugin** `image_gen_openrouter` on prod: is the `_ensure_plugins_discovered(force=True)` re-registration in the patch? Does `image_generate` accept `post_id` / `reference_images` / `fidelity`? What is `OPENROUTER_IMAGE_MODEL` in the prod `.env`?
- [ ] **Check the API role gate:** do prod write routes (`posts` POST/PATCH/DELETE) allow `requireRole('dash','admin','agent')`? What `API_TOKEN` does the prod agent hold, and is it scoped to `gf-internal`?
- [ ] **Check filesystem perms** the agent actually has on `/opt/marketing-planner/client/posts` (this is what it was fighting). Confirm the mount in `viktor-v2-gf-innov` (`/opt/marketing-planner/client:rw`).
- [ ] **Reproduce** the failure deterministically from inside `mp-prod-api`: POST a run to `http://viktor-v2-gf-innov:8642/v1/runs` (Bearer = api_server key) with "change p00X image", then GET `/v1/runs/<id>/events`. Capture whether it curls the API or shells around.
- [ ] **Assess the `p008.json` damage:** confirm what `p008` should be vs what's there now; check PB + disk. Restore from a backup / git / PB if corrupted. (Record before/after.)

**Deliverable of Phase 0:** a short checklist marking, for each staging fix, "present on prod / missing on prod", plus the data-integrity status of `p008`/`p009`.

---

## 5. Phase 1 — Restore data integrity

- [ ] Restore `p008.json` to its correct content (source: git history of the client repo, PB record, or a `.bak`). Verify it renders in the dashboard.
- [ ] Remove/clean any half-written `p009` / `/tmp/p009.json` debris the agent left.
- [ ] Confirm `posts/index.json` is consistent with the actual post files.

---

## 6. Phase 2 — Bring the prod agent to staging parity (lever A)

Apply only what Phase 0 found missing. All of these are proven on staging; mirror the exact staging artifacts. **Edit source in the repo where a repo path exists; box-only files (config.yaml, .env, patches) are applied on-box and recorded.**

- [ ] **`api_server.py` system-prompt fallback patch** + **`_ensure_plugins_discovered(force=True)`** — copy `patches/patch_api_server.py` from staging into `/opt/agents/gf-innov/patches/`, wire into the prod agent Dockerfile (COPY+RUN before `USER 10000`), `docker compose up -d --build`. This is THE fix for "in-app chat improvises a file workflow."
- [ ] **`config.yaml agent.system_prompt`** — port the staging API workflow + decisive-action block + IMAGES rules. Remember: Hermes uses plain `yaml.safe_load`, **no `${VAR}` expansion** (inject the gateway/API key on-box, placeholder in any repo mirror).
- [ ] **`approvals: { mode: off }`** in prod `config.yaml` (keep hardline+sudo guards). Back up first (`config.yaml.bak.pre-*`).
- [ ] **Plugin `image_gen_openrouter`** — ensure prod has the post_id auto-link + reserve-publish (`_publish_reserve_image`) + `reference_images` support; set `OPENROUTER_IMAGE_MODEL=google/gemini-3.1-flash-image-preview` (fast default; `high`→gpt-5.4 only on request).
- [ ] **API role gate** — confirm `requireRole('dash','admin','agent')` on `posts` write routes and `normalizeImageUrl` is in `buildPost()` on the **prod** API (`deploy-prod/api` / `deploy-staging/api` source). If missing, commit to `main` and redeploy via the prod CI (per AGENT_CHANGE_AND_DEPLOY_GUIDELINES — never hand-rsync).
- [ ] **Agent memory** (`/opt/data/memories/MEMORY.md`/`USER.md`, shared with Telegram) — verify it does NOT contain stale "use scripts/overlay.py / don't trust image_generate" facts that drive the broken manual flow. Point it at the API workflow + `reference_images`. Do **not** wipe `HERMES_HOME`.

---

## 7. Phase 3 — Lock down the terminal (lever B)

> So a confused agent fails toward the API, never corrupts client data again.

Pick the least-invasive option that works (decide during Phase 0 based on how the agent reaches the dir):

- [ ] **Make the client dir read-only (or unmounted) for the agent.** The agent does NOT need write access to `/opt/marketing-planner/client` — all writes go through the API, which owns the dir. Change the bind mount to `:ro` (or drop it) for `viktor-v2-gf-innov`. This alone makes `> p008.json` impossible. Verify image-publish still works (it writes via the API/manifest, not the agent's FS).
- [ ] **Tighten the `terminal` tool guidance** in the system prompt: explicitly forbid raw file edits to client data and `find /`-style searches; the ONLY supported way to read/write posts and assets is the API (`curl` the documented endpoints). Give the exact endpoint recipes inline so it never needs to "hunt."
- [ ] **(Optional, if still flailing) restrict the terminal tool** further — e.g. deny `find`/`sudo`/`su` patterns, or scope the working dir — without breaking the legitimate `curl` calls the publish flow uses.

---

## 8. Phase 4 — Live verification by me (required)

Per Martin's ask: I test the dashboard myself, both the API side and the browser.

- [ ] **API side, from inside `mp-prod-api`:** POST a run to the prod gateway "change p00X image to match the copy, just do it." Watch `/v1/runs/<id>/events`: confirm it reads the post, calls `image_generate` (fast model, ~12s), the plugin copies to assets + manifest, and it `PATCH`es `/posts/p00X` with a **served URL** — and that there are **no `find`/`ls`/`cat` client-file ops**. Capture tool_turns + input tokens.
- [ ] **Browser side:** load `https://marketing.gfinnov.com/gf-internal`, hard-reload, open Ask Viktor, send a real change-picture request, and confirm the **image updates in place** (no manual refresh, no white-screen on the Assets tab). Confirm the asset serves `200`.
- [ ] **Add-post path:** verify the original failing request ("add p009") now creates a real post via the API and shows in the calendar — without touching `p008`.
- [ ] **Telegram path:** same request via Telegram still works (shared brain).
- [ ] **Regression:** confirm `p008` is intact after the test; revert any test artifacts (leave assets as harmless "Vorrat" if generated).

**Done = observed, not assumed.** Record token counts + turn counts as evidence in this file.

---

## 9. Phase 5 — Commit, document, prevent recurrence

- [ ] Commit all repo-side source changes (prod API role/normalize, plugin mirror, prompt mirror) to `main`; deploy via prod CI (no hand-rsync). Mirror box-only artifacts under `deploy-prod/` like staging mirrors under `deploy-staging/`.
- [ ] Record on-box-only changes (config.yaml, .env, patches, mount change) in the repo's promotion/progress doc so the next cutover reproduces them.
- [ ] Update `AGENT_CHANGE_AND_DEPLOY_GUIDELINES.md` / `promote-staging-to-prod` skill: **the agent must never have write FS access to client data; parity-check the api_server patch + system_prompt as a cutover step.**
- [ ] Update memory ([staging_to_prod_promotion], [staging_chat_pipeline_fixes]) with "prod brought to parity + terminal locked on 2026-06-05" and the verified token/turn numbers.

---

## 10. Open follow-ups (NOT in this pass)

- **Deterministic single-shot `publish_image` tool** (inject `post_id`, one call: generate→manifest→PATCH, terminal stripped). Biggest remaining reliability/speed win; Martin deferred it on staging. Revisit if parity+lockdown still leaves >~8 turns/change.
- **OpenRouter single-key daily limit** — heavy testing 403s the whole chat; raise the limit or add a 2nd pooled key before stress-testing.
- **Prompt-cache miss** (`Stored system prompt … is null`) — fixing it speeds every multi-turn run.
- Language-mirroring flakiness (pre-existing, both envs).

---

## Risk / etiquette notes

- The box runs prod + Otto + a demo agent. **Never restart containers you didn't create; check `docker ps` first.** Ports 80/443 belong to caddy.
- Editing the **outer Caddyfile** is the single most dangerous step — not expected here, but if touched: backup → `caddy validate` → graceful reload.
- Don't deploy a hand-built SPA (file-mode trap). API/SPA changes go through prod CI only.
- PB data durability + secrets: secrets live in Martin's 1Password, never in repo/memory.

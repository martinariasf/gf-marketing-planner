# Staging → Production Promotion — Progress Log

> Tracks the first **full-parity cutover** of the GF marketing-planner from
> `experimental` / staging → `main` / production, plus the agent promotion.
> Driven by the `promote-staging-to-prod` skill (`~/.claude/skills/`).
>
> Status legend: ✅ done · 🟡 in progress · ⛔ blocked (needs human/secret) · ⬜ not started

Last updated: 2026-06-05

## Locked decisions
- **Website target:** full parity — prod gains Hono API + PocketBase, SPA in API mode.
- **Agent target:** new prod agent at `/opt/agents/<slug>/` (deploy-hermes pattern); leave `hermes-marketing-demo` untouched until validated.

---

## Phase 0 — Skill + pre-flight (this session)

| # | Step | Status | Notes |
|---|------|--------|-------|
| 0.1 | Read ARCHITECTURE.md + AGENTS.md | ✅ | |
| 0.2 | Design + write `promote-staging-to-prod` skill (SKILL.md + 2 refs) | ✅ | `~/.claude/skills/promote-staging-to-prod/` |
| 0.3 | Verify access: GitHub (gh), SSH to box | ✅ | gh as `martinariasf` (repo+workflow); SSH OK `root@100.92.24.75` |
| 0.4 | Confirm divergence | ✅ | `experimental` is **74 ahead / 0 behind** `main` |
| 0.5 | Confirm staging healthy | ✅ | `/api/v1/health` → `{ok:true, release:phase6, pb:up}`; prod 200 |
| 0.6 | Inventory box (prod/staging/agents) | ✅ | see "Box reality" below |

### Box reality (verified 2026-06-05)
- **Prod** `/opt/marketing-planner/`: file-mode SPA (`app-dist`), `clients/` (`fitvibe-demo`, `gf-internal`, `index.json`), `Caddyfile`, `docker-compose.yml` (just the outer caddy). **No API, no PocketBase.**
- **One shared OUTER caddy** `marketing-planner-caddy` serves BOTH hosts from `/opt/marketing-planner/Caddyfile`. Prod uses **per-client basicauth** on `/data/<slug>/*`; staging block proxies `/api/v1`, `/chat`, `/api/v1/auth/exchange` (single `staging` user) → `mp-staging-caddy`.
- **Staging** `/opt/marketing-planner-staging/`: `mp-staging-api` + `mp-staging-caddy` (compose, external net `marketing-planner_default`) + `mp-staging-pb` (bare `docker run`, see `pb-run.sh`) + `hermes-marketing-staging` (agent, api_server gateway :8642).
- **Agents** `/opt/agents/`: `marketing-demo`, `gf-innov`, `staging-demo`, `_upstream`. Containers also include `hermes-marketing-demo` (legacy prod — never touch) and `viktor-v2-gf-innov`.

---

## Phase 1 — Website cutover

| # | Step | Status | Notes |
|---|------|--------|-------|
| 1.1 | Pre-flight (experimental pushed+green, main 0-ahead, secrets gathered) | 🟡 | main 0-ahead ✅; experimental has **uncommitted** files (see blockers) |
| 1.2 | Add prod deploy assets to repo (`deploy/api`, compose.prod, Caddyfile.prod.inner, pb-run.prod) | ⬜ | |
| 1.3 | Edit shared outer Caddyfile prod block (⚠️ highest risk) | ⛔ | **confirmation gate** + auth decision |
| 1.4 | Stand up `mp-prod-pb` + `mp-prod-api` + `mp-prod-caddy` | ⬜ | |
| 1.5 | Data migration: seed prod PB from prod JSON | ⛔ | **confirmation gate** + needs prod PB admin creds |
| 1.6 | Flip SPA to API mode in `deploy.yml` (`VITE_API_BASE`) | ⬜ | |
| 1.7 | Merge `experimental` → `main` (PR) | ⛔ | **confirmation gate** — triggers prod deploy |
| 1.8 | Verify live (API mode grep, health, clients render) | ⬜ | |

## Phase 2 — Agent promotion

| # | Step | Status | Notes |
|---|------|--------|-------|
| 2.0 | **Scrub secret in `config.yaml`** + commit agent source | ⛔ | secret found (see blockers); needs scrub-approach decision |
| 2.1 | Pick prod slug | ⛔ | decision needed |
| 2.2 | Clone template → `/opt/agents/<slug>/` | ⬜ | |
| 2.3 | Wire prod env (.env) | ⛔ | needs Telegram token, OpenRouter key, Postiz creds, prod bearer |
| 2.4 | Point prod chat at new agent | ⬜ | confirmation gate |
| 2.5 | Smoke test (hi/suggest/draft/approve) | ⬜ | |
| 2.6 | Retire `hermes-marketing-demo` (deliberate, last) | ⬜ | |

---

## 🚧 Blockers / open decisions (need Martin)

1. **Secret in agent source.** `deploy-staging/staging-demo-agent/config.yaml`
   line 326 hardcodes the Hermes gateway `key:` (64-hex). Committing it leaks a
   credential. **VERIFIED: env interpolation does NOT work** — Hermes loads config
   via plain `yaml.safe_load` with no `${VAR}` expansion, so a `${...}` value would
   be used literally and break chat auth. Fallback options: (a) committed
   `config.yaml.template` + git-ignored real config, or (b) commit config with only
   the `extra.key` line scrubbed to a placeholder + inject the real key on the box
   at (manual) deploy. **Awaiting decision.** Until then the untracked source
   (`staging-demo-agent/`, `pb-run.sh`, `CHAT_ROBUSTNESS_PLAN.md`) is **not committed**.
2. **Prod dashboard auth model.** Prod gates data per-client; staging's
   `/auth/exchange` uses one `staging` user. Need the prod token-exchange auth
   design before wiring `/api/v1/auth/exchange` in the prod Caddyfile.
3. **Prod agent slug** (Phase 2.1).
4. **Secrets to provide** (not in repo): prod PB admin email+password,
   prod `BOOTSTRAP_TOKENS`, prod Hermes gateway key, prod Telegram bot token,
   prod OpenRouter key, Postiz creds.
5. **Confirmation gates** (will STOP for explicit OK): edit prod Caddyfile (1.3),
   run prod seed (1.5), merge to main (1.7), point/retire agent (2.4/2.6).

## Skill updates made while executing
- Added a **secret-scrub step** (Phase 0 of agent ref) after finding the live key in `config.yaml`.
- Encoded the **single shared outer Caddyfile** reality (both hosts, one file) + the per-client-vs-single-user auth wrinkle.
- Encoded **PocketBase as bare `docker run`** (not compose) and the `mp-prod-*` naming convention.

# GF Marketing Planner

Per-client AI marketing platform for GF Innovative Solutions: a React SPA talking
to a REST API backed by PocketBase, plus **Viktor**, a per-client Hermes agent on
Telegram/WhatsApp.

| | Production | Staging |
|---|---|---|
| URL | `marketing.gfinnov.com` | `staging.marketing.gfinnov.com` |
| Branch | `main` | `experimental` |

## Read this first

| Doc | What it covers |
|---|---|
| [AGENTS.md](./AGENTS.md) | **Mandatory.** Change & deploy rules for anyone (human or agent) touching this repo. Source-only edits, commit everything, CI-only deploys. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | How the system is put together: SPA, `/api/v1` REST API, PocketBase, hosting. |
| [docs/viktor-agent.md](./docs/viktor-agent.md) | What Viktor is and the recipe to stand up a new instance for a client. |
| [docs/agent-file-contract.md](./docs/agent-file-contract.md) | The per-client file contract Viktor writes against (`clients/<slug>/*.json`). |

## Layout

```
app-v2/          The dashboard (Vite + React). This is what CI builds and deploys.
agent-skills/    Viktor's skills — core/ (shared) and clients/<slug>/ (per-client overrides).
clients/         Per-client data files, rsynced to the box by CI.
deploy/          Dashboard Caddy config + onboarding notes.
deploy-staging/  Staging stack (API + PocketBase + staging agent).
deploy-prod/     Production stack (API + PocketBase + gf-innov agent).
docs/            Reference docs; docs/archive/ holds superseded/historical ones.
plans/           Active technical plans; plans/archive/ holds shipped ones.
.github/         CI: deploy.yml (prod, from main), deploy-staging.yml (staging, from experimental).
```

## Working on a task

Branch off `experimental`, one branch per task (`claude/gf-<N>-<slug>`), work in a
git worktree, then merge to `experimental` — never commit directly to it.
Production ships by promoting `experimental` → `main`.

The v1 HTML/JS framework that preceded `app-v2` was removed on 2026-08-20; it is
recoverable from git history at the `chore: archive v1 framework into app/` commit.

# Onboarding a new client

End-to-end playbook for adding a new client to the Viktor Marketing Operating Dashboard. Doable in ~30 minutes once the answers from the 11-question intake exist.

> **Two separate deployables.** (1) The **dashboard data** — the per-client JSON
> under `clients/<slug>/` that this `deploy/` folder's Caddy container serves
> (Steps 1–5, 7 below). (2) The **Viktor agent** — a Dockerised Hermes stack under
> `/opt/agents/<slug>/`, whose template is [`deploy-prod/gf-innov-agent/`](../../deploy-prod/gf-innov-agent/),
> deployed via the `deploy-hermes-company-agent` skill (Step 6). This folder does
> **not** contain the agent; the retired `viktor-skills/` specs here were never
> loaded by any agent — see [viktor-skills/README.md](viktor-skills/README.md).

## Prerequisites

- The 11 intake answers (see [SKILL.md](../SKILL.md) "Required intake for a new client") collected from the client.
- A short slug (kebab-case, no spaces). Example: `acme-fitness`.

## Step 1 — Create the file tree

Local (in this repo):

```bash
cd marketing-planner
SLUG=acme-fitness

mkdir -p clients/$SLUG/posts clients/$SLUG/assets
touch clients/$SLUG/approvals.log
```

## Step 2 — Write the seed files

Drop these files in `clients/$SLUG/`:

| File | Schema source | Filled from |
|---|---|---|
| `brief.json` | `app-v2/src/types/brief.ts` | intake §1-§8 |
| `plan.json` | `app-v2/src/types/plan.ts` | intake §9-§10 |
| `goals.json` | `app-v2/src/types/goals.ts` | intake §11 |
| `posts/index.json` | `{ "posts": [] }` | empty to start |
| `assets/manifest.json` | `{ "items": [] }` | empty to start |
| `approvals.log` | (plain text) | empty to start |

**Use FitVibe as the template** — copy `clients/fitvibe-demo/*` into `clients/$SLUG/`, then replace every field. Faster than typing from scratch and you won't miss a required key.

## Step 3 — Register the client in the index

Append an entry to `clients/index.json`:

```jsonc
{
  "clients": [
    { "slug": "fitvibe-demo", ... },
    {
      "slug": "acme-fitness",
      "name": "Acme Fitness",
      "industry": "Functional training",
      "logoInitials": "AF",
      "quarter": "Q3 2026",
      "headline": "<one-line elevator pitch for the quarter>",
      "status": "onboarding"
    }
  ]
}
```

`status` values:
- `onboarding` — file tree exists but content isn't reviewed yet.
- `active` — live client, Viktor is operating.
- `demo` — internal example (FitVibe only).
- `paused` — not currently in flight.
- `archived` — historical reference.

## Step 4 — Verify locally

```bash
cd app-v2
pnpm dev
# Open http://localhost:5173 → the new client card should appear.
# Click into it → /:slug/context should render the brief.
```

If a view crashes, the most common cause is a missing required field. Check the TS types in `src/types/` for the file that's loading.

## Step 5 — Commit + push

```bash
cd marketing-planner
git add clients/$SLUG clients/index.json
git commit -m "feat(clients): onboard $SLUG"
git push
```

The CI workflow rebuilds + redeploys the dashboard automatically (touches `app-v2/**`? actually, the workflow only fires on `app-v2/**` changes — adding a client folder under `clients/**` does NOT trigger a redeploy. The dashboard reads `clients/**` live from Caddy. If the production server doesn't see the new files yet, scp them:

```bash
scp -r clients/$SLUG \
  root@100.92.24.75:/opt/marketing-planner/clients/

scp clients/index.json \
  root@100.92.24.75:/opt/marketing-planner/clients/index.json
```

## Step 6 — Spin up the per-client Viktor agent

Follow the **`deploy-hermes-company-agent` skill** — it is the authoritative
playbook. Do NOT `docker cp` markdown "skills" into a container: a running
Hermes agent loads only its `config.yaml` `agent.system_prompt`, never `.md`
skill files. The old recipe here (a `hermes-marketing-demo` image + a
`reload-skills` step) never reflected reality and has been removed.

The real shape of a standard Viktor:

- Each company = one isolated stack under `/opt/agents/<slug>/` on the Hetzner box.
- Copy [`deploy-prod/gf-innov-agent/`](../../deploy-prod/gf-innov-agent/) as the
  template: `config.yaml` (the agent's whole brain), `Dockerfile` (layers the
  `image_gen_openrouter` + `postiz` plugins onto `hermes-agent:base` and patches
  `api_server.py`), and `plugins/`.
- The agent's behaviour is edited by editing `config.yaml` `agent.system_prompt`
  (in the repo AND on the box — the live copy often drifts, so patch surgically),
  then `docker compose up -d --build` and restart.
- Per-client secrets live in `/opt/agents/<slug>/.env` (chmod 600, not committed):
  Telegram token, `API_BASE` / `API_TOKEN` / `CLIENT_SLUG`, OpenRouter + Postiz
  keys, `PUBLIC_ASSETS_BASE`. See the gf-innov-agent
  [`README.md`](../../deploy-prod/gf-innov-agent/README.md) for the exact list.

Smoke test (Telegram AND in-app dashboard chat):

```
hi viktor            → greeting in the brand voice, in the user's language
draft 1 post about … → a post via the REST API + a preview
approve p001         → POST /approvals {decision:"approved"}, visible on the kanban
```

## Step 7 — Hand off

- Share the dashboard URL with the client contact: `https://marketing.gfinnov.com/<slug>/context` (prod, live) — or the Tailnet address `http://100.92.24.75/<slug>/context` for internal smoke tests.
- If using public hostname: generate the basic-auth credential for them, share via Signal / 1Password / similar — never email.
- Walk them through the workflow strip (Plan → Draft → Refine → Prepare → Learn) and the literal-approval pattern.
- Set status from `onboarding` to `active` in `clients/index.json`. Commit + push.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| 404 on `/:slug/context` | Caddy can't find `/data/<slug>/brief.json`. Check it exists on the box. |
| Goals view shows zeros | `performance.json` not synced yet — Viktor's first sync runs daily 06:00 UTC. Run `sync metrics` on Telegram to force it. |
| All metrics 0 even after sync | `publishing.postizJobId` is null on every post (nothing was actually scheduled to Postiz). |
| Calendar empty | `posts/index.json` doesn't reference the post files, OR the dates fall outside `plan.quarter`. |
| Pipeline column empty | All posts have `status: "published"` and the column is "Scheduled" — that's expected, not a bug. |
| New client doesn't appear in picker | `clients/index.json` not pushed to the server. The file lives in `/opt/marketing-planner/clients/index.json`. |

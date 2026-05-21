# Onboarding a new client

End-to-end playbook for adding a new client to the Viktor Marketing Operating Dashboard. Doable in ~30 minutes once the answers from the 11-question intake exist.

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

(Not yet automated — manual until we templatize.)

On the Hetzner box:

```bash
# 1. Copy the Hermes container for the demo and rename for this client
docker run -d \
  --name viktor-$SLUG \
  -v /opt/marketing-planner/clients/$SLUG:/data \
  -e TELEGRAM_BOT_TOKEN=<per-client-token> \
  -e POSTIZ_BASE=<postiz-url> \
  -e POSTIZ_TOKEN=<postiz-token> \
  hermes-marketing-demo:latest

# 2. Install Viktor's skills into the new container
docker cp deploy/viktor-skills/approvals.md             viktor-$SLUG:/opt/skills/
docker cp deploy/viktor-skills/sync-postiz-analytics.md viktor-$SLUG:/opt/skills/
docker cp deploy/viktor-skills/weekly-summary.md        viktor-$SLUG:/opt/skills/
docker exec viktor-$SLUG reload-skills

# 3. Smoke test on Telegram
# Send: "hi viktor"   - expect a greeting using the brand voice.
# Send: "draft 1 post about <topic>" - expect a post file + Telegram preview.
# Send: "approve p001" - expect status flip + commit + (optional) Postiz queue.
```

## Step 7 — Hand off

- Share the dashboard URL with the client contact: `http://100.92.24.75/<slug>/context` (Tailnet) or `https://YOUR_HOSTNAME/<slug>/context` once public.
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

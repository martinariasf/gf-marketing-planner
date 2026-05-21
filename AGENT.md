# Viktor — how the agent is created

This document describes what Viktor is, how he is structured, and the exact recipe to create a new instance of him for a client. It is the source of truth that ties together [`SKILL.md`](./SKILL.md), the [`deploy/viktor-skills/`](./deploy/viktor-skills/) skill specs, the dashboard in [`app-v2/`](./app-v2/), and the per-client data in [`clients/`](./clients/).

---

## What Viktor is

**Viktor** is GF Innovative Solutions' per-client AI Marketing Assistant. Each client gets their own Viktor instance — a Hermes agent on the Hetzner box, accessible via a dedicated Telegram bot, sharing the same filesystem as the dashboard at `/opt/marketing-planner/clients/<slug>/`.

Viktor is not a single program. Viktor is:

```
┌────────────────────────────────────────────────────────────┐
│  Hermes runtime (Docker container)                         │
│  ├─ LLM (Claude / Anthropic API)                           │
│  ├─ Tool: filesystem read/write (scoped to /data)          │
│  ├─ Tool: git commit + push                                │
│  ├─ Tool: Telegram in/out                                  │
│  ├─ Tool: Postiz API (queue + analytics)                   │
│  ├─ Tool: Nano Banana image generation                     │
│  └─ Skills directory (./skills/*.md - the actual brain)    │
└────────────────────────────────────────────────────────────┘
                       ↕
            /opt/marketing-planner/clients/<slug>/
            ├─ brief.json    (identity, voice, boundaries)
            ├─ plan.json     (strategy, pillars, campaigns)
            ├─ goals.json    (KPI targets)
            ├─ performance.json (actuals, written by Viktor)
            ├─ learnings.json   (lessons)
            ├─ suggestions.json (Viktor's recommendations)
            ├─ approvals.log    (audit trail)
            └─ posts/p###.json  (one file per post)
                       ↕
                  Caddy container
                       ↕
                  React dashboard
                  (human review interface)
```

The dashboard is the **cockpit**. Telegram is the **chat interface**. Skills are the **brain**.

---

## Skills are the agent

Everything Viktor "knows how to do" is a `.md` file in his skills directory. Each skill:

- Has a `name` and `description` (in YAML frontmatter)
- Declares its `trigger`s (regex patterns, schedules, or "after another skill")
- Documents inputs, outputs, file-write contracts, commit patterns, idempotence rules, and safety invariants

The skills shipped in this repo at [`deploy/viktor-skills/`](./deploy/viktor-skills/):

| Skill | What it does | Status |
|---|---|---|
| [`approvals.md`](./deploy/viktor-skills/approvals.md) | `approve / reject / revise / block / unblock <id>` — flips post status, appends to log, queues Postiz | spec only |
| [`sync-postiz-analytics.md`](./deploy/viktor-skills/sync-postiz-analytics.md) | Daily 06:00 UTC — pull per-post metrics, recompute aggregates + vsGoals pace | spec only |
| [`weekly-summary.md`](./deploy/viktor-skills/weekly-summary.md) | Monday 09:00 local — wins/losses/nextTest digest to Telegram + dashboard | spec only |
| [`ai-suggestions.md`](./deploy/viktor-skills/ai-suggestions.md) | Reactive + Wednesday 10:00 — propose next actions to humans | spec only |

Still to be written:
- `draft.md` — the post-writing skill (uses voice + audience from brief, pillar from plan, references performance for what's working)
- `nano-banana-image.md` — image generation for posts
- `accept-suggestion.md` / `dismiss-suggestion.md` — sibling skills to ai-suggestions
- `log-learning.md` — append to learnings.json when a human says "log this as a lesson"

---

## File contracts

Viktor reads and writes JSON files. The TypeScript types in [`app-v2/src/types/`](./app-v2/src/types/) are the authoritative schema. The agent must obey them — the dashboard does compile-time validation against the same types, so any drift surfaces as runtime errors in the UI.

Key contracts:

- **One concept = one file.** Never bundle posts into a single file. Never collapse `learnings.json` items into `performance.json`.
- **Always preserve fields you don't understand.** If a field exists in the file but isn't in your skill's mental model, write it back unchanged.
- **Atomic writes.** Write to a temp file, `mv` into place. A crash mid-write must never leave a JSON file truncated.
- **Commit per turn.** One commit per Telegram message, even if you touched 5 files. Push immediately. If push fails, do not retry destructively — report and stop.

Read [`SKILL.md`](./SKILL.md) for the per-file write contracts in detail.

---

## Per-client deployment recipe

Each client gets their own Viktor container so:
- Telegram bot tokens are isolated (one bot = one client, no cross-talk).
- Postiz credentials are scoped (one Postiz workspace per client).
- A bug in one client's skill set can't corrupt another client's data.
- Containers can be paused/upgraded independently.

### One-time per client

```bash
SLUG=acme-fitness
TELEGRAM_TOKEN=<from BotFather, dedicated bot for this client>
POSTIZ_BASE=https://postiz.gf-internal.com
POSTIZ_TOKEN=<workspace API token>
NANO_BANANA_KEY=AIzaSyC6WCc4WkACVj25bBf379ig5d1pfpX0rFU
ANTHROPIC_API_KEY=<from console.anthropic.com>

# 1. Ensure the client's file tree exists (see deploy/ONBOARDING.md)
ls /opt/marketing-planner/clients/$SLUG/brief.json  # must exist

# 2. Spin up the Hermes container scoped to that client's data
docker run -d \
  --name viktor-$SLUG \
  --restart unless-stopped \
  -v /opt/marketing-planner/clients/$SLUG:/data \
  -v /opt/marketing-planner:/repo \
  -e CLIENT_SLUG=$SLUG \
  -e TELEGRAM_BOT_TOKEN=$TELEGRAM_TOKEN \
  -e POSTIZ_BASE=$POSTIZ_BASE \
  -e POSTIZ_TOKEN=$POSTIZ_TOKEN \
  -e NANO_BANANA_KEY=$NANO_BANANA_KEY \
  -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  -e GIT_AUTHOR_NAME="viktor-$SLUG" \
  -e GIT_AUTHOR_EMAIL="viktor@gf-innovative.com" \
  hermes-marketing:latest

# 3. Install Viktor's skills into the container
docker exec viktor-$SLUG mkdir -p /opt/skills
for f in /repo/deploy/viktor-skills/*.md; do
  docker exec viktor-$SLUG cp "$f" /opt/skills/
done
docker exec viktor-$SLUG /opt/hermes/reload-skills

# 4. Configure git inside the container (deploy key)
docker exec viktor-$SLUG ssh-keygen -t ed25519 -N "" -f /root/.ssh/id_ed25519
docker exec viktor-$SLUG cat /root/.ssh/id_ed25519.pub
# → paste the printed key into GitHub deploy keys for gf-marketing-planner

# 5. Smoke test on Telegram
#    Send to the new bot: "hi viktor"
#    Expect a greeting in the brand voice from brief.json
```

### When skills change

Skills live in this repo under `deploy/viktor-skills/`. To push an updated skill to every running Viktor:

```bash
ssh root@100.92.24.75 '
  for c in /opt/agents/viktor-*; do
    name=$(basename $c)
    docker cp /opt/marketing-planner/deploy/viktor-skills/. $name:/opt/skills/
    docker exec $name /opt/hermes/reload-skills
  done
'
```

Wrap that into a `scripts/reload-skills.sh` once the agent is real (it isn't yet).

---

## Safety invariants

These are non-negotiable. The skill specs each enforce a subset; this is the global view:

1. **No public action without literal human approval.** No post publishes, no DM is sent, no comment is posted, no email goes out, unless a human wrote the literal word "approve" plus the id on Telegram.
2. **Stay in scope.** Filesystem writes only to `/data` (the per-client folder). Git writes only inside the repo. Never reach into other clients' folders.
3. **Respect boundaries.** Every action is checked against `brief.boundaries`. Sensitive topics, words-to-avoid, who-handles-DMs — all enforced before sending anything to Telegram or Postiz.
4. **Commit everything.** Every action that mutates state appends to a log AND creates a git commit. There is no "silent" change.
5. **Atomic writes.** Tmp + rename. A crash never leaves the file half-written.
6. **No retries on destructive failures.** If `git push` fails after a `revise`, report and stop — don't loop, don't `--force`.
7. **No model fallbacks across clients.** A client paying for Opus gets Opus, even if Opus is down. Reply on Telegram explaining the outage; do not silently downgrade.

---

## Telemetry

Every Viktor instance writes its own log file at `/opt/marketing-planner/clients/<slug>/viktor.log`. Pilar checks the log directory daily — it's where she sees what each agent did overnight without opening every dashboard.

The dashboard's Approvals view also reads `approvals.log` and renders it as the activity feed.

---

## What lives in this repo vs the agent's container

| In this repo | In the running Viktor container |
|---|---|
| Skill specs (`deploy/viktor-skills/*.md`) | A copy of the same skills, loaded by Hermes |
| Dashboard source (`app-v2/`) | Nothing — Viktor never reads the dashboard code |
| Per-client data (`clients/`) | Mounted as `/data` |
| The Caddyfile | Nothing — Caddy is a separate container |
| `SKILL.md` (the cross-skill conventions) | Loaded as the top-level system prompt |
| `AGENT.md` (this file) | Read when bootstrapping a new client |

The repo is the source of truth. Containers are derivable from it. If a container drifts, rebuild it — don't patch in place.

---

## Adding a new skill

1. Write a new `.md` in `deploy/viktor-skills/` following the pattern of the existing four. Include YAML frontmatter with `name`, `description`, `trigger`.
2. Add a brief mention in [`SKILL.md`](./SKILL.md)'s "common workflows" section.
3. Update the table in this file under [Skills are the agent](#skills-are-the-agent).
4. Push to main.
5. Reload the skill on each running Viktor (see [When skills change](#when-skills-change)).

A new skill is a few hundred lines of Markdown plus the test loop on Telegram. That's the design goal — skills should be cheap to add.

---

## Open questions before the first real deploy

- [ ] Confirm Hermes' actual API: does it accept `.md` skill files as-is, or does the YAML frontmatter need to map to a different format?
- [ ] Hermes scheduler exists? If yes, all our `schedule:` triggers map directly. If no, fall back to host-level `systemd-timer`s that hit a Viktor HTTP endpoint.
- [ ] Postiz API shape (queue + analytics) — verify against a real Postiz instance before installing `approvals` + `sync-postiz-analytics`.
- [ ] Per-client cost cap on Anthropic API usage — anchor in environment vars (`ANTHROPIC_DAILY_BUDGET_USD`?) and have Hermes reject calls beyond the cap with a Telegram alert rather than silently bill.
- [ ] Decide which client gets Viktor first. Most informative pick: a client whose plan is already in the dashboard (FitVibe demo doesn't count — it's stock data). Likely Sebastian or GF Internal.

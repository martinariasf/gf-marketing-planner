# Viktor Agent Skills Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repo-canonical `agent-skills/` (core vs per-client), 12-skill keep-list on prod gf-innov, storyboard-first video + anti-AI-tell copywriting skills, self-update protocol, sync script, and updated agent-creation template.

**Architecture:** Skills live in `marketing-planner/agent-skills/{core,clients/<slug>}` and are rsynced to each box's bind-mounted `data/skills/{core,client}` by `sync-agent-skills.sh`. Unused live skills are parked (moved, not deleted) to `_disabled-skills/`. The prod system prompt is slimmed by delegating procedural detail to the now-actually-present skills.

**Tech Stack:** Markdown skills (Hermes SKILL.md format), bash sync script over SSH (`root@100.92.24.75`), docker compose restart. No app code changes.

**Spec:** `docs/superpowers/specs/2026-07-02-agent-skills-reorg-design.md`
**Worktree/branch:** `mp-worktrees/agent-skills-reorg` on `claude/agent-skills-reorg` (off `origin/experimental`).

**Ground rules for every task:**
- Never scp/overwrite live `config.yaml` or plugins wholesale — surgical edits with timestamped backups (`config.yaml.bak.skills-reorg-YYYYMMDD-HHMMSS`).
- Skill files on box must be owned `10000:10000`; skills reload only on container restart.
- Live boxes are the freshest source for skill CONTENT (live staging video-generation is 134 lines vs repo 90 — live wins).

---

### Task 1: Harvest live skills into `agent-skills/`

**Files:**
- Create: `agent-skills/core/{copywriting,image-generation,video-generation,post-drafting,approvals,ai-suggestions,weekly-summary,sync-postiz-analytics,creative-ideation,humanizer}/SKILL.md` (+ any `references/` subfolders)
- Create: `agent-skills/clients/gf-innov/{gf-carousel-slide-logo-embed,gf-reel-text-overlay}/SKILL.md` (+ their `references/`)
- Create: `agent-skills/clients/biomas/README.md`

- [ ] **Step 1: Pull the freshest copies from the boxes into the worktree**

```bash
cd "C:/Users/Admin/Desktop/GF Innovative Solutions/GF/mp-worktrees/agent-skills-reorg"
mkdir -p agent-skills/core agent-skills/clients/gf-innov agent-skills/clients/biomas
# generic skills whose freshest copy is on STAGING (marketing/*)
for s in copywriting image-generation video-generation; do
  scp -r root@100.92.24.75:/opt/agents/staging-demo/data/skills/marketing/$s agent-skills/core/
done
# generic skills whose only copy is on PROD
for s in post-drafting approvals ai-suggestions weekly-summary sync-postiz-analytics; do
  scp -r root@100.92.24.75:/opt/agents/gf-innov/data/skills/viktor/$s agent-skills/core/
done
for s in creative-ideation humanizer; do
  scp -r root@100.92.24.75:/opt/agents/gf-innov/data/skills/creative/$s agent-skills/core/
done
# client-specific skills from PROD
for s in gf-carousel-slide-logo-embed gf-reel-text-overlay; do
  scp -r root@100.92.24.75:/opt/agents/gf-innov/data/skills/viktor/$s agent-skills/clients/gf-innov/
done
```

- [ ] **Step 2: Genericize the core skills for any client**

The staging skills hardcode `staging-demo`; prod viktor skills may hardcode `gf-internal`/`gf-innov`. Core skills must work for every company. In every file under `agent-skills/core/`, replace hardcoded client slugs in API paths with the env placeholder already used by the system prompt:

- `GET /clients/staging-demo/...` → `GET /clients/$CLIENT_SLUG/...` (same for `gf-internal`, `gf-innov`)
- Prose like "For the client **staging-demo** on the Marketing-Planner staging server." → "For the client `$CLIENT_SLUG` on the Marketing-Planner server."
- Remove `staging`/client-name tags from frontmatter `tags:` lists.

Verify no hardcoded slug remains: `grep -rn "staging-demo\|gf-internal\|gf-innov" agent-skills/core/` → expect no output. GF-specific strategy references found inside `post-drafting/references/` (e.g. `gf-instagram-strategy.md`, `brand-asset-verification.md`) move to `agent-skills/clients/gf-innov/post-drafting-refs/`, and `core/post-drafting/SKILL.md` gets this pointer where they were referenced:

```markdown
> Client-specific strategy references (if any) live in the client skills folder
> (`skills/client/post-drafting-refs/` on the box). Read them when present.
```

- [ ] **Step 3: Create the biomas placeholder**

`agent-skills/clients/biomas/README.md`:

```markdown
# biomas — client-specific agent skills

No client-specific skills yet. Core skills come from `agent-skills/core/`.
Add a folder per skill here when Parque Biomas needs bespoke behavior.
```

- [ ] **Step 4: Commit**

```bash
git add agent-skills && git commit -m "feat: agent-skills/ canonical skill tree (core + per-client), harvested from live boxes"
```

---

### Task 2: Copywriting skill — visible voice + anti-AI-tell rules

**Files:**
- Modify: `agent-skills/core/copywriting/SKILL.md`

- [ ] **Step 1: Update frontmatter description**

Replace the `description:` line with:

```yaml
description: Writing or editing ANY marketing text — post copy, captions, CTAs, headlines. ALWAYS read the brand voice first and make it VISIBLE in the text. Hard rules against AI-sounding writing (no em dashes, no AI clichés). Covers where the voice lives and how to write changes back via the API.
```

- [ ] **Step 2: Strengthen STEP 0 (voice must be visible)**

After the existing "From the brief take:" block, add:

```markdown
**The voice must be VISIBLE, not just consulted.** After writing, re-read your
draft and point (to yourself) at where the toneKeywords show up. If a neutral
reader could not guess the brand's tone from the text alone, it is off-voice —
rewrite it. Generic marketing prose that "could be anyone" is a failure even if
it is grammatically perfect.
```

- [ ] **Step 3: Add the anti-AI-tell section (new STEP, between Write and API write-back)**

```markdown
## STEP 1.5 — Don't sound like an AI (hard rules)

The reader must never suspect the text was machine-written. These are hard
rules, not preferences:

- **NEVER use an em dash (—) or spaced hyphen ( - ) as a rhetorical pause.**
  This is the single biggest AI tell. Use a period, a comma, or a rewrite.
- No "it's not X, it's Y" / "not just X — Y" contrast constructions.
- Banned vocabulary: delve, elevate, unleash, seamless, game-changer, unlock,
  empower, revolutionize, "in today's fast-paced world", "look no further".
- No rule-of-three padding ("faster, smarter, better") unless the brand voice
  explicitly uses it.
- Vary sentence length. A human writes short ones. Then sometimes a longer one
  that carries the actual point. Uniform medium-length sentences read as AI.
- No summary sentence that restates what the copy just said.
- Emojis, hashtags, exclamation marks: only as the brand voice dictates.

Before output, scan the draft for every rule above. One violation = rewrite
that line.
```

- [ ] **Step 4: Verify and commit**

`grep -n "em dash" agent-skills/core/copywriting/SKILL.md` → match found.

```bash
git add agent-skills/core/copywriting && git commit -m "feat: copywriting skill — visible brand voice + anti-AI-tell hard rules"
```

---

### Task 3: Video-generation skill — storyboard-first, 15s cap

**Files:**
- Modify: `agent-skills/core/video-generation/SKILL.md`

- [ ] **Step 1: Update frontmatter description**

```yaml
description: Generating short marketing videos (max 15s) with Seedance via video_generate. MANDATORY storyboard-first flow — generate one still per scene with image_generate, send them to the user, WAIT for approval, only then generate the video.
```

- [ ] **Step 2: Insert the storyboard gate as a new STEP between "Read The Brand Identity" and "Generate"**

```markdown
## STEP 0.5 — Storyboard FIRST (mandatory, no exceptions)

Never call `video_generate` directly from a request. The user must see and
approve the scenes as still images first:

1. Break the video concept into scenes (typically 2–4 for a ≤15s clip). For
   each scene note: subject, action, camera movement, and approximate duration.
2. Generate ONE still per scene with `image_generate` (fidelity="fast"), using
   the brand colors/style from the brief, and attach the post's `post_id` /
   channel format like any other image.
3. Send the stills to the user with a one-line description per scene and the
   planned total duration.
4. **STOP and wait for explicit approval.** If the user asks for changes,
   adjust the affected scene still and re-send. Do NOT proceed on silence.
5. Only after approval, continue to STEP 1 and generate the video using the
   approved scene descriptions in the prompt (and the approved stills as
   `input_references` / `first_frame` where useful).

## Duration cap

**Maximum 15 seconds per video.** If the user asks for longer, say so and offer
either a 15s cut or a series of separate ≤15s clips (each with its own
storyboard approval). Default remains 5 seconds when the user does not specify.
```

- [ ] **Step 3: Update the `duration=5` line in the generate call's surrounding text** to say `duration=<approved seconds, max 15>`.

- [ ] **Step 4: Verify and commit**

`grep -n "15" agent-skills/core/video-generation/SKILL.md` → cap present in both new sections.

```bash
git add agent-skills/core/video-generation && git commit -m "feat: video-generation skill — mandatory storyboard approval gate + 15s cap"
```

---

### Task 4: New `skill-maintenance` core skill

**Files:**
- Create: `agent-skills/core/skill-maintenance/SKILL.md`

- [ ] **Step 1: Write the skill (full content)**

```markdown
---
name: skill-maintenance
description: Updating, improving, or parking the agent's own skills when the user asks for a behavior change that should persist. Covers where skills live, how to edit them safely, and why edits must be synced back to the repo.
tags: [meta, skills]
---

# Skill Maintenance (self-update)

Your skills live under `/opt/data/skills/`:

- `core/` — generic skills shared by every company agent.
- `client/` — skills specific to THIS company.
- `_disabled-skills/` — parked skills. The underscore prefix means they are
  NOT loaded. Never delete a skill; move it here instead.

## When to edit a skill

Only when the user asks for a lasting behavior change ("from now on…",
"always…", "update the skill so that…"). One-off requests do not touch skills.

## How to edit

1. Read the current SKILL.md fully before changing it.
2. Make the smallest edit that implements the request. Keep the frontmatter
   (`name`, `description`) valid — the description is what loads into context,
   so keep it accurate and short.
3. Tell the user EXACTLY what you changed (file + a summary of the diff).
4. Say this sentence, always: "This change is live-only until it is synced
   back to the marketing-planner repo (`agent-skills/`) — ask Martin to run
   `sync-agent-skills.sh --pull` to review and commit it."
5. Remind the user that skills reload on container restart, so the edit takes
   effect after the next restart.

## Hard limits

- Never delete a skill or its references — park to `_disabled-skills/`.
- Never edit `config.yaml`, plugins, or anything outside `/opt/data/skills/`.
- Never change another client's skills (you only see your own mount anyway).
```

- [ ] **Step 2: Commit**

```bash
git add agent-skills/core/skill-maintenance && git commit -m "feat: skill-maintenance skill — sanctioned agent self-update protocol"
```

---

### Task 5: `sync-agent-skills.sh`

**Files:**
- Create: `agent-skills/sync-agent-skills.sh`

- [ ] **Step 1: Write the script (full content)**

```bash
#!/usr/bin/env bash
# Sync canonical agent skills (repo) <-> a Hermes agent box.
# Usage: ./sync-agent-skills.sh <slug> [--pull] [--dry-run] [--no-restart]
#   push (default): repo core/ + clients/<slug>/ -> box, chown, restart agent
#   --pull:         box -> temp dir, diff against repo (review agent edits)
set -euo pipefail
HOST="root@100.92.24.75"
SLUG="${1:?usage: sync-agent-skills.sh <slug> [--pull] [--dry-run] [--no-restart]}"; shift || true
PULL=0; DRY=""; RESTART=1
for a in "$@"; do case "$a" in
  --pull) PULL=1;; --dry-run) DRY="--dry-run"; RESTART=0;; --no-restart) RESTART=0;;
  *) echo "unknown flag $a" >&2; exit 1;; esac; done
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
BOX_SKILLS="/opt/agents/$SLUG/data/skills"

if [ "$PULL" = 1 ]; then
  TMP="$(mktemp -d)"
  rsync -az "$HOST:$BOX_SKILLS/core/" "$TMP/core/"
  rsync -az "$HOST:$BOX_SKILLS/client/" "$TMP/client/" 2>/dev/null || true
  echo "== diff repo core/ vs box core/ =="
  diff -ru "$REPO_DIR/core" "$TMP/core" || true
  if [ -d "$TMP/client" ]; then
    echo "== diff repo clients/$SLUG/ vs box client/ =="
    diff -ru "$REPO_DIR/clients/$SLUG" "$TMP/client" || true
  fi
  echo "pulled copy left at: $TMP"
  exit 0
fi

# push
rsync -az --delete $DRY "$REPO_DIR/core/" "$HOST:$BOX_SKILLS/core/"
if [ -d "$REPO_DIR/clients/$SLUG" ]; then
  rsync -az --delete $DRY "$REPO_DIR/clients/$SLUG/" "$HOST:$BOX_SKILLS/client/"
fi
[ -n "$DRY" ] && { echo "dry-run only; nothing changed on box"; exit 0; }
ssh "$HOST" "chown -R 10000:10000 $BOX_SKILLS/core $BOX_SKILLS/client 2>/dev/null || true"
if [ "$RESTART" = 1 ]; then
  ssh "$HOST" "cd /opt/agents/$SLUG && docker compose restart"
fi
echo "synced skills to $SLUG (restart=$RESTART). Verify: ssh $HOST 'find $BOX_SKILLS/core $BOX_SKILLS/client -name SKILL.md | wc -l'"
```

Notes: `--delete` is safe because it only touches `core/` and `client/` — parked skills in `_disabled-skills/` and the old category folders are outside these paths.

- [ ] **Step 2: Smoke-test with --dry-run against prod (before Task 7 the box dirs don't exist yet — rsync dry-run will just list everything as new; that is the expected output)**

```bash
bash agent-skills/sync-agent-skills.sh gf-innov --dry-run
```

Expected: file list printed, "dry-run only; nothing changed on box", exit 0.

- [ ] **Step 3: Commit**

```bash
git add agent-skills/sync-agent-skills.sh && git commit -m "feat: sync-agent-skills.sh — push/pull skills between repo and agent boxes"
```

---

### Task 6: Docs + template updates

**Files:**
- Create: `agent-skills/README.md`
- Modify: `deploy-staging/staging-demo-agent/skills/` → replace 4 skill folders with a pointer `README.md`
- Modify: `deploy-prod/gf-innov-agent/README.md`, `deploy/ONBOARDING.md`
- Modify (outside repo): `08_Processes/.../skills/deploy-hermes-company-agent/SKILL.md` + resync to `~/.claude/skills` via `sync-skills.ps1`

- [ ] **Step 1: Write `agent-skills/README.md`**

```markdown
# agent-skills — canonical skills for all Hermes/Viktor agents

Single source of truth. Boxes are synced FROM here; never edit box skills and
walk away (that caused GF-32 drift).

- `core/` — generic, shipped to every company agent → box `data/skills/core/`
- `clients/<slug>/` — company-specific → box `data/skills/client/`
- Box-side `_disabled-skills/` holds parked skills (not loaded, not managed here).

Deploy: `./sync-agent-skills.sh <slug>` (rsync + chown 10000 + restart).
Review agent self-edits: `./sync-agent-skills.sh <slug> --pull` then commit
what's worth keeping. Core skills must stay client-agnostic: `$CLIENT_SLUG`
in API paths, no client names in prose.
```

- [ ] **Step 2: Replace `deploy-staging/staging-demo-agent/skills/` with a pointer**

```bash
git rm -r deploy-staging/staging-demo-agent/skills
mkdir -p deploy-staging/staging-demo-agent/skills
```

New `deploy-staging/staging-demo-agent/skills/README.md`:

```markdown
# Moved

Agent skills are canonical in `agent-skills/` at the repo root
(core + per-client). Deploy with `agent-skills/sync-agent-skills.sh staging-demo`.
The copies that used to live here were migrated 2026-07-02
(marketing-planner-staging stayed live-only on the box: it is staging-specific).
```

Note: `marketing-planner-staging/SKILL.md` is staging-infra-specific — do NOT move it into `core/`. It remains live on the staging box; mention it in the pointer README as above.

- [ ] **Step 3: Update `deploy-prod/gf-innov-agent/README.md` and `deploy/ONBOARDING.md`**

Append to the prod agent README a "Skills" section: on-box layout (`core/`, `client/`, `_disabled-skills/`), canonical source `agent-skills/`, deploy command, and the rule that config/system-prompt changes still follow the timestamped-backup convention. In `deploy/ONBOARDING.md`, update the agent-skills step (Step 6 area) to point at `agent-skills/` + sync script instead of any older path.

- [ ] **Step 4: Update the `deploy-hermes-company-agent` skill (canonical + synced copy)**

In `C:\Users\Admin\Desktop\GF Innovative Solutions\GF\08_Processes\...\skills\deploy-hermes-company-agent\SKILL.md` (find exact path with `Glob 08_Processes/**/deploy-hermes-company-agent/SKILL.md`), add a step to the new-agent procedure after the config/plugins setup:

```markdown
### Step N — Ship the canonical skills

Every new agent gets the shared skill set from the marketing-planner repo:

    cd marketing-planner/agent-skills
    mkdir clients/<slug>            # if it doesn't exist; add a README
    ./sync-agent-skills.sh <slug>   # rsync core/ + clients/<slug>/, chown, restart

On the box this creates data/skills/core/ and data/skills/client/. Do not
hand-copy skills from another agent; do not create per-agent forks of core
skills — client differences go in clients/<slug>/.
```

Then run `sync-skills.ps1` so `~/.claude/skills` picks it up.

- [ ] **Step 5: Commit (repo changes only; 08_Processes is a separate folder — note in commit message that the template skill was updated alongside)**

```bash
git add agent-skills/README.md deploy-staging/staging-demo-agent/skills deploy-prod/gf-innov-agent/README.md deploy/ONBOARDING.md
git commit -m "docs: agent-skills layout, sync workflow, template + onboarding updates"
```

---

### Task 7: Prod gf-innov box migration

**Files (on box):** `/opt/agents/gf-innov/data/skills/*`, `/opt/agents/gf-innov/config.yaml`

- [ ] **Step 1: Snapshot + park everything**

```bash
ssh root@100.92.24.75 '
set -e
cd /opt/agents/gf-innov/data/skills
tar czf /root/gf-innov-skills-backup-$(date +%Y%m%d-%H%M%S).tgz .
mkdir -p _disabled-skills
mv creative productivity media email note-taking research social-media viktor diagramming domain gifs .curator_backups _disabled-skills/ 2>/dev/null || true
ls'
```

Expected: only `_disabled-skills` remains under `skills/`.

- [ ] **Step 2: Push canonical skills**

```bash
bash agent-skills/sync-agent-skills.sh gf-innov --no-restart
ssh root@100.92.24.75 "find /opt/agents/gf-innov/data/skills/core /opt/agents/gf-innov/data/skills/client -name SKILL.md | wc -l"
```

Expected: `13` (11 core + 2 client; skill-maintenance included).

- [ ] **Step 3: Slim the system prompt (surgical edit, backup first)**

```bash
ssh root@100.92.24.75 "cp /opt/agents/gf-innov/config.yaml /opt/agents/gf-innov/config.yaml.bak.skills-reorg-$(date +%Y%m%d-%H%M%S)"
```

Then edit `/opt/agents/gf-innov/config.yaml` `agent.system_prompt` ON THE BOX (fetch, edit locally, scp back only this file after diffing). Keep unchanged: the LANGUAGE RULE block, WHO YOU ARE persona, READ BEFORE YOU ACT gate, post-approval/publishing rules, and any GF-59/i18n or write-contract sections below the "How you work" list. Replace the three long "How you work" bullets for image generation, video generation, and copy detail with:

```
  • Images: read the brief first, then use the image_generate tool only — the
    `image-generation` skill has the full procedure (formats, logo via
    reference_images, fidelity, manifest).
  • Videos: storyboard stills first, explicit user approval, max 15 seconds —
    the `video-generation` skill has the full procedure. video_generate only.
  • Copy: brand voice must be visible and the text must never sound
    AI-written — the `copywriting` skill has the hard rules.
```

Also update the line "(The `image-generation` and `copywriting` skills hold the detail.)" — it is now true; leave it. Diff the edited file against the backup before scp: only the intended prompt lines change, nothing else in the YAML.

- [ ] **Step 4: Restart + verify load**

```bash
ssh root@100.92.24.75 "cd /opt/agents/gf-innov && docker compose restart && sleep 20 && docker compose logs --since 2m 2>&1 | grep -i -E 'skill|error' | head -30"
```

Expected: skills discovered from `core/` and `client/`, no YAML/parse errors, container healthy (`docker compose ps` → running).

---

### Task 8: Live verification on prod

- [ ] **Step 1: Copywriting check** — via the dashboard chat gateway (mp-prod-api `HERMES_AGENTS_JSON` route for gf-internal) or Telegram: ask Viktor to draft a short LinkedIn post. Verify: he reads `/brief` first, the copy reflects toneKeywords, and contains **no em dash (—)**.
- [ ] **Step 2: Video storyboard check** — ask for a short product video. Verify: Viktor produces scene stills via image_generate, sends them, and STOPS asking for approval; after approval he calls video_generate with duration ≤ 15.
- [ ] **Step 3: Image regression check** — ask for one post image. Verify: image generated, manifest row appended, visible in the dashboard Assets tab (watch for the known manifest-divergence pitfall).
- [ ] **Step 4: Skill-maintenance check** — ask Viktor "update your copywriting skill to also avoid the word 'synergy'". Verify he edits `/opt/data/skills/core/copywriting/SKILL.md`, announces the diff, and says the live-only/sync-back sentence. Then run `sync-agent-skills.sh gf-innov --pull` and confirm the edit shows in the diff. Revert or commit the edit as appropriate.
- [ ] **Step 5: Agent memory review** — read `/opt/agents/gf-innov/data/memories/MEMORY.md` and `USER.md` (2.6KB total); remove only facts that are demonstrably stale (e.g. references to deleted skills/paths). No structural change; keep a copy of the original next to it as `MEMORY.md.bak.skills-reorg`.
- [ ] **Step 6: Record evidence** (transcript snippets, log lines) for the review.

---

### Task 9: Review + merge

- [ ] **Step 1: Push branch and open PR to `experimental`**

```bash
git push -u origin claude/agent-skills-reorg
gh pr create --base experimental --title "Agent skills reorg: canonical agent-skills/ tree, prune, storyboard video + anti-AI copywriting" --body "Implements docs/superpowers/specs/2026-07-02-agent-skills-reorg-design.md. Prod gf-innov already migrated + verified (evidence in PR).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 2: Independent review (Layer 5)** — run the `independent-review` skill on the branch before merge; loop fixes until clean.
- [ ] **Step 3: After merge** — update Notion if a backlog item covers this; follow-up pass for staging-demo + biomas is a separate task (`sync-agent-skills.sh staging-demo` / `biomas` + parking their unused skills the same way).

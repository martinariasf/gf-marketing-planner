# Viktor Agent Skills Reorganization — Design

Date: 2026-07-02
Approved by: Martin (chat, 2026-07-02)
Scope: prod `gf-innov` agent first, then the agent-creation template; staging-demo/biomas reconciled after.

## Problem

The prod Viktor v2 agent (`/opt/agents/gf-innov/` on the Hetzner box) carries **33 skills
across 10 category folders**, most irrelevant to a marketing agent. Every skill's
name+description is loaded into context at startup, wasting tokens on every message.
Additionally:

- **Prod bug:** the system prompt references `image-generation` and `copywriting` skills
  that do not exist on the prod box (staging has them under `marketing/`; prod never got
  that folder).
- Only 4 skills are tracked in the repo (`deploy-staging/staging-demo-agent/skills/`).
  The 7 `viktor/*` dashboard skills on prod exist only on the box → silent drift
  (root cause pattern of GF-32).
- No separation between company-generic skills and company-specific ones.
- The ~28KB config system prompt duplicates procedural detail that belongs in skills.
- No sanctioned way for the agent to update its own skills.
- Two requested skills missing: copywriting with anti-AI-tell voice rules, and a
  storyboard-first video-generation workflow.

## Design

### 1. Repo is the single source of truth

New top-level folder in `marketing-planner`:

```
agent-skills/
  core/                      # generic — shipped to EVERY company agent
    copywriting/SKILL.md
    image-generation/SKILL.md
    video-generation/SKILL.md
    post-drafting/SKILL.md           # generalized; client refs move to clients/
    approvals/SKILL.md
    ai-suggestions/SKILL.md
    weekly-summary/SKILL.md
    sync-postiz-analytics/SKILL.md
    creative-ideation/SKILL.md
    humanizer/SKILL.md
    skill-maintenance/SKILL.md       # NEW — agent self-update protocol
  clients/
    gf-innov/
      gf-carousel-slide-logo-embed/SKILL.md
      gf-reel-text-overlay/SKILL.md
      post-drafting-refs/            # gf-instagram-strategy.md, brand-asset-verification.md
    biomas/                          # empty placeholder (README)
  sync-agent-skills.sh               # push mode + --pull diff mode
  README.md                          # layout + rules
```

Seed content comes from the live boxes (prod `viktor/*` skills, staging `marketing/*`
skills) — the freshest copy wins, verified against `origin/experimental` history.
`deploy-staging/staging-demo-agent/skills/` becomes a pointer README after migration.

### 2. On-box layout (per agent)

```
/opt/agents/<slug>/data/skills/
  core/     ← rsync of agent-skills/core/
  client/   ← rsync of agent-skills/clients/<slug>/
  _disabled-skills/   ← parked skills (underscore prefix = not loaded; recoverable)
```

Old category folders (`creative`, `productivity`, `media`, `email`, `note-taking`,
`research`, `social-media`, `viktor`, empty `diagramming`/`domain`/`gifs` stubs,
`.curator_backups`) are dissolved: keep-list skills move into `core`/`client`, the
rest into `_disabled-skills/`. Nothing is deleted. Files chown 10000:10000; container
restart to reload.

### 3. Keep-list (active on prod gf-innov: 12 skills)

Core (10): copywriting, image-generation, video-generation, post-drafting, approvals,
ai-suggestions, weekly-summary, sync-postiz-analytics, creative-ideation, humanizer.
Client (2): gf-carousel-slide-logo-embed, gf-reel-text-overlay.

Parked (21): baoyu-article-illustrator, baoyu-comic, baoyu-infographic, claude-design,
design-md, excalidraw, popular-web-designs, himalaya, gif-search,
remotion-video-production, youtube-content, obsidian, airtable, google-workspace, maps,
nano-pdf, notion, ocr-and-documents, powerpoint, teams-meeting-pipeline,
technical-commercial-discovery, blogwatcher, prospect-list-building, xurl.

### 4. Skill content changes

**copywriting** (extends the existing staging skill):
- Brand voice must be *visible*: pull `toneKeywords`, tone/voice, `boundaries` from
  `GET /brief` and demonstrably apply words-to-use / words-to-avoid in every piece of copy.
- Hard "don't sound like AI" section: **never use em dashes (—)**; no "it's not X,
  it's Y" constructions; no "delve / elevate / unleash / seamless / game-changer"
  vocabulary; no rule-of-three padding; vary sentence length; write like a person.

**video-generation** (extends the existing staging skill):
- Storyboard-first: break the concept into scenes → generate ONE still per scene with
  `image_generate` → send stills to the user → **wait for explicit approval** (adjust
  and re-send if asked) → only then call `video_generate`.
- Hard cap: **max 15 seconds per video** (refuse/split longer requests).

**skill-maintenance** (new): the agent may edit files under `/opt/data/skills/` when
asked to improve a skill; must announce exactly what changed; must state the change is
live-only until synced to the repo; must never delete a skill (park to
`_disabled-skills/` instead); reminds that a restart is needed to reload.

### 5. Slimmer system prompt

Move deep image/video/copy procedural detail from the prod `config.yaml` system prompt
into the corresponding skills. Keep: language rule, persona, read-before-act gate
(`GET /brief` first), one-line pointers to skills, publish/approval rules. Target
roughly half the current prompt size. Behavior must not regress: the prompt still names
the skills it delegates to, and those skills now actually exist on the box.

### 6. Sync script

`agent-skills/sync-agent-skills.sh <slug> [--pull] [--dry-run]`:
- **push** (default): rsync `core/` and `clients/<slug>/` to the box paths in §2,
  chown 10000:10000, `docker compose restart` the agent, print a verification line.
- **--pull**: rsync box → a temp dir and `git diff` against the repo copy, so
  agent-made edits become visible and reviewable instead of silently drifting.
- Runs from Windows via Git Bash over SSH (`root@100.92.24.75`), same pattern as
  existing deploy scripts.

### 7. Template + docs update

- `deploy-hermes-company-agent` skill (in `~/.claude/skills` + canonical 08_Processes
  copy): new-agent steps now include "sync agent-skills core + client folder" and the
  on-box layout from §2.
- `deploy-prod/gf-innov-agent/README.md` + `deploy/ONBOARDING.md`: document the layout
  and the sync script.
- Agent memory (`data/memories/MEMORY.md`, 2.2KB): review for stale facts only; no
  structural change.

### 8. Rollout order & verification

1. Repo work (agent-skills/ + script + template docs) on branch
   `claude/agent-skills-reorg`, PR into `experimental`.
2. Prod gf-innov box migration: park skills, deploy core+client, slim prompt
   (config.yaml backup first, as always), restart.
3. Verify live: skills list loads (container logs), a copy request shows brand voice
   and no em dashes, a video request produces stills first and stops for approval,
   image generation still works end-to-end (manifest row + dashboard visibility).
4. Independent review (Layer 5) before merging the branch to experimental.
5. Staging-demo + biomas reconciled in a follow-up pass using the same script.

## Error handling / risks

- **Drift:** the box is patched only via the sync script from the branch; live config
  edits keep the existing timestamped-backup convention.
- **Rollback:** parked skills are moved, not deleted; config.yaml backup restores the
  old prompt; `_disabled-skills` can be moved back wholesale.
- **Staging divergence:** staging-demo config is ahead of the repo (WhatsApp, caching,
  guardrails) — never scp repo config over it; only the skills folders are synced.

## Out of scope

- Postiz/plugin changes, dashboard changes, model changes.
- Write-back Phase 2 of GF-19, Telegram i18n (TASK-005).

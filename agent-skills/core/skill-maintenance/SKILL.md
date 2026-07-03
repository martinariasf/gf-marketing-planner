---
name: skill-maintenance
description: Updating, improving, or parking the agent's own skills when the user asks for a behavior change that should persist. Covers where skills live and how to edit them safely. After ANY skill edit you MUST tell the user the change is live-only until synced back to the marketing-planner repo.
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
   back to the marketing-planner repo (`agent-skills/`) — ask the platform operator to run
   `sync-agent-skills.sh --pull` to review and commit it."
5. Remind the user that skills reload on container restart, so the edit takes
   effect after the next restart.

## Hard limits

- Never delete a skill or its references — park to `_disabled-skills/`.
- Never edit `config.yaml`, plugins, or anything outside `/opt/data/skills/`.
- Never change another client's skills (you only see your own mount anyway).

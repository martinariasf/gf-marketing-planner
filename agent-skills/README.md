# agent-skills — canonical skills for all Hermes/Viktor agents

Single source of truth. Boxes are synced FROM here; never edit box skills and
walk away (that caused GF-32 drift).

- `core/` — generic, shipped to every company agent → box `data/skills/core/`
- `clients/<slug>/` — company-specific → box `data/skills/client/`
- Box-side `_disabled-skills/` holds parked skills (not loaded, not managed here).

> **Push is `rsync --delete`.** Anything on the box that is not in this repo is
> DESTROYED. Always run `--pull` (and `--dry-run`) and resolve the diff BEFORE
> pushing: an agent box may hold skills or edits that were never committed here.

Deploy: `./sync-agent-skills.sh <slug>` (rsync + chown 10000 + restart).
Review agent self-edits: `./sync-agent-skills.sh <slug> --pull` then commit
what's worth keeping. Core skills must stay client-agnostic: `$CLIENT_SLUG`
in API paths, no client names in prose.

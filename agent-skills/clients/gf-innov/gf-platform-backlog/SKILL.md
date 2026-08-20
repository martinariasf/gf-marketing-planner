---
name: gf-platform-backlog
description: Logging and managing product feedback (bugs, changes, ideas) in the "GF Platform Backlog" Notion database — the standing tracker for the marketing.gfinnov.com dashboard AND the Viktor agent. Use whenever Pilar or Martin reports a bug, requests a change, proposes an idea, or asks to "agregar al Notion / al backlog / al Kanban". Covers the Notion API recipe, the exact data-source ID, the property schema, and the valid select values so you never have to reconstruct them.
tags: [notion, backlog, gf, product, kanban]
---

# GF Platform Backlog (Notion)

The single source of truth for platform/agent feedback. When Pilar or Martin
reports something to fix or improve, it goes here as a new row — do NOT just
answer in chat and forget it.

## Credentials & IDs

- **Notion API key** (Pilar's integration): read from the `GF_NOTION_TOKEN`
  environment variable. **Never hardcode it in this skill** — it is a live
  credential and this folder is synced to git.
  - If `GF_NOTION_TOKEN` is unset on the box, the backlog calls will fail with a
    clear error. Ask Martin to provision it on the agent container rather than
    pasting the token into a file. If the token stops working, ask Pilar for a
    fresh one.
- **Data source ID** (the backlog table): `377ae4b1-247e-81f9-ac36-000b8455942d`
  - Full name: "GF Platform Backlog — marketing.gfinnov.com".
- **Notion-Version header**: `2025-09-03` (uses the newer `data_source_id`
  parent shape, not the legacy `database_id`).
- Use `/opt/hermes/.venv/bin/python3` for any Python that touches Google/Notion
  libs — the system `python3` and `uv`'s venv do not have them installed.

## Property schema (exact names + valid select values)

Property names are case-sensitive. Only these select values are accepted —
using any other string silently drops the value or errors:

- **Name** — `title` (required, short imperative title)
- **Description** — `rich_text` (the detail: what, repro, proposed fix)
- **Type** — select: `Bug` | `Idea` | `Change`
- **Area** — select: `Agent` | `Dashboard`
- **Priority** — select: `Urgent` | `High` | `Medium` | `Low`
- **Proposed by** — select: `Martin` | `Pilar`
- **Status** — select: `In discussion` | `Inbox` | `Approved to build` |
  `In progress` | `Done in Staging` | `Tested in Staging` | `Done in Main` |
  `Rejected` | `Shipped but buggy`
- **Estimate** — select: `S` | `M` | `L` (leave unset; dev sets it)
- **Release note** — rich_text (leave unset)
- **Target date** — date (leave unset unless the user gives one)

New items from a user report default to **Status = `Inbox`**.

## Workflow

1. **Read the whole table first** to avoid duplicates. Query with
   `page_size: 100` and list existing `[Type|Status] Name` before adding.
   Many things Pilar mentions already exist (e.g. "Programmed = real
   scheduling via Postiz"). Extend/reference, don't duplicate.
2. Map each reported item to Type + Area + Priority. Bugs that break the core
   promise (approve → schedule → publish) are `Urgent`/`High`. Encoding, i18n,
   agent-explains-itself → `High`/`Medium`.
3. Write the Description in clear business Spanish with a concrete proposed fix
   / root cause, not just a symptom. Pilar is not a programmer.
4. Create the rows (see script). Confirm count created vs attempted.
5. **Be active with your own additions**: after logging what the user asked,
   propose 2–3 extra rows you can see are needed to reach production / present
   the pilot (QA passes, onboarding checklist, etc.), clearly flagged as
   "extras que agregué yo".
6. Report back grouped: what they asked (with Type/Priority) + your extras.

Runnable helper: `scripts/add_backlog_items.py` (edit the `items` list, run).
Schema/value probe recipe: `references/notion-api-recipe.md`.

## Pitfalls

- Do NOT invent select values. If you need a value that isn't in the list
  above, re-query the data source schema (see references) — someone may have
  added an option — rather than guessing.
- The `parent` must be `{"type":"data_source_id","data_source_id": DS}` with
  Notion-Version `2025-09-03`. The old `database_id` shape 404s.
- POST /approvals on the dashboard only logs — it does NOT change a post's
  status. This is a separate system from this Notion backlog (see memory).

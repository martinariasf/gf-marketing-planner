---
name: weekly-summary
description: Every Monday 09:00 local, write a one-week retrospective (wins / losses / next test) into performance.weeklySummary, post the digest to Telegram, and commit. Also triggerable on demand via "weekly summary" / "what changed this week".
trigger:
  - schedule: "0 9 * * 1"
  - telegram: "^(weekly\\s+summary|recap\\s+last\\s+week|what\\s+changed\\s+this\\s+week)\\s*$"
---

# weekly-summary skill — Viktor

The push half of the learning loop. Once a week, Viktor reads what was measured + what was planned + what has already been learned, and writes a digest that goes straight to Telegram and the dashboard.

**Not yet deployed.** Spec only.

## Inputs

For each client:
- `performance.json` — written by the [`sync-postiz-analytics`](./sync-postiz-analytics.md) skill earlier the same morning.
- `goals.json` — the weekly focus + KPI for the current week (and the previous one for comparison).
- `plan.json` — pillar + campaign context so summaries reference the right priorities.
- `learnings.json` — to avoid recommending tests we've already run.
- The previous `performance.weeklySummary` (if any) — so the new digest is "what changed", not "the state of the universe".

## Output (3 places)

### 1. `performance.json` → `weeklySummary` field

```jsonc
"weeklySummary": {
  "week": 8,
  "wins":   ["one-sentence wins, up to 4"],
  "losses": ["one-sentence losses, up to 3"],
  "nextTest": "one-sentence next experiment. Always actionable. Always change behavior."
}
```

Rules:
- **Wins**: things that beat plan or established a useful baseline. Quote the number.
  - Good: "Save rate on educational Reels is 4.8% - above target. p003 cleared 900 saves."
  - Bad: "Engagement was strong."
- **Losses**: things that missed plan or surprised us. Quote the number.
  - Good: "Sign-ups pacing 15% behind. Hard-sell window (week 6) underperformed."
  - Bad: "Conversions were weak."
- **Next test**: ONE specific experiment for next week. Must be falsifiable. Must change behavior, not just observe.
  - Good: "Week 9: shift to founder-narrated transformation Reels (member-first POV) vs week 5-8 coach-led baseline. Measure save + share lift."
  - Bad: "Keep monitoring engagement."

If a learning has already been logged with the same `recommendedBehaviorChange`, do NOT propose it again. Pick the next-best alternative.

### 2. Telegram digest

```
📊 Week 8 recap for FitVibe

WINS
✓ Save rate 4.8% (above 4.5% target). p003 hit 940 saves.
✓ p004 challenge launch: 41 qualified DMs in 48h - highest ever.

LOSSES
✗ Sign-ups 15% behind. Week-6 hard-sell underperformed.
✗ TikTok experiment flat (watch time <8s).

NEXT TEST
Week 9: shift to founder-narrated transformation Reels (member POV). Measure save + share lift vs coach-led baseline.

Full: http://100.92.24.75/fitvibe-demo/performance
```

Use Telegram-flavored Markdown if available, otherwise plain text. Always include the dashboard URL.

### 3. (Optional) `learnings.json` entry

If `nextTest` is a NEW hypothesis (not already in learnings) AND the loss was high-confidence, propose appending a `low` confidence Learning placeholder:

```jsonc
{
  "id": "l007",
  "title": "[HYPOTHESIS] Founder-narrated Reels outperform coach-led",
  "platform": "instagram",
  "relatedPostId": null,
  "whatHappened": "Hard-sell week-6 missed plan by 15%. Audience disengaged from coach-led urgency.",
  "lesson": "Untested - to be validated week 9.",
  "recommendedBehaviorChange": "Shift narrator to member POV for transformation content.",
  "confidence": "low",
  "createdAt": "<now>"
}
```

After week 9 runs, a human (or Viktor with `log learning` skill) upgrades the confidence + finalizes the lesson.

## Commit pattern

```bash
cd /opt/marketing-planner
git add clients/<slug>/performance.json clients/<slug>/learnings.json
git commit -m "viktor(<slug>): weekly summary week N"
git push
```

Single commit per client. If multiple clients run the same morning, one commit per client (NOT a combined commit).

## Telegram routing

Each client has a configured Telegram chat in `brief.json`:
```jsonc
"contact": { "name": "Coach Lena", "telegram": "@lena_fitvibe" }
```
Post the digest to that contact. Additionally, post a one-line aggregated digest to the agency-internal Pilar channel:
```
FitVibe week 8: 2 wins / 2 losses / next test queued.
```

## Determining "this week"

The week number aligns with the quarter's week 1-12 (see `plan.json.quarter.months[].weeks`). If today's date doesn't fall inside the quarter (between Q boundaries), abort and reply "out of quarter window; weekly summary skipped".

For "last week" comparisons, look at the previous `weeklySummary.week` value (decremented), not today's date — protects against running the skill on Tuesday instead of Monday.

## On-demand triggers

When a human writes "weekly summary" / "recap last week" outside the scheduled run, do the same work but:
- Reply with the digest in-chat (don't repost to the configured contact).
- Still commit + push.
- Don't insert a new `learnings.json` placeholder unless explicitly asked.

## What this skill does NOT do

- Pull fresh metrics. Run `sync-postiz-analytics` first (or rely on the same morning's scheduled run at 06:00).
- Schedule new posts. → `draft` skill.
- Decide whether to approve a hypothesis as a real learning — that's a human call, or the `log-learning` skill.

## Open questions for installation

- [ ] Hermes scheduler vs systemd timer for the Monday-09:00 cron.
- [ ] Per-client Telegram channel vs agency-wide channel (probably both, but the routing config needs to live somewhere — in `brief.json` is the proposal).
- [ ] Local time vs UTC for the cron — defaults to Europe/Berlin since GF is in Germany; override per client if needed.

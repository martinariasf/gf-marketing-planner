---
name: ai-suggestions
description: Proactively propose next actions, post ideas, hook rewrites, pillar rebalances, and follow-ups based on the client's brief, plan, performance, and learnings. Writes to suggestions.json; humans accept or dismiss from the dashboard. Triggered after every analytics sync, after every weekly summary, on demand via "what should I do next" or "suggest" on Telegram, and on a soft schedule (Wednesday 10:00 local).
trigger:
  - schedule: "0 10 * * 3"
  - after_skill: ["sync-postiz-analytics", "weekly-summary"]
  - telegram: "^(suggest|what\\s+should\\s+i\\s+do\\s+next|ideas?)\\s*.*$"
---

# ai-suggestions skill — Viktor

This is the AI in "AI Marketing Assistant." Everything else Viktor does is pattern-matching on instructions; this is where he reads the whole picture and proposes the next move.

**Not yet deployed.** Spec only.

## When this runs

- **Reactive (most common)**: chained after `sync-postiz-analytics` and after `weekly-summary`. If the data just changed, the recommendations should change too.
- **Scheduled**: Wednesday 10:00 local. Mid-week is when humans most often ask "what's next?" and want a fresh batch.
- **On-demand**: "suggest", "what should I do next", "ideas", "ideas for instagram", etc.

## Inputs

For each client at `/opt/marketing-planner/clients/<slug>/`:

| File | Used for |
|---|---|
| `brief.json` | Voice, audience, boundaries (NEVER propose a suggestion that crosses a boundary) |
| `plan.json` | Pillars, weights, campaigns, monthly focus, key dates, platforms |
| `posts/*.json` | What's already drafted/in-flight, which pillars/campaigns are over/under populated |
| `performance.json` | Per-post metrics, vsGoals pace, weekly summary, what's working vs flat |
| `learnings.json` | Lessons already extracted - never propose a recommendation that contradicts a high-confidence learning, never propose one that's already encoded in a behavior-change |
| `suggestions.json` (prior) | Avoid duplicates. If a still-open suggestion already covers the same idea, refresh its `rationale` instead of creating a new one |

## Output: `suggestions.json`

Full-file rewrite (atomic write to tmp + `mv`). Schema:

```jsonc
{
  "items": [
    {
      "id": "s007",                                // unique per client. monotonic. format sNNN.
      "kind": "post_idea",                         // see "Kinds" below
      "title": "Coach Spotlight #2 on LinkedIn before the founder Aug 26 moment",
      "rationale": "Coach Spotlight series has 1 published entry (p002). Adding a second coach 1-2 weeks before the founder moment warms the LinkedIn audience and gives the algorithm signal on the format.",
      "suggestedAction": "draft p009 linkedin \"Article post\" pillar=\"Brand & Lifestyle\" campaign=\"Coach Spotlight Series\" date=2026-08-19 hook=\"Coach Diego doesn't talk about discipline. He talks about Tuesday.\"",
      "relatedPostId": null,                       // optional. set if this references a specific post
      "relatedCampaign": "Coach Spotlight Series", // optional
      "relatedPillar": "Brand & Lifestyle",        // optional. must match plan.pillars[].name when set
      "confidence": "low",                         // low | medium | high
      "status": "open",                            // open | accepted | dismissed - leave open on create
      "createdAt": "2026-08-12T08:14:00Z",
      "expiresAt": "2026-09-01T00:00:00Z"          // optional. for time-sensitive suggestions (date-bound moments)
      // decidedAt / decidedBy / decisionNote set by the dismiss/accept skills, NOT this skill
    }
  ]
}
```

**Carry forward** every existing entry whose `status` is `accepted` or `dismissed` — those are history. **Refresh or remove** existing `open` entries:
- If a new run still believes the suggestion → refresh `rationale` + `confidence` only, leave `id` + `createdAt` intact.
- If the data no longer supports it → set `status: "dismissed"`, `decidedBy: "viktor (stale)"`, `decisionNote: "data no longer supports this recommendation"`.

## Kinds

| Kind | When to use | `suggestedAction` shape |
|---|---|---|
| `post_idea` | A fresh post slot worth filling. Tied to a pillar + (usually) a campaign. | `draft p<NEW_ID> <channel> <format> pillar="..." campaign="..." date=YYYY-MM-DD hook="..."` |
| `hook_rewrite` | An existing draft's hook is weak vs evidence (e.g. matches a behavior we've learned doesn't land). | `draft hook <postId> v<NEXT_VERSION> with <approach>` |
| `cta_alternative` | An existing draft uses a CTA we've learned underperforms with this audience. | `revise <postId> cta="..."` |
| `pillar_balance` | A pillar is over- or under-used vs its `weight` target. | usually a `draft` for the under-used pillar, or a `dismiss` / `revise` for the over-used one |
| `next_action` | A strategic move (open an angle, pause a series, lean into a key date). | one-shot command appropriate to the action |
| `follow_up` | A post performed unusually well; do another in the same format/angle. | `draft p<NEW_ID> ...` referencing the original via `relatedPostId` |
| `pivot` | An experiment is flat and the plan said "if not, redeploy" — call it. | `pause platform=<x> reason="..." carry="..."` or similar one-shot |

**Constraints on every suggestion:**
- `suggestedAction` MUST be a valid Telegram command Viktor (or another skill) can execute. No prose. No "consider...". One literal line.
- `rationale` MUST cite at least one specific number, learning id, or named gap. "Engagement was low" is not a rationale; "Saves dropped 38% in week 6 (l003)" is.
- `confidence`:
  - `high` — supported by a `high` learning OR direct evidence (a post outperformed >2x baseline). Use sparingly.
  - `medium` — pattern across 2+ posts/weeks OR a `medium` learning.
  - `low` — extrapolation, single signal, or open hypothesis.

## Budget

Hard cap: **8 open suggestions per client at any time**. If a new run would push above the cap, dismiss the lowest-confidence open suggestions with `decisionNote: "auto-pruned: cap of 8 open"` until back to 8.

Per run, generate at most **3 new suggestions**. Refreshing existing ones doesn't count toward the limit.

## Commit pattern

```bash
cd /opt/marketing-planner
git add clients/<slug>/suggestions.json
git commit -m "viktor(<slug>): refresh ai-suggestions (N open, M new)"
git push
```

If no entries changed (`git diff --quiet`), skip the commit.

## Telegram delivery

- **Reactive (after analytics sync / weekly summary)**: do NOT post to Telegram. The human sees them on the dashboard next visit, and the weekly-summary digest already has their attention.
- **Scheduled (Wednesday 10:00)**: post a one-message digest of the top 3 highest-confidence open suggestions:
  ```
  💡 3 suggestions for FitVibe this week:

  1. [HIGH] Run a second empathy-framed Reel before the August dip
     → paste: draft hydration-2 ...

  2. [HIGH] Founder LinkedIn moment on Women's Equality Day is highest-leverage
     → paste: draft p010 ...

  3. [MED] Community pillar is under-used relative to its 25% weight
     → paste: draft p012 ...

  Full list: http://100.92.24.75/fitvibe-demo/suggestions
  ```
- **On-demand**: same digest format, in-chat.

## Accepting / dismissing (handled by OTHER skills)

This skill writes suggestions. Two sibling skills modify the status:

- **`accept-suggestion`** — triggered when a human pastes the literal `suggestedAction` back to Viktor. Viktor recognizes the action via fuzzy match against open suggestions; flips that suggestion's `status` to `accepted`, fills `decidedAt`/`decidedBy`, then executes the action (delegating to `draft`, `revise`, etc.). Spec: TODO.
- **`dismiss-suggestion`** — triggered by Telegram message `dismiss s007` or `dismiss s007 reason="not now"`. Flips `status` to `dismissed`, fills decided fields, commits. Spec: TODO.

Both sibling skills should append to a shared `suggestions.log` (same shape as `approvals.log`) for the audit trail.

## What this skill does NOT do

- Execute the suggestion (that's `draft`, `revise`, `accept-suggestion`, etc.).
- Flip the status of existing suggestions when humans act (that's `accept-suggestion` / `dismiss-suggestion`).
- Send Telegram suggestions during reactive triggers (would create notification noise).
- Cite vague justifications. Every rationale must reference a number, learning, or named gap.
- Propose anything that crosses a `brief.boundaries` rule.

## Safety invariants

- Never propose a post that violates `brief.boundaries.sensitiveTopics` or contains a `brief.voice.wordsToAvoid` term in its `hook`.
- Never propose a campaign or pillar not in `plan.json`.
- Never propose a `date` outside the current quarter (would silently break the calendar view).
- Never set `confidence: "high"` unless backed by `high` learning OR >2x baseline evidence.

## Open questions for installation

- [ ] Decide the cap (8 open + 3 new/run is a guess — tune after running for 2-3 weeks).
- [x] **Hermes scheduler confirmed** for the Wednesday 10:00 trigger.
- [ ] Should the `accept-suggestion` skill auto-execute the action, or just flip status and let the human re-paste? (Recommendation: auto-execute only if the action maps to an idempotent skill like `dismiss`; require re-paste for `draft` since the human may want to tweak the hook first.)
- [ ] Per-client thresholds. Some clients may want more/fewer suggestions per week — store in `brief.json` under a new `viktor.suggestionsPerRun` field?

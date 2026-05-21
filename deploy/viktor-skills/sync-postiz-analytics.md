---
name: sync-postiz-analytics
description: Pull post-level metrics from Postiz, recompute aggregates and goal progress, and rewrite performance.json for the client. Triggered by the Hermes scheduler (default daily 06:00 UTC) or on demand via Telegram with "sync metrics" / "sync postiz".
trigger:
  - schedule: "0 6 * * *"
  - telegram: "^(sync\\s+metrics|sync\\s+postiz|refresh\\s+performance)\\s*$"
---

# sync-postiz-analytics skill — Viktor

This skill is Viktor's pull half of the metrics loop. The push half (Postiz → channel) is handled by the [`approvals`](./approvals.md) skill, which queues approved posts into Postiz with a `postizJobId` stored in `post.publishing.postizJobId`. This skill uses those job ids to fetch what happened after the post went live.

**Not yet deployed.** Spec only. Install when the Postiz API shape is confirmed against a real instance.

## When this runs

- **Scheduled**: Hermes scheduler fires once a day at 06:00 UTC. If Hermes has no scheduler, fall back to a host-level systemd timer that calls Viktor's HTTP endpoint.
- **On-demand**: any human writes "sync metrics" or "sync postiz" or "refresh performance" on Telegram.

## Scope

For each client at `/opt/marketing-planner/clients/<slug>/`:

1. Read every `posts/p*.json` file. Collect the ones whose `publishing.postizJobId` is set AND `status` is `scheduled` or `published`.
2. For each such post, call `GET {POSTIZ_BASE}/api/posts/{jobId}/analytics` (see [Postiz API shape](#postiz-api-shape-best-guess) below).
3. Build the new `performance.json` (overwrite, do not patch):
   - `lastSyncedAt`: now ISO UTC
   - `source`: `"postiz"`
   - `posts[postId]`: the per-post metrics object
   - `aggregates.quarterly`: sum of reach + follower delta across all measured posts in the current quarter
   - `aggregates.monthly[<MonthName>]`: same, scoped to posts whose date falls in that month
   - `aggregates.weekly[<weekNumber>]`: same, plus `topPost` (the post id with highest reach that week)
   - `vsGoals[goalId]`: compare against `goals.json`'s quarterly targets. Compute `current`, `pace` (`ahead` / `on-track` / `behind`), and `deltaPct` (the difference between observed pace and expected pace, given how far through the quarter we are).
   - `weeklySummary`: **leave as-is** unless this is a Monday — that's the [`weekly-summary`](./weekly-summary.md) skill's job. Carry the previous value forward verbatim.

## Computing pace

Quarter has ~13 weeks. If we're 8 weeks in, expected progress is `8/13 ≈ 62%`. If `current/target` >= `1.05 * expected` → `ahead`. If `>= 0.9 * expected` → `on-track`. Else `behind`.

`deltaPct` = `((current/target) - expected) * 100`, rounded.

For non-additive metrics (e.g. save rate as a percentage), `current` is the running average across measured posts, weighted by impressions.

## Commit pattern

```bash
cd /opt/marketing-planner
git add clients/<slug>/performance.json
git commit -m "viktor(<slug>): sync postiz analytics (week N, P posts measured)"
git push
```

If `git push` fails: reply on Telegram with the error and leave the working tree as is. Do not retry destructively.

## Telegram reply (on-demand only)

When triggered by a human, reply with a one-paragraph digest, NOT a full chart:

```
Synced 5 posts from Postiz (week 8).
Reach this quarter: 487K / 1.2M (on track, -1%).
DMs this week: 12, biggest spike from p003.
Sign-ups: behind by 15%. Hard-sell window underperformed.
Full view: http://100.92.24.75/fitvibe-demo/performance
```

When scheduled (daily), silent unless something is `behind` by more than -20% on any quarterly goal — in that case, send a one-line alert to the configured Telegram channel.

## Postiz API shape (best guess — confirm)

`GET {POSTIZ_BASE}/api/posts/{jobId}/analytics`
```jsonc
{
  "jobId": "pz_xxx",
  "publishedAt": "2026-07-03T13:01:42Z",
  "publicUrl": "https://instagram.com/p/example",
  "metrics": {
    "reach": 12400,
    "impressions": 18900,
    "saves": 412,
    "shares": 88,
    "comments": 31,
    "likes": 1100,
    "profile_visits": 156,
    "clicks": 47,
    "dms": 8
  },
  "lastUpdatedAt": "2026-05-20T08:00:00Z"
}
```

Field map for our `performance.json`: same keys with `profile_visits` → `profileVisits`.

If `publishedAt` is set and the post file's `publishing.publishedAt` is null, ALSO write the post file:
- `publishing.publishedAt = <publishedAt>`
- `publishing.publicUrl = <publicUrl>`
- `status = "published"`
- `approval.status = "published"`

This closes the loop: scheduled → (Postiz publishes) → next sync flips the post to `published` with its public URL.

## Environment

- `POSTIZ_BASE` — base URL, e.g. `https://postiz.gf-internal.com`
- `POSTIZ_TOKEN` — bearer token
- (No per-channel id needed for analytics — the job id is enough.)

## Idempotence

- A second sync within the same minute should be a no-op if no new data: skip the commit if `performance.json` is byte-identical to the existing file (`git diff --quiet`).
- Never delete the previous `performance.json` — always overwrite atomically (write to a tmp file, `mv` into place) so a crash mid-write doesn't leave the file empty.

## What this skill does NOT do

- Draft posts. → `draft` skill.
- Approve posts. → `approvals` skill.
- Compose the weekly summary. → `weekly-summary` skill (Mondays only).
- Trigger an alert outside Telegram. → keep blast radius small; Telegram is enough.

## Open questions for installation

- [ ] Confirm the Postiz analytics endpoint URL + auth shape.
- [ ] Confirm Hermes scheduler exists; if not, use `systemd-timer` on the host or `cron` to call a Viktor HTTP endpoint.
- [ ] Decide the "behind by more than X%" alert threshold per client (start with 20%, tune from there).

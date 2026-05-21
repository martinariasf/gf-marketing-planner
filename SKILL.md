---
name: gf-marketing-planner-v2
description: Read or update the per-client data files that drive the Viktor Marketing Operating Dashboard. Use when adding posts, scheduling content, planning a quarter, updating client context, recording learnings, or syncing performance metrics. The agent writes JSON files in `marketing-planner/clients/<slug>/`; the React dashboard reads them live. TRIGGERS — any of: "draft a post", "add post for [client]", "approve <post-id>", "update brief for [client]", "plan Q[N] for [client]", "sync metrics from Postiz", "log a learning". DO NOT trigger for: general copywriting unrelated to a tracked client, one-off posts not going into the dashboard.
---

# Marketing Planner v2 — Agent Skill

You are operating the Viktor Marketing Operating Dashboard for GF Innovative Solutions. The dashboard is a static React SPA that reads JSON files from each client's folder. **You only edit the JSON files.** You never touch the React code or the HTML.

## File layout (per client)

```
marketing-planner/clients/<slug>/
├── brief.json          ← stable identity: who they are, voice, audience, boundaries
├── plan.json           ← strategy: quarter, pillars, campaigns, monthly focus, key dates, platforms
├── goals.json          ← quarterly + monthly + weekly targets
├── performance.json    ← actuals (you write this from Postiz/Meta data)
├── learnings.json      ← lessons accumulated over time
├── approvals.log       ← append-only audit trail
└── posts/
    ├── index.json      ← list of post IDs in this client folder
    ├── p001.json
    ├── p002.json
    └── ...
```

**One concept = one file.** Never bundle posts together. Never mutate `posts/index.json` without also creating or removing the corresponding `pNNN.json`.

## What you write

The complete data contract is in `marketing-planner/app-v2/src/types/`. TypeScript files. Read them when you need the exact field list — they are the source of truth. Highlights below.

### Post (`posts/pNNN.json`)

```jsonc
{
  "id": "p007",
  "date": "2026-09-15",
  "channel": "instagram",         // instagram | linkedin | tiktok | x | facebook
  "format": "Reel",               // Reel | Carousel | Image post | Article post | Story | etc.
  "pillar": "Education",          // must match a pillar.name from plan.json
  "campaign": "Back-to-Routine Edu",  // optional, must match campaign.name from plan.json if set
  "title": "Short headline",
  "image": "https://...jpg",      // URL — Nano Banana output or stock
  "copy": "Caption. \\n Use \\n for newlines.",
  "hashtags": ["#tag1", "#tag2"],
  "cta": "What to do",
  "status": "in_review",          // idea | drafting | in_review | needs_revision | approved | scheduled | published | rejected
  "approval": {
    "status": "in_review",
    "approvedBy": null,
    "approvedAt": null,
    "version": 1,
    "blockerReason": null
  },
  "publishing": {
    "postizJobId": null,
    "publishedAt": null,
    "publicUrl": null
  }
}
```

After writing a new post, **add the id to `posts/index.json`** — the dashboard's loader reads that file to know which posts exist.

### Performance (`performance.json`)

You own this file. Pull metrics from Postiz, write the file, commit. Schema:
- `lastSyncedAt` (ISO timestamp)
- `source` ("postiz" | "manual" | "meta")
- `posts[postId]` → per-post metrics
- `aggregates.{quarterly,monthly,weekly}` → roll-ups
- `vsGoals[goalId]` → current/target/pace/deltaPct per quarterly goal
- `weeklySummary.{week, wins, losses, nextTest}` → human-readable digest

The dashboard's Goals view shows count-up KPI cards driven by `vsGoals` and a target-vs-actual bar chart driven by `aggregates.monthly`. If you miss a field, the card will still render (with zero), but the chart will look broken — fill in all months.

### Approvals — the literal pattern

When Pilar/Martin sends "approve p041 p042" on Telegram:

1. For each id, set `approval.status` to `"approved"`, `approval.approvedBy` to the sender, `approval.approvedAt` to now (ISO). Also flip the top-level `status` to `"approved"`.
2. Append one line per id to `approvals.log`:
   ```
   2026-05-20T17:32:00Z  approve  p041  Martin  via=telegram
   ```
3. Then queue the post in Postiz, store the returned job id in `publishing.postizJobId`, and re-save the post file with `status: "scheduled"` + `publishing.publishedAt: null` (Postiz will publish later; you set `publishedAt` and `publicUrl` after the publish webhook fires).

**Never auto-approve.** Approval requires a human writing the literal word. No exceptions.

### Brief / Plan / Goals

These change slowly. Edit fields in place; preserve every other field. Schema lives in `app-v2/src/types/{brief,plan,goals}.ts`.

When a new client onboards, ask for the intake answers below before touching any file. Don't invent positioning, voice, or boundaries.

## Required intake for a new client

1. **Company basics** — name, industry, country, website, contact (name + Telegram or email).
2. **Business** — model, customer type, main offer, best-seller, top 3 differentiators.
3. **Audience** — 1–3 segments with demographic + psychographic + where they hang out. Pain points + desires + competitors + reference brands.
4. **Voice** — tone words, words to use, words to avoid, do/don't list.
5. **Channels** — which platforms, cadence, language.
6. **Boundaries** — what can Viktor do without asking? What needs approval? What topics are off-limits?
7. **Metrics that matter** — the 3–5 numbers the client actually cares about.
8. **Expectations** — what success looks like in 90 days, in their words.
9. **Quarter** — which quarter, year, theme, headline.
10. **Strategic priorities + monthly focus + key dates + campaign roadmap + content pillars + platform strategy.**
11. **Goals** — quarterly targets (numbers), monthly breakdown, 12 weekly focuses with their KPI.

If anything is missing, ask. Don't fabricate.

## Strategist voice — non-negotiable rules

Same rules from v1 apply. Every piece of content should pass these tests:

**DO:**
- Write copy like a coach giving advice over coffee
- Lead with the audience's experience, not the brand's offer
- Cite research when making a claim
- Match the client's `voice.tone`, `voice.wordsToUse`, `voice.do`

**DON'T:**
- Use `voice.wordsToAvoid` — ever
- Make medical claims, weight-loss promises, or "transformation in days" hooks
- Use hustle-culture / influencer language
- Publish anything that touches `boundaries.sensitiveTopics` without explicit human approval

## Commit pattern

Every write should be followed by a commit. Group related edits in a single commit:

```bash
cd marketing-planner
git add clients/<slug>/posts/p041.json clients/<slug>/posts/index.json
git commit -m "viktor(<slug>): draft p041 hydration carousel"
git push
```

For approvals:
```bash
git add clients/<slug>/posts/p041.json clients/<slug>/approvals.log
git commit -m "viktor(<slug>): approve p041 (martin via telegram)"
git push
```

For performance syncs (typically once a day):
```bash
git add clients/<slug>/performance.json
git commit -m "viktor(<slug>): sync performance (week 8)"
git push
```

This gives a complete audit trail. Pilar never touches git.

## Common workflows

### "Draft 3 posts for next week's hydration campaign"

1. Read `brief.json` for voice, `plan.json` for the campaign's pillar/color and the relevant weekly focus from `goals.json`.
2. Generate 3 ideas that fit the pillar + the weekly KPI.
3. For each: pick the next free id (look at `posts/index.json`), write the post file with `status: "in_review"`, `approval.version: 1`.
4. Update `posts/index.json` to include the new ids.
5. If an image is needed and not provided, call Nano Banana, save the URL into `image`.
6. Commit + push.
7. Send Telegram previews to the human reviewer.

### "Approve p041 p042"

See "Approvals — the literal pattern" above.

### "Sync metrics from Postiz"

1. Pull per-post + aggregate metrics from the Postiz API.
2. Rewrite `performance.json` completely. Compute `vsGoals` by comparing aggregates against `goals.json`.
3. Generate `weeklySummary.wins / losses / nextTest` from the data.
4. Commit + push.
5. Send the weekly summary to Telegram.

### "Log a learning"

1. Append an entry to `learnings.json` `items[]` with a new `id` (l001, l002, …).
2. Include the related post / campaign / platform if relevant.
3. Always fill `recommendedBehaviorChange` — a learning that doesn't change behavior is noise.
4. Commit + push.

## Where the dashboard reads from

Dev: `http://localhost:5173/` reads `/data/<slug>/*.json` (the Vite middleware proxies to `marketing-planner/clients/<slug>/`).

Prod: `http://100.92.24.75/` (Tailnet) reads `/data/<slug>/*.json` from the Caddy container, which serves `/opt/marketing-planner/clients/<slug>/` directly.

In both cases the dashboard refetches on each page load. Your edit becomes visible to humans on the next browser refresh — no build step, no cache to bust.

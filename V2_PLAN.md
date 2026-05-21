# Viktor Marketing Operating Dashboard — v2 Plan

Status: draft, 2026-05-20. Supersedes the v1 framework in `app/` (two static views, single `plan.js`).

This document is the single source of truth for the v2 rebuild. It captures: what we're building, the architecture, the data contracts, the build order, and the open decisions still to make.

---

## 1. What changed since v1

v1 = a strategist's brief renderer. Two views (trimester, monthly), one `plan.js`, single client (FitVibe demo), no backend, no approvals, no metrics, no per-company isolation.

v2 = a per-client marketing operating system that Viktor (the Hermes Telegram agent) operates and humans review through the web dashboard.

Driving inputs:
- The Dashboard Product Spec (9 modules, 9 views).
- 2026-05-20 meeting with Pilar (1h41 transcript). Hard requirements distilled below.
- The need to plug into the existing GF infrastructure: Hetzner server, Hermes/Viktor agent, Postiz, Telegram, optional n8n.

---

## 2. Pilar's hard requirements (the non-negotiables)

1. **One central place for everything.** Strategy, metrics, assets, content — all viewable in one cockpit. Telegram is the chat interface, the dashboard is the cockpit.
2. **Approval is literal.** Nothing publishes without a human writing the word `approve` to Viktor (Mailchimp "delete" pattern). No auto-publish.
3. **Goals must be visible.** Quarterly, monthly, weekly. Targets and current state side-by-side. Currently missing from v1.
4. **Plan → Draft → Refine → Prepare → Learn loop** must be a *visible* workflow strip, not just implied.
5. **Main Brief = the onboarding document.** Captures: company basics, business/offer, goals, audience, voice, channels, content direction, visual direction, approval boundaries, community rules, metrics that matter, tools, references, expectations.
6. **Skills are the magic.** The `.md` skill files are portable. The dashboard is the cockpit, Viktor's brain lives in skills.
7. **Integrations are MVP, not "later".** Postiz scheduling, metrics sync, image generation. Without them it's "just another AI."

---

## 3. Architecture

### 3.1 Storage — server filesystem, no Drive

```
/opt/marketing-planner/                           ? git repo, pushed to GitHub
??? app/                                          ? static HTML/JS, served by Caddy
?   ??? index.html                                ? client picker landing
?   ??? client.html                               ? per-client dashboard (replaces trimester+monthly)
?   ??? assets/                                   ? CSS, fonts, brand
?   ??? lib/                                      ? alpine.js, motion.js, tailwind CDN refs
??? clients/
?   ??? acme/
?   ?   ??? brief.json                            ? Main Brief (stable identity)
?   ?   ??? plan.json                             ? quarter strategy, pillars, campaigns
?   ?   ??? goals.json                            ? quarterly + monthly + weekly KPI targets
?   ?   ??? performance.json                      ? actuals, written by Viktor from Postiz
?   ?   ??? posts/                                ? one .json per post (better git diffs)
?   ?   ?   ??? p001.json
?   ?   ?   ??? p002.json
?   ?   ??? assets/                               ? logos, photos, AI-generated images
?   ?   ??? learnings.json                        ? lessons over time
?   ?   ??? approvals.log                         ? append-only audit
?   ??? gf-internal/
?   ??? sebastian/
??? V2_PLAN.md
??? README.md
```

**Why server-only (no Drive):**
- Viktor lives on the same Hetzner box; filesystem access is sub-millisecond.
- Pilar's existing upload pattern is "send it to Viktor on Telegram" — Viktor saves the file to `clients/<slug>/assets/`. She never opens Drive.
- AI-generated images already land on the server.
- One source of truth eliminates sync-drift bugs.
- Drive can be added in v3 if a client demands self-serve uploads outside Telegram.

### 3.2 Git — already initialized, auto-commit per Viktor action

- Repo exists: `martinariasf/gf-marketing-planner` (initial commit `0d34800`).
- Every Viktor write goes through a wrapper that runs `git add <files> && git commit -m "viktor(<client>): <action>" && git push`.
- Wrapper lives at `clients/_lib/commit.sh` or as a Hermes skill `commit_change`.
- Pilar never touches git. Audit trail is automatic.
- **Client data folders are tracked** (small JSON, valuable history). **`assets/` binary files** are either tracked with Git LFS or kept out of git and backed up separately — decide in Phase 1.

### 3.3 The "backend" — Viktor + tiny optional n8n

Viktor (Hermes on `/opt/agents/viktor-<client>/`) is the operating engine:
- Reads/writes JSON files in `/opt/marketing-planner/clients/<slug>/` via filesystem tools.
- Drafts content, generates images (Nano Banana / OpenRouter).
- Receives `approve <post-id>` on Telegram → flips `status` and appends to `approvals.log`.
- Hands approved posts to Postiz for scheduling.
- Reads Postiz analytics → writes to `performance.json`.
- Compares actuals vs `goals.json` → writes weekly summary to dashboard + sends digest to Telegram.

**n8n is dropped from MVP.** n8n lives on a different server, so any integration adds a network hop and shared-secret management for zero MVP value. If Hermes has a built-in scheduler, Viktor runs his own weekly cron. If we add n8n back later, the contract is:

- n8n sends HTTPS webhook to a small `Viktor /hook/<action>` endpoint exposed on the Hetzner box.
- Hermes runs the matching skill and writes files locally.
- Auth via a single shared secret in a header.

Design implication for v2: **Viktor's skills should be invokable both from Telegram and from a local HTTP endpoint** so we can add n8n later without rewriting them.

**There is no custom HTTP backend for the dashboard.** The React app reads JSON files directly over HTTPS (Caddy). No REST API to maintain.

### 3.4 Approval flow

```
1. Pilar:   "Viktor, draft 3 posts for next week's hydration campaign."
2. Viktor:  drafts ? writes posts/p041.json, p042.json, p043.json (status: in_review)
            ? generates images ? saves to assets/
            ? sends previews to Telegram
            ? auto-commits to git
3. Pilar:   reviews on Telegram or dashboard. Replies "approve p041 p042" (p043 needs edits).
4. Viktor:  sets status: approved, approvedBy, approvedAt on p041 + p042
            ? appends to approvals.log
            ? hands them to Postiz (scheduled)
            ? auto-commits
5. Postiz:  publishes at scheduled time.
6. Viktor:  next morning pulls Postiz analytics ? updates performance.json ? auto-commits.
7. Weekly:  Viktor compares performance vs goals ? writes weekly_summary section ? notifies Pilar.
```

### 3.5 Frontend stack — Vite + React + TypeScript + Tailwind + shadcn/ui + Framer Motion

Reversing the earlier "no-build" position. This is a product we may sell. The UI must feel like a 2026 product, not a weekend script.

| Piece | Why |
|---|---|
| **Vite** | Modern dev server, instant HMR, builds to a static `dist/`. No magic, no framework lock-in. |
| **React 18** | Largest ecosystem, best AI fluency (Claude writes excellent React), easiest to hire for. |
| **TypeScript** | JSON schemas (`brief.json`, `plan.json`, `goals.json`, etc.) become **typed contracts** in `src/types/`. Catches Viktor-vs-dashboard schema drift at compile time — the "pillar name doesn't match" class of bug Pilar warned about. |
| **Tailwind CSS** | Utility-first styling. GF brand colors and Montserrat configured in `tailwind.config.ts`. |
| **shadcn/ui** | Copy-paste component library (no npm bloat). Cards, tabs, dialogs, dropdowns, charts, kanban primitives, sonner toasts — all already accessible and themeable. Current gold standard. |
| **Framer Motion** | Page transitions, count-up KPI numbers, drag-and-drop kanban reordering, scroll-triggered fades, hover micro-interactions. |
| **Recharts** | Goals-vs-actuals charts. Plays nicely with shadcn's chart wrapper. |
| **TanStack Router** *(optional)* | Type-safe client-side routing (`/clients/:slug/strategy`, etc.). React Router also fine. |
| **lucide-react** | Icon set that ships with shadcn. |

**Project layout:**
```
app/
├── public/                         ? static assets (favicon, fonts if self-hosted)
├── src/
│   ├── main.tsx                    ? entry
│   ├── App.tsx                     ? router + layout
│   ├── routes/
│   │   ├── index.tsx               ? client picker
│   │   └── client/
│   │       ├── layout.tsx          ? sidebar nav + workflow strip
│   │       ├── context.tsx         ? Company Context view
│   │       ├── goals.tsx           ? Goals vs Actuals view
│   │       ├── strategy.tsx        ? Strategy view
│   │       ├── calendar.tsx        ? Content Calendar view
│   │       ├── pipeline.tsx        ? Pipeline kanban
│   │       ├── approvals.tsx       ? Approvals queue (read-only)
│   │       ├── assets.tsx          ? Assets gallery
│   │       ├── performance.tsx     ? Performance view
│   │       └── learnings.tsx       ? Learnings view
│   ├── components/
│   │   ├── ui/                     ? shadcn primitives
│   │   ├── workflow-strip.tsx
│   │   ├── kpi-card.tsx
│   │   ├── post-card.tsx
│   │   ├── channel-mockup/         ? IG, LinkedIn, TikTok mockups (ported from v1)
│   │   └── ...
│   ├── lib/
│   │   ├── client-data.ts          ? fetch + cache the JSON files for a client
│   │   ├── format.ts               ? dates, numbers, deltas
│   │   └── brand.ts                ? color tokens
│   └── types/
│       ├── brief.ts
│       ├── plan.ts
│       ├── goals.ts
│       ├── performance.ts
│       ├── post.ts
│       └── learning.ts
├── tailwind.config.ts
├── vite.config.ts
├── tsconfig.json
└── package.json
```

**Build / deploy:**
- Local dev: `pnpm dev` ? `localhost:5173`. Symlink `clients/` into `public/` so the dev server reads real JSON files.
- Production build: `pnpm build` ? static `dist/`.
- GitHub Actions on push to `main`: build, rsync `dist/` to `/opt/marketing-planner/app-dist/` on Hetzner, **Caddy running in a Docker container** serves it.
- The Caddy container (`marketing-planner-caddy`, image `caddy:2-alpine`) is defined in `deploy/docker-compose.yml`. Two read-only bind mounts: `app-dist/` and `clients/`. Container restart not needed when either changes — Caddy serves files from disk per request.
- Bound to **Tailscale interface only** (`100.92.24.75:80`) for Phase 0. Public hostname + TLS comes in Phase 4 (see `deploy/README.md` for the upgrade path).
- `clients/` folder on the server is NOT in the React bundle — it's served as-is from `/opt/marketing-planner/clients/` by the Caddy container at `/data/...`. Dashboard fetches `/data/<slug>/plan.json` etc.

**Critical separation:** the React build pipeline is for the UI only. Viktor edits raw JSON files in `clients/` and never touches the bundle. The two are completely decoupled — a UI redeploy never blocks Viktor, and a Viktor edit never requires a rebuild.

**Brand:** Corporate Blue `#211D58`, Innovation Green `#8BC07C`, Montserrat. Defined as Tailwind theme tokens.

---

## 4. Data contracts

### 4.1 `brief.json` — the Main Brief (stable identity)

```jsonc
{
  "company": {
    "name": "Acme Co",
    "industry": "Boutique fitness",
    "country": "AR",
    "website": "https://acme.com",
    "contact": { "name": "Camila R.", "email": "...", "telegram": "@camila" }
  },
  "business": {
    "model": "B2C subscription",
    "customerType": "Urban professionals 28-45",
    "mainOffer": "...",
    "bestSeller": "...",
    "differentiators": ["...", "..."]
  },
  "audience": {
    "segments": [{ "name": "...", "demo": "...", "psycho": "...", "where": "..." }],
    "painPoints": ["..."],
    "desires": ["..."],
    "competitors": ["..."],
    "referenceBrands": ["..."]
  },
  "voice": {
    "tone": ["Warm", "Direct", "Grounded"],
    "wordsToUse": ["..."],
    "wordsToAvoid": ["..."],
    "do": ["..."],
    "dont": ["..."]
  },
  "channels": {
    "primary": ["instagram", "linkedin"],
    "cadence": "5/week",
    "language": "es"
  },
  "boundaries": {
    "viktorCanDoWithoutAsking": ["draft posts", "generate images", "research trends"],
    "viktorNeedsApprovalFor": ["any public post", "any reply to a DM", "any mention of pricing"],
    "sensitiveTopics": ["..."],
    "communityRules": { "who_handles_dms": "human", "escalation_owner": "..." }
  },
  "metricsThatMatter": ["save rate", "profile visits", "DMs from posts"],
  "tools": { "design": "Canva", "scheduler": "Postiz", "analytics": "Postiz + Meta native" },
  "references": { "drive_folder_url": null, "examples": ["..."] },
  "expectations": "What success looks like for Viktor in 90 days, in Pilar's words."
}
```

### 4.2 `plan.json` — strategy + content structure

Keep most of the current v1 schema (`agency`, `client`, `quarter`, `positioningStatement`, `strategicPriorities`, `platforms`, `keyDates`, `pillars`, `campaigns`, `monthlyFocus`). **Move `posts[]` out** to one-file-per-post in `posts/`.

### 4.3 `goals.json` — targets

```jsonc
{
  "quarterly": [
    { "id": "g_reach", "label": "Total reach", "target": 1200000, "unit": "people" },
    { "id": "g_followers", "label": "Follower growth", "target": 10, "unit": "%" }
  ],
  "monthly": [
    { "month": "July",   "goals": [{ "ref": "g_reach", "target": 350000 }] },
    { "month": "August", "goals": [...] }
  ],
  "weekly": [
    { "week": 1, "focus": "Establish baseline save rate", "kpi": "saves per post" }
  ]
}
```

### 4.4 `performance.json` — actuals (Viktor writes this)

```jsonc
{
  "lastSyncedAt": "2026-05-20T08:00:00Z",
  "source": "postiz",
  "posts": {
    "p001": { "reach": 12400, "impressions": 18900, "saves": 412, "shares": 88, "comments": 31, "likes": 1100, "profileVisits": 156, "clicks": 47, "dms": 8 }
  },
  "aggregates": {
    "quarterly": { "reach": 487000, "followerDelta": 142 },
    "monthly":   { "July": { "reach": 320000, "followerDelta": 84 } },
    "weekly":    { "1": { "reach": 78000, "topPost": "p001" } }
  },
  "vsGoals": {
    "g_reach": { "target": 1200000, "current": 487000, "pace": "behind", "deltaPct": -19 }
  },
  "weeklySummary": {
    "week": 4,
    "wins": ["..."],
    "losses": ["..."],
    "nextTest": "..."
  }
}
```

### 4.5 `posts/p###.json` — one file per post

Same schema as current v1 `posts[]` entries, plus:
```jsonc
{
  "approval": {
    "status": "approved",     // idea | drafting | in_review | needs_revision | approved | scheduled | published | rejected
    "approvedBy": "Martin",
    "approvedAt": "2026-05-20T17:32:00Z",
    "version": 3,
    "blockerReason": null
  },
  "publishing": {
    "postizJobId": "pz_abc123",
    "publishedAt": null,
    "publicUrl": null
  }
}
```

### 4.6 `approvals.log` — append-only

```
2026-05-20T17:32:00Z  approve  p041  Martin  via=telegram
2026-05-20T17:32:00Z  approve  p042  Martin  via=telegram
2026-05-20T17:45:11Z  reject   p043  Martin  reason="need stronger hook"
```

### 4.7 `learnings.json` — lessons over time

Per spec: insight title, related platform/post/campaign, what happened, lesson, recommended behavior change, confidence.

---

## 5. Views (dashboard sections)

Order = top-to-bottom on the new `client.html`. All in one scrollable page with sticky tab nav.

| # | View | Source | Purpose |
|---|---|---|---|
| 1 | **Workflow strip** (sticky top) | static | Plan ? Draft ? Refine ? Prepare ? Learn. Highlights current phase. |
| 2 | **Company Context** | `brief.json` | Who is this client, what they sell, voice, audience, do/don't. The "stable identity" Pilar called out. |
| 3 | **Goals vs Actuals** | `goals.json` + `performance.json` | Quarterly + monthly KPI cards. Target / current / delta / on-track or behind. Animated count-ups. |
| 4 | **Strategy** | `plan.json` | Positioning statement, strategic priorities, pillars, campaigns timeline (existing v1 trimester). |
| 5 | **Content Calendar** | `posts/*.json` | Month-by-month view with channel mockups (existing v1 monthly). |
| 6 | **Pipeline** (kanban) | `posts/*.json` | Columns: Idea, Drafting, In Review, Needs Revision, Approved, Scheduled, Published. |
| 7 | **Approvals** | `posts/*.json` filtered + `approvals.log` | Read-only queue. Shows what's waiting. Action happens on Telegram. |
| 8 | **Assets** | `assets/` folder listing + post references | Real thumbnails rendered inline, not a Drive link. |
| 9 | **Performance** | `performance.json` | Per-post metrics, weekly summary, what worked / failed / next test. |
| 10 | **Learnings** | `learnings.json` | Lessons accumulated over time. |

---

## 6. Build order (phased)

### Phase 0 — Stack scaffold + deploy pipeline ✅ DONE 2026-05-21
- `pnpm create vite app-v2 --template react-ts` inside `marketing-planner/app-v2/` (keeps v1 `app/` intact for reference).
- Tailwind v4 configured via `@theme` in `src/index.css` with GF brand tokens (Corporate Blue, Innovation Green, Montserrat).
- shadcn/ui (Nova preset, Radix) initialized with `@/` alias. Base components added: button, card, tabs, dialog, badge, separator, sheet, sonner, dropdown-menu, scroll-area.
- Framer Motion, Recharts, lucide-react installed.
- TypeScript types in `src/types/` for the seven JSON files in §4.
- `src/lib/client-data.ts` — typed fetchers for all client JSON files.
- Vite dev middleware in `vite.config.ts` serves `../clients/` at `/data/*` so dev mirrors prod paths.
- GitHub Actions workflow at `.github/workflows/deploy.yml`: on push to `main` touching `app-v2/**`, runs `pnpm install --frozen-lockfile && pnpm build`, rsyncs `dist/` to `100.92.24.75:/opt/marketing-planner/app-dist/`.
- **Docker Caddy** running on the box: `deploy/docker-compose.yml` + `deploy/Caddyfile`. Container `marketing-planner-caddy` bound to `100.92.24.75:80` (Tailscale only). Mounts `app-dist/` and `clients/` read-only.
- Smoke test passed: `http://100.92.24.75/` serves the SPA, `/data/fitvibe-demo/brief.json` returns typed JSON.

### Phase 1 — Schema migration + first 4 views (week 1)
- Migrate FitVibe demo data from v1 `plan.js` into the new schema (split into `brief.json` + `plan.json` + `goals.json` + `posts/*.json`).
- Build `src/routes/client/layout.tsx` (sidebar nav, sticky workflow strip with current-phase highlight).
- Build views: **Company Context**, **Goals vs Actuals** (with Recharts + count-up KPI cards), **Strategy** (port v1 trimester logic), **Content Calendar** (port v1 monthly logic + channel mockups).
- Update `SKILL.md` for Viktor: new file layout, one-post-per-file write workflow, `commit.sh` wrapper usage.

### Phase 2 — Pipeline + Approvals + Assets ✅ DONE 2026-05-21
- **Pipeline** 8-column kanban (Idea → Drafting → In Review → Needs Revision → Approved → Scheduled → Published → Rejected). Per-card dropdown reveals the literal Telegram command to move it (copies to clipboard + toast); no direct writes from the browser, matching the approval-via-agent contract.
- **Approvals** read-only queue. Lists all `in_review` / `drafting` / `needs_revision` posts with blocker reasons. Big Telegram banner with a one-click "copy batch approve" button. Recent-activity feed reads `approvals.log` line-by-line.
- **Assets** gallery driven by `clients/<slug>/assets/manifest.json`. Thumbnail grid with tabs (All / Approved / Draft / AI / Stock), source badges (Nano Banana / Canva / Stock / Internal), click to open a detail dialog with the design brief and the posts that reference the asset.
- Viktor's approval-skill spec written at `deploy/viktor-skills/approvals.md`. Not yet deployed to the Hermes container — spec only, ready for review and install.

### Phase 3 — Performance + Learnings + automation ✅ DONE 2026-05-21
- **Performance** view: top-performers panel (best by saves / DMs / reach), area chart of weekly reach over the quarter with the quarterly total + follower delta, per-post metrics table with click-to-sort by reach / saves / DMs / clicks (column highlighted, rest dimmed), and a week-N retrospective with wins / losses / next test pulled from `performance.weeklySummary`.
- **Learnings** view: confidence-tabbed list (All / High / Medium / Low). Each card shows the hypothesis, what happened, the lesson, and a brand-blue-bordered call-out for the recommended behavior change. Links to related post + campaign + platform.
- Viktor skill spec at `deploy/viktor-skills/sync-postiz-analytics.md`: scheduled daily 06:00 UTC + on-demand via Telegram. Reads every post's `publishing.postizJobId`, calls Postiz analytics endpoint, recomputes aggregates + `vsGoals` pace math, atomic-writes `performance.json`. Closes the publish loop by flipping any newly-published post to `status: "published"` with its `publicUrl`.
- Viktor skill spec at `deploy/viktor-skills/weekly-summary.md`: scheduled Monday 09:00 local. Reads performance + goals + prior learnings, generates wins / losses / next test with literal numbers, writes into `performance.weeklySummary`, posts the digest to the client's Telegram contact, optionally seeds a low-confidence hypothesis into `learnings.json` for the upcoming experiment.
- Both skills are spec-only; not yet installed on the Hermes container. Install once the Postiz API shape + scheduler choice are confirmed.

### Phase 4 — Polish + multi-client + go public (week 4)
- Client picker landing page (`src/routes/index.tsx` lists all `clients/*/`).
- Move Caddy off the Tailscale-only bind onto a public hostname (`marketing.gf-innovative.com`?) with TLS — see `deploy/README.md` "Going public" section.
- Per-client gate (Caddy basic auth in front of `/data/<slug>/*`, OR a simple per-client token in URL — decide based on actual confidentiality of each client's plan).
- Motion polish pass: page transitions, scroll-triggered fades, KPI count-ups, hover states.
- Dark mode via shadcn theme toggle (free, low effort).
- Mobile responsive QA.
- First real client onboarded (GF Internal? Sebastian?).

### Phase 5+ — Future (Pilar's "Viktor 2.0" wishlist)
- Canva integration (asset generation links + library).
- AI suggestions inside the dashboard.
- Industry templates (services, retail, SaaS, personal brands).
- CRM/contact integration.
- Direct publishing (still approval-gated).

---

## 7. Open decisions

| Question | Default if not decided | Status |
|---|---|---|
| n8n in MVP? | **dropped** — different server, adds hop, no MVP value. Webhook contract designed so we can add it later. | decided |
| Hermes scheduler exists? | confirm in Phase 0; fallback is host-level systemd timer or cron | pending |
| Multi-client URL scheme: `/clients/:slug/*` vs `<slug>.marketing.gf-innovative.com` subdomain | path-based for MVP, subdomains for v3 | decided |
| Auth for the dashboard | Caddy basic auth per client folder for MVP, real auth in v3 | decided |
| Where Postiz analytics actually live (API endpoint, schema) | confirm during Phase 3 | needs check |
| Should Viktor commit-and-push on every edit, or batch? | batch within a single agent turn, push once at end | decided |
| Binary assets in git or Git LFS or out-of-git? | decide in Phase 1 — likely Git LFS if total stays under a few GB, else `assets/` in `.gitignore` + nightly rsync backup | pending |
| Package manager | `pnpm` (smaller, faster, monorepo-friendly if v3 splits packages) | decided |
| FitVibe v1 demo: migrate or wipe? | migrate to `clients/fitvibe-demo/` so we always have a working example | decided |

---

## 8. Migration notes from v1

- v1 `app/` folder stays untouched during Phase 0 and 1 as visual reference. The React rebuild lives in `app-v2/` until parity is reached, then `app/` is archived (renamed `app-v1-archive/`) and `app-v2/` is renamed to `app/`.
- `app/data/plan.js` becomes the seed data for `clients/fitvibe-demo/`. Split into the new file layout per §4.
- `app/trimester.html` and `app/monthly.html` are the design reference for the Strategy and Calendar views in React. Visual logic ports directly; data binding swaps from `window.MARKETING_PLAN` to fetched JSON.
- `app/SKILL.md` needs a rewrite for the new file layout. Old SKILL.md stays in `app-v1-archive/` as historical reference until v2 SKILL is validated.
- `app/assets/auth.js` (frontend password gate) is replaced by Caddy basic auth at the reverse-proxy layer — real security, not a frontend trick.

---

## 9. What this gives you

A dashboard that:
- Is the single cockpit for any client's marketing operation.
- Shows context, strategy, goals, content, approvals, performance, and learnings in one place.
- Is operated by Viktor (Telegram-first) and reviewed by humans (web-first).
- Has real audit history via git.
- Has typed data contracts via TypeScript — Viktor and the dashboard cannot drift silently.
- Generalizes across clients without per-client code.
- Looks like a 2026 product, not a 2018 weekend project. Demoable to clients without UI apologies.
- Decouples the UI build pipeline from the agent's write path — they evolve independently.

When Phases 0–3 land, this is the "stable foundation" the original spec recommended building before adding the automation and intelligence layers on top.

---

## 10. First concrete step

Phase 0, day 1: scaffold the Vite + React + TS project in `marketing-planner/app-v2/`, wire Tailwind + shadcn, set up the GitHub Actions deploy to Hetzner, render a "hello FitVibe" page that successfully fetches `/data/fitvibe-demo/brief.json` from Caddy. That single end-to-end smoke test de-risks the whole stack before any view is built.

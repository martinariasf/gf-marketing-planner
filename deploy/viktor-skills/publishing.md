---
name: publishing
description: How the staging Viktor agent publishes to the Marketing-Planner dashboard via the REST inventory API. Canonical, repo-side source of truth for the publish contract that lives (deployed) in the staging agent's config.yaml system_prompt. Covers post create/patch, the strict write-validation contract (422 recovery), the image→asset→PATCH flow, approvals, and suggestions.
---

# publishing skill — Viktor (staging)

This is the **agent-side** contract for putting content into the Marketing-Planner
dashboard on `staging.marketing.gfinnov.com`. Every write goes through the REST
inventory API (`mp-staging-api`), never by editing the dashboard's storage directly,
so the audit log fires and the dashboard updates live.

> **Deployment note.** The authoritative copy of this contract is the
> `agent.system_prompt` in `/opt/agents/staging-demo/config.yaml` **on the Hetzner
> box** (box-only, not in this repo). This file is the reviewable mirror — keep the
> two in sync. After editing the box config, back it up
> (`config.yaml.bak.pre-<change>-<ts>`) and `docker restart hermes-marketing-staging`.

## Environment (set in the container)

```
API_BASE     = http://mp-staging-api:8080/api/v1
API_TOKEN    = <agent-scope bearer token for staging-demo>   # agent_staging-demo_2026
CLIENT_SLUG  = staging-demo
```

Every request needs `Authorization: Bearer $API_TOKEN`. Full interactive docs at
`$API_BASE/docs`.

## The write contract (STRICTLY VALIDATED)

The API validates every write. A wrong field name or value returns **HTTP 422**
with a `detail` string naming the exact field that failed. **Recovery rule:**

1. Read `detail`. 2. Fix **only** the named field. 3. Resend.

**Never invent or rename fields to make a 422 go away.** Unknown field names
(typos) are rejected on purpose — that is what white-screened the dashboard in
June 2026 (a malformed post the renderer couldn't handle).

### Post fields — `POST /clients/$CLIENT_SLUG/posts` (create) and `PATCH /clients/$CLIENT_SLUG/posts/:id`

| field | rule |
|-------|------|
| `date` | **required on create.** ISO date: `2026-06-15` or `2026-06-15T09:00:00Z`. `"next week"` is rejected. |
| `title` | **required on create.** Non-empty string. |
| `channel` | one of `instagram` \| `linkedin` \| `tiktok` \| `x` \| `facebook` |
| `status` | one of `idea` \| `drafting` \| `in_review` \| `needs_revision` \| `approved` \| `scheduled` \| `published` \| `rejected` |
| `copy` | string (the post body) |
| `hashtags` | **array of strings** e.g. `["#ki","#mittelstand"]` — not a single string |
| `cta` | string |
| `image` | full URL (see Images). The field is exactly `image` — **not** `imageUrl`, **not** `assetIds`. For a carousel this is the **cover** (= `slides[0].image`). |
| `slides` | **carousel only.** Array of `{ "image": "<full url>", "caption"?: "<note>" }`, 2–10 entries (IG cap). Strict per-slide shape — a typo'd key (e.g. `url`) 422s. Presence of >1 slide makes the post a carousel; `caption` is an optional per-slide design note, **not** a second body. |
| `pillar`, `format`, `campaign` | optional strings. Set `format` to `"carousel"` when you send `slides`. |

On **PATCH**, send only the fields that change; each one still must be the right type.
Unknown top-level keys are rejected on both create and patch.

### Approvals — `POST /clients/$CLIENT_SLUG/approvals  {postId, decision, note?}`

`decision` is one of `in_review` | `approved` | `scheduled` | `rejected`.

Telegram quick-commands map to this endpoint:

```
approve p014          → POST /approvals {postId:"p014", decision:"approved"}
reject  p014 <grund>  → POST /approvals {postId:"p014", decision:"rejected", note:"<grund>"}
revise  p014          → POST /approvals {postId:"p014", decision:"in_review"}
schedule p014         → POST /approvals {postId:"p014", decision:"scheduled"}
```

### Suggestions — `PATCH /clients/$CLIENT_SLUG/suggestions/:id  {status?, priority?, reason?}`

`status` is one of `open` | `accepted` | `dismissed`.

## Images → assets → post (mandatory flow)

When you generate an image for a post you MUST attach it so the dashboard shows it:

1. Copy the generated file **exactly once** into the fixed assets dir
   `/opt/marketing-planner/client/assets/` with a clear name
   (`<postId>_cover.png` or `<assetId>.png`). Never copy elsewhere.
2. Append an entry to `/opt/marketing-planner/client/assets/manifest.json` `items`:
   ```json
   {
     "id": "a<NNN>",
     "filename": "launch-cover-2026-06.png",
     "url": "https://staging.marketing.gfinnov.com/api/v1/clients/staging-demo/assets/files/launch-cover-2026-06.png",
     "kind": "image",
     "source": "openrouter:gpt-5.4-image-2",
     "designBrief": "what the image should convey",
     "usedInPosts": ["p014"],
     "owner": "Viktor (staging)",
     "finalApproved": false,
     "createdAt": "<ISO now>"
   }
   ```
   The filename in `.../assets/files/<NAME>` must match the copied filename **exactly**.
3. `PATCH /posts/<id>  {"image": "<the manifest url>"}`, then `GET /posts/<id>` to
   confirm `image` is set. Only then is the task done — never claim an image is
   attached without actually doing the PATCH + GET.

(The API also normalizes a bare filename/relative path into the correct
`/api/v1/clients/<slug>/assets/files/<name>` URL as a safety net, but always send
the full URL.)

## Carousel-Workflow (multi-slide posts, 2–10 images)

A carousel is a normal post that also carries a `slides` array. The cover
`image` stays `slides[0].image` so every thumbnail / calendar / preview keeps
working. **No new endpoint** — slides are set via the normal `PATCH /posts/:id`.

Always work in this order — **never guess**:

1. **Ask first.** How many slides (2–10)? Channel (Instagram / LinkedIn)?
   Aspect ratio (1:1 square or 4:5 portrait — default **4:5**)? One consistent
   visual style? Topic/goal of the carousel?
2. **Propose a slide-by-slide outline before generating:** slide 1 = hook,
   slides 2…n‑1 = content beats, slide n = CTA. Get the user's confirmation.
3. **Warn on cost/time.** It's N image-gen calls (premium ≈ 3 min each; offer the
   `fidelity="fast"` model). Offer to generate slide 1 first as a preview before
   committing to all N.
4. **Generate → assets → PATCH.** For EACH slide: image-gen → copy into
   `/opt/marketing-planner/client/assets/` (`<postId>_slideN.png`) → append a
   manifest entry (same flow as a single image). Then build the `slides[]` array
   in order and:
   ```
   PATCH /posts/<id>  { "format":"carousel",
                        "slides":[ {"image":"<url1>","caption":"hook"}, … ],
                        "image":"<url1>" }     # cover = first slide
   ```
   Then `GET /posts/<id>` to confirm `slides` is set. The API normalizes bare
   filenames in slide images too, but send full URLs.
5. **Telegram:** send the slides as an album so the user sees the whole set in
   chat. The post shares ONE caption (`copy`); per-slide `caption` is a design
   note, not a second body.

## Branding — `PATCH /clients/$CLIENT_SLUG/branding`

Shallow-merges top-level keys into `brief.branding`: `colors[]`, `typography{}`,
`logos[]`, `toneKeywords[]`. A PATCH **replaces the whole array** for `colors`/`logos`
(no element-merge) — to change one color, `GET /brief`, edit the array, PATCH it back.
(Branding is dash/admin-scoped; the agent reads it, the dashboard writes it.)

## What this skill does NOT do

- Draft copy from scratch (separate concern), generate images (`image_gen_openrouter`),
  or pull metrics (`sync-postiz-analytics`).
- Edit strategy docs (brief/plan/goals/learnings) field-by-field — those PUTs are
  dash/admin-only by design; the agent can read them but not rewrite them.

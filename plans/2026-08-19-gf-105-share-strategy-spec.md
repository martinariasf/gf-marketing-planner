# GF-105 — Share Strategy (spec)

Date: 2026-08-19
Notion: GF-105 — "Share Strategy - a second kind of share link showing the plan without the creative"
Status: approved to build · staging only
Branch: `claude/gf-105-share-strategy` off `experimental`

## Problem

The existing Share link (GF-4) is built to review finished creative: it shows
the artwork, a platform-accurate mockup (`ChannelMockup`), and Preview /
Details tabs, in a swipeable card deck.

That is the wrong artifact for the conversation that happens *before*
production, when a client signs off the plan itself — which topics, which
formats, which networks, and how the posts are spread across the month.
Sending the content-review link forces the client to judge finished-looking
images when the subject is the plan, and it exposes creative that may not be
final.

## Proposed change

A second **kind** of share link, chosen by the sharer at creation time in the
existing share dialog. Everything security-shaped is reused unchanged: access
code, hashing, expiry, month subset (GF-42), review session, comments,
decisions, activity feed.

The strategy page shows, per post, only:

| Field | Source |
|---|---|
| Strategy | `post.pillar` |
| Type of post | `post.format` |
| Platforms | `post.channels` (falling back to `[post.channel]`) |
| Visual description | slide/media captions, falling back to `post.copy` |
| Date | `post.date` |

No images. No mockups. No Preview/Details tabs. No card deck.
The post copy is available per row behind a collapsed "show copy" toggle.

At the end: one month grid per shared month showing how the posts fall across
the days (a chip per post, coloured by pillar), then a volume summary — posts
per pillar, per platform, per format.

## Decisions taken (2026-08-19, with Martin)

1. **Link kind is set by the sharer at creation.** Not a toggle the recipient
   can flip. A link is either a content review or a strategy review.
2. **Full feedback**, not read-only: per-post comment, approve, request
   changes, plus the overall verdict — the same endpoints and the same
   `review_events` rows as a content link.
3. **Copy is shown but collapsed** per row.
4. **Description = captions with a copy fallback, AND Viktor is fixed** so it
   fills captions going forward.

### Why the fallback is needed

`Slide.caption` and `PostMedia.caption` are both optional, and a single-image
post has nowhere to store a description at all (`image` is a bare URL string).
Nothing — schema, API validation, or Viktor's writing skill — requires either.
Across all 9 seeded post files in `clients/`: **0 slide captions, 0 media
captions**. Without a fallback the description would be blank on essentially
every existing post.

The fallback is rendered muted and unlabelled as a brief, so a missing brief
still reads as missing rather than masquerading as one.

## Architecture

### Data model

`review_links` (PocketBase) gains one field:

```
{ name: 'view', type: 'select', values: ['content', 'strategy'] }
```

Not required. Absent or empty ⇒ `content`. Every existing link therefore keeps
its current behaviour with no migration.

No change to the posts collection.

### API — `deploy-staging/api/src`

**`reviewLib.ts`**

- `PublicPost` gains `channels?: string[]`. `sanitizePost()` emits it, keeping
  `channel` as the first entry for every existing consumer. *This is a real
  gap today: the sanitizer only emits the singular `channel`, so a
  multi-platform post is not expressible in the public payload at all.*
- New `stripVisuals(post: PublicPost): PublicPost` — removes `image`,
  `slides[].image`, `media[].url`, `media[].thumbnail`, `media[].assetId`;
  keeps `slides[].caption`, `media[].caption`, `media[].type`.
- `ReviewLinkRecord` gains `view?: 'content' | 'strategy'`, with a
  `parseLinkView(value: unknown): 'content' | 'strategy'` normalizer that
  defaults to `content`.

The "no pictures" rule is enforced **server-side**: for a strategy link no
image URL ever leaves the API. Hiding images in CSS would still ship the URLs
to an unauthenticated party.

**`routes/reviewLinks.ts`** — create accepts `view`; list returns it.

**`routes/reviewPublic.ts`** — `open` and `refresh` return `link.view`, and
pipe posts through `stripVisuals` when the view is `strategy`. Comment and
decision handlers are untouched.

### Frontend — `app-v2/src`

- `components/review-share-dialog.tsx` — a two-option segmented control above
  "Create link" (Content review / Strategy), and a kind badge on each existing
  link card.
- `routes/review/external.tsx` — after `open`, branch on `payload.link.view`
  and mount either the existing `ReviewShell` or the new strategy shell. The
  gate screen, session handling and decision plumbing stay shared.
- **New** `routes/review/strategy-view.tsx` — the strategy shell. A separate
  file because `external.tsx` is already 1435 lines of deck / swipe / mockup /
  lightbox machinery that the strategy view uses none of.
- **New** `components/strategy-month-grid.tsx` — one month grid, rendered once
  per shared month, plus the volume summary. Pure presentational component
  taking `(monthKey, posts)`.

### i18n

New `review.strategy.*` keys in EN, DE and ES in `lib/i18n-dict.ts`.

## Testing

- Vitest on the sanitizer: `stripVisuals` removes every URL-bearing field and
  keeps every caption; `sanitizePost` emits `channels` with `channel` first;
  `parseLinkView` defaults to `content` for absent / empty / junk values.
- Vitest on the public route: a strategy link's `open` response contains no
  `image`, no `slides[].image`, no `media[].url`.
- Manual on staging: create one link of each kind on the same range, confirm
  the content link is unchanged, and confirm the strategy link's raw API
  response (not just the page) is image-free.

## Out of scope

- Production promotion — staging only.
- Any change to how posts are authored in the dashboard editor.
- GF-103 (carousel bug when sharing the link), which touches the same surface
  but is a separate defect.

## Viktor (in scope, same branch)

`agent-skills/core/post-drafting/` and `agent-skills/core/copywriting/` are
updated so every post Viktor writes carries a visual caption — a one-line
description of what the image or video will show — on `slides[].caption` for a
carousel and on `media[].caption` otherwise. Synced to the agents via
`agent-skills/sync-agent-skills.sh`.

This is what makes the copy fallback temporary rather than permanent: new
posts get a real brief, old posts keep falling back.

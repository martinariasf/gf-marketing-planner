---
project: GF-69 Instagram Story post format
updated: 2026-08-15
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tags: [gf-69]
items:
  - gf-69: Also Stories? Or stories with Q&A? | priority: medium
  - gf-102: Add Story Type of Post | priority: medium
---

# Plan

## Simple Words

Today the platform knows two kinds of Instagram post: a single image and a
carousel. There is no way to plan a Story, and no way for anyone to choose the
post type at all - the type is guessed from whether the post has several slides.

After this change:

- A "Post type" control appears on each post in the content calendar. Martin,
  Pilar or a client can set a post to **Single image**, **Carousel** or **Story**.
- A Story post previews as a real vertical 9:16 phone screen with a "Story"
  badge, instead of a square feed post.
- When Viktor generates the picture for a Story, he makes it vertical
  1080x1920 (full screen), not the 1080x1350 feed shape.
- When a Story is scheduled, Postiz is told it is a Story and not a feed post.

Not included yet: interactive Q&A / question stickers. Instagram's Graph API
does not expose sticker payloads, so Postiz cannot publish them - that stays a
parked follow-up, exactly as recorded on the Notion item on 2026-07-13.

## Decisions and API Contracts

Canonical `format` values are **`single image`**, **`carousel`**, **`story`**.
`format` stays a free-form string on the wire (a strict enum would 422 legacy
rows and third-party writes); the canonical set is a shared constant used for
detection, the picker, and the Postiz mapping.

Postiz Instagram story contract, verified against the provider DTO
(`libraries/nestjs-libraries/src/dtos/posts/providers-settings/instagram.dto.ts`):

```json
"settings": { "__type": "instagram", "post_type": "story" }
```

`post_type` accepts only `post` | `story`.

**Known divergence, deliberately out of scope:** our `toPostizPayload` sends a
flat `{type,date,channels,content,media}`, while Postiz documents
`{type,date,posts:[{integration,value,settings}]}`. That mismatch belongs to
GF-26 ("Programmed = real scheduling", currently *Shipped but buggy*), not to
GF-69. This plan adds `settings` additively in the shape the existing payload
uses and does NOT restructure the scheduling contract.

### TASK-001: Add the canonical post-format contract to the API schema
status: todo
owner: martin
agent: sonnet
reviewer: kimi-k3
branch: claude/gf-69-story-format
area: api
estimate: S
depends_on: []
tags: [notion, gf-69, gf-102, api, schema]
acceptance:
- `POST_FORMATS` is exported from the post schema module as `['single image','carousel','story']`.
- An `isStoryFormat(post)` helper returns true only for a case-insensitive, trimmed `story` format.
- `format` remains an optional free-form string on create and patch; writing `format:"story"` returns 201/200, not 422.
- Writing an unknown format string (e.g. `"reel"`) still succeeds - no new rejection is introduced.
- `coalescePost` leaves an explicit `format:"story"` untouched and does not overwrite it with `single image`.
notes:
- Source: GF-69 in Notion (shaped 2026-07-05, Postiz gate passed 2026-07-13).
- Code evidence: deploy-staging/api/src/schemas/post.ts:116 declares `format: z.string().optional()`.
- Code evidence: deploy-staging/api/src/schemas/post.ts:256 derives format as only `carousel` or `single image` when absent.
- Technical scope: derivation must stay a fallback for EMPTY format only; a story has one image, so shape-based derivation can never infer it.

### TASK-002: Send the Instagram story post_type to Postiz when scheduling
status: todo
owner: martin
agent: sonnet
reviewer: kimi-k3
branch: claude/gf-69-story-format
area: api
estimate: S
depends_on: [TASK-001]
tags: [notion, gf-69, api, postiz, scheduling]
acceptance:
- `toPostizPayload` adds `settings: { __type: 'instagram', post_type: 'story' }` when the post format is story AND instagram is among the post's channels.
- A story post whose channels do NOT include instagram sends no instagram settings block.
- A non-story instagram post sends `post_type: 'post'` (explicit, not omitted) so feed behaviour stays deterministic.
- No other field of the existing payload changes; `type`, `date`, `channels`, `content`, `media` are byte-identical for existing non-story posts.
- A unit test covers all three cases (story+ig, story+linkedin-only, non-story+ig).
notes:
- Source: GF-69 in Notion; Postiz story support confirmed in the item on 2026-07-13.
- Code evidence: deploy-staging/api/src/scheduling/postiz.ts:86 `toPostizPayload` currently emits no settings key.
- Contract evidence: Postiz InstagramDto - `post_type` required, values `post` | `story`.
- RISK, accepted by Martin on 2026-08-15: self-hosted Postiz currently has 0 Instagram channels connected, so this cannot be verified end-to-end on staging. It ships reviewed but not live-verified, and must be re-tested when an IG channel is connected.
- Do NOT restructure the payload to Postiz's documented `posts[]` shape here - that is GF-26.

## Frontend Implementation

### TASK-003: Add a Post type picker to the content calendar
status: todo
owner: martin
agent: sonnet
reviewer: kimi-k3
branch: claude/gf-69-story-format
area: frontend
estimate: M
depends_on: [TASK-001]
tags: [notion, gf-69, gf-102, ui, calendar]
acceptance:
- The post detail pane in the calendar shows a "Post type" control with Single image / Carousel / Story.
- Changing it PATCHes `format` and the new value survives a hard reload.
- Selecting Carousel on a post with fewer than 2 slides is allowed but the preview still renders what the post actually has - the picker never mutates slides or media.
- The control is hidden or disabled in read-only/external-review contexts, matching how other edit controls on that pane behave.
- `npx tsc -b` and `npx vite build` pass in app-v2.
acceptance_note:
- The picker sets metadata only. It must not create, delete or reorder slides.
notes:
- Source: GF-102 in Notion (duplicate of GF-69) asks literally for a selectable Story type.
- Code evidence: app-v2/src/routes/client/calendar.tsx:403 `createPost` sends no format at all today.
- Code evidence: app-v2/src/lib/api-client.ts:371 `CreatePostInput.format` already exists and is unused by the UI.
- Code evidence: there is currently NO format picker anywhere in app-v2/src - this is the first one.

### TASK-004: Render story posts as a vertical 9:16 preview
status: todo
owner: martin
agent: sonnet
reviewer: kimi-k3
branch: claude/gf-69-story-format
area: frontend
estimate: M
depends_on: [TASK-001]
tags: [notion, gf-69, ui, mockup]
acceptance:
- `MockupPost` carries an optional `format` field and the calendar + external review pages pass it through.
- An instagram story post renders its image in a 9:16 frame with a "Story" badge, not a square frame.
- A story post does not render carousel dots, and does not render the feed action bar (heart/comment/send/bookmark) - a story has no feed chrome.
- A video post keeps its existing 9:16 reel rendering with the "Reel" badge, unchanged.
- A non-story image post keeps its existing square rendering, unchanged.
- The GF-65 "AI generated" disclosure still renders on story media.
notes:
- Source: GF-69 in Notion, v1 scope "calendar shows it".
- Code evidence: app-v2/src/components/channel-mockup/instagram.tsx:39 goes 9:16 only when a video is present.
- Code evidence: app-v2/src/components/channel-mockup/index.tsx:7 `MockupPost` has no `format` field yet.
- Code evidence: app-v2/src/routes/review/external.tsx:836 and :1345 already display `post.format` as text.

### TASK-005: Add EN/DE/ES copy for the post type control and story badge
status: todo
owner: martin
agent: sonnet
reviewer: kimi-k3
branch: claude/gf-69-story-format
area: frontend
estimate: S
depends_on: [TASK-003, TASK-004]
tags: [notion, gf-69, i18n]
acceptance:
- Every new user-visible string has a key in all three dictionaries (EN, DE, ES) in app-v2/src/lib/i18n-dict.ts.
- No hard-coded English string is introduced in the picker or the mockup badge.
- Switching language in the UI changes the picker label and every option label.
notes:
- Code evidence: app-v2/src/lib/i18n-dict.ts holds the EN (~line 374), DE (~line 1255) and ES (~line 2123) blocks.
- GF-67 established full 3-language coverage as the standard; a missing key is a regression.

## Agent Implementation

### TASK-006: Generate story images at 1080x1920 in the image plugin
status: todo
owner: martin
agent: sonnet
reviewer: kimi-k3
branch: claude/gf-69-story-format
area: agent
estimate: M
depends_on: []
tags: [notion, gf-69, agent, image-generation]
acceptance:
- `_ASPECT_TO_SIZE` gains a 9:16 story entry mapping to `1080x1920` (accepting `story`, `portrait_9_16` and `9:16` as aliases).
- An EXPLICIT story aspect_ratio is no longer overridden by `channel="instagram"`; the current channel-wins rule must yield to an explicit story request.
- `channel="instagram"` with no explicit aspect still resolves to `portrait_4_5` (1080x1350) - GF-33 behaviour is unchanged.
- When `post_id` is passed and that post's format is story, the resolved size is 1080x1920 without the caller passing an aspect.
- `python -m py_compile` passes on the changed plugin file.
notes:
- Source: GF-69 in Notion, v1 scope "9:16 image generation".
- Code evidence: deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/__init__.py:56 `_ASPECT_TO_SIZE` has no 9:16 image entry.
- Code evidence: same file :79-93 `_resolve_image_aspect` - the CHANNEL currently wins over an explicit aspect_ratio, which would silently defeat a story request. This is the trap in this task.
- Mirror the same change into deploy-prod/gf-innov-agent only if that plugin file is a copy; do not touch running prod containers.

### TASK-007: Teach the image-generation skill the story format rule
status: todo
owner: martin
agent: sonnet
reviewer: kimi-k3
branch: claude/gf-69-story-format
area: agent
estimate: S
depends_on: [TASK-006]
tags: [notion, gf-69, agent, skills]
acceptance:
- STEP 0.5 documents that an Instagram STORY is 9:16 1080x1920, distinct from the 4:5 1080x1350 feed image.
- The skill states that the POST FORMAT overrides the channel default when the post is a story.
- The existing GF-33 channel rules for feed/LinkedIn/X/Facebook are left intact.
notes:
- Code evidence: agent-skills/core/image-generation/SKILL.md:43 "PICK THE FORMAT FROM THE CHANNEL (GF-33)" currently says the channel always decides.
- Keep the edit tight; this skill is loaded on every image generation.

## Verification

### TASK-008: Add the changelog entry and run the full pre-merge checks
status: todo
owner: martin
agent: sonnet
reviewer: kimi-k3
branch: claude/gf-69-story-format
area: verification
estimate: S
depends_on: [TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007]
tags: [notion, gf-69, changelog, verification]
acceptance:
- A new entry is added at the TOP of app-v2/src/lib/changelog.ts, dated 2026-08-15, in plain user language.
- `cd app-v2 && npx tsc -b` passes - actual output quoted.
- `cd app-v2 && npx vite build` passes - actual output quoted.
- `cd app-v2 && npx eslint <changed files>` is no worse than before - actual output quoted.
- `cd deploy-staging/api && npx tsc --noEmit` passes - actual output quoted.
- `python -m py_compile` passes on the changed plugin file - actual output quoted.
notes:
- Code evidence: app-v2/src/lib/changelog.ts:122 is the existing GF-33 entry; match its tone and language coverage.
- No "should work" claims. Every check must be run and its real output pasted.

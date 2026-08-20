---
name: post-drafting
description: Draft brand-voice social posts from a brief, idea, or user prompt. Handles angle selection, boundary-safe reframing, image selection/generation, and creation of in-review posts for approval.
trigger:
  - telegram: "^(create|draft|new post|make a post)\\b.*$"
  - telegram: "^(about|write about|post about)\\b.*$"
---

# post-drafting

Use this when the user wants a new post, a rewrite, or a post concept turned into a channel-ready draft.

## Core goal

Create a post that sounds like the brand, stays inside the client's boundaries, and is ready for human approval.

## Inputs to read first

- `brief.json` for voice, audience, boundaries, and allowed topics.
- `plan.json` for pillars, campaigns, and current quarter focus.
- `posts/index.json` and nearby `posts/*.json` to avoid duplicates.
- `assets/manifest.json` to reuse approved images/logos before generating anything new.
- **Language note:** Interact with the user in the user's own language, but draft the marketing output in the language the client brief specifies (unless explicitly told otherwise).

> Client-specific strategy references (if any) live in the client skills folder
> (`skills/client/post-drafting-refs/` on the box). Read them when present.

## Drafting rules

1. **Write in the narrator voice the brief defines** (e.g. founder first-person, or the agent persona). Use the register the brief specifies.
2. **Show concrete work.** Name a workflow, tool, or shipping detail. Avoid abstract thought-leadership fluff.
3. **Stay on-voice.** Direct, specific, calm — as the brand voice dictates.
4. **Use one clear angle.** One idea, one workflow, one takeaway.
5. **Prefer narrow, real examples over broad claims.**
6. **Always describe the visual.** Every post ships with a one-line caption of
   what the viewer will see (see "Visual captions" below). It is a required
   field, not a nice-to-have — a client signs off the plan from it before any
   image or video exists.

## Drafting modes

This umbrella covers both:

- quick first-pass drafts from a brief or prompt
- rewrite requests for an existing concept, angle, or nearly-finished post
- platform adaptation requests, including turning a long-form draft into a channel-ready caption + cover in the right format

## Platform adaptation notes

When the user specifies a platform, adapt both the *copy* and the *visual* to that platform instead of only changing the channel field.

### Instagram

- Prefer shorter, punchier captions with clearer line breaks.
- Make the first 1–2 lines work as the hook; Instagram users should understand the point before expanding.
- Reduce CTA friction: keep it simple, low-commitment, and non-salesy.
- For image posts, default to a *portrait* cover (1080 × 1350 px, 4:5 ratio) unless the user explicitly asks for another format. Do not use square.
- Check mobile readability: large headline, generous margins, high contrast, minimal corner clutter.
- If the user asks for a logo correction, use the *actual approved logo asset* or a clearly faithful version of it. Do not let the generator invent a new brand mark.
- Share the final image as a MEDIA attachment for approval and keep the caption separate for easy review.
- When a user asks to *review the image in chat* or says they *don't always have access to the folder*, always send the candidate as a MEDIA attachment directly in the conversation in addition to saving it on disk.
- If a composition feels too empty or text-heavy, iterate on structure first (bands, cards, dividers, visual anchors) before adding more copy; maintain legibility over density.

- **User-provided image:** When the user sends an image to post (lands in `/opt/data/cache/images/img_*.jpg`), copy it to the client assets folder, register in `manifest.json` (increment the highest existing `id` suffix), and create the post with the staging asset URL in the `image` field. **Do NOT try to "see", OCR, browser-navigate, color-analyze, or otherwise inspect the image before posting.** The user has already seen it and decided to post it — attempting to analyze it wastes 5-10 tool calls and adds no value. Just proceed with the copy/register/post flow and draft the copy from the user's spoken context. If you genuinely need to know what's in the image (e.g. the user asks you to describe it back), use `vision_analyze` with the image path — one call, not a multi-tool investigation chain.

Client-specific channel strategy (positioning vs selling, tools allowlists, editorial themes, narrative voice) lives in the client skills folder — read `skills/client/post-drafting-refs/` when present and treat its rules as hard constraints.

## Boundary-safe reframing

If the user asks for a post that touches a sensitive or blocked topic (per the brief's `boundaries`), do **not** keep the unsafe angle and do **not** argue.

Reframe to a safe adjacent topic when possible:

- **Countries / national identity / geopolitics** → cross-border collaboration, distributed teams, international delivery, handoff design, time-zone coordination.
- **Politics / religion** → avoid; pivot to operational or workflow lessons.
- **Pricing or revenue claims** → avoid; pivot to process, learning, or customer pain.
- **Unshipped or confidential work** → avoid naming it; pivot to a generalized lesson from shipped work.

A good reframing keeps the structure but changes the topic from identity to workflow.

## Visual captions (required on every post)

A post is not draftable-complete until the visual is described in words. Write
the caption when you draft the copy, BEFORE the image or video is generated —
the client reviews the plan (pillar, format, platforms, visual, date) and signs
it off before creative is produced. If there is no caption, the reviewer sees
the post copy instead, which tells them nothing about the visual.

Where it goes depends on the format:

| Post format | Field | How many |
|---|---|---|
| carousel | `slides[].caption` | one per slide, cover included |
| single image / story | `media[].caption` | one, on the image entry |
| video / reel | `media[].caption` | one, on the video entry |

`slides[]` entries are `{image, caption}`; `media[]` entries are
`{type, url, caption}` with `type` either `image` or `video`. Both objects are
strict on the API — a typo'd key 422s the whole write, so do not invent field
names.

**The caption describes the picture, not the copy.** Name the subject, the shot,
and what is on screen. One literal sentence.

- Good: "Split screen: the old six-tab spreadsheet on the left, the single
  planner view on the right, brand green line down the middle."
- Good: "Close crop of the shop-floor terminal mid-scan, hands in frame, logo
  bottom right."
- Bad: "An image about saving time with automation." (nothing checkable)
- Bad: "Stop losing hours to spreadsheets." (that is the copy, not the visual)

On a carousel every slide caption must be different and must describe that
slide. "Slide 3" or a repeat of the cover caption is not a caption.

The caption is also the design brief you hand to `image-generation` /
`video-generation`. Generating first and captioning afterwards inverts the
review order — write it first, then generate against it.

## Image guidance

If the post needs a visual:

- Prefer a real screenshot, a clean photo, or a simple diagrammatic cover.
- If the user asks for an *infographic*, treat it as a feed-ready cover graphic: clear headline, a few steps or modules, minimal clutter, and readable at feed size.
- Avoid glowing brains, robots in suits, or AI-stock aesthetics.
- If the user specifically asks for the logo, include the client's real logo as a composited overlay or placement on the cover image (see the `image-generation` skill — never invent a logo).
- Save the final image into `assets/` and add/update `assets/manifest.json`.
- Design to the channel's format with safe margins; never invent a substitute logo or let copy touch the crop edges.

## Asset authenticity and format QA

Before sharing any brand visual, verify:

1. The brand mark comes from the client's real asset library, not a generated approximation.
2. The image dimensions match the platform format.
3. No headline, caption line, or logo element is cut off.
4. The logo remains legible at mobile size.
5. If the logo treatment feels wrong, recompose around the real asset rather than inventing a new mark.

If the user corrects logo authenticity, format, or crop safety, treat that as a hard constraint for subsequent drafts in this workflow.

## Updating an existing post with a new image

When the user says to attach a visual to an existing draft (for example, "add it to p006"):

1. Update the existing `posts/pNNN.json` in place rather than creating a new post.
2. Keep the current draft status unless the copy/title/campaign also changes.
3. Set the post's `image` field to the new asset path or URL.
4. Set the matching caption too: `media[0].caption` for a single image or video, or the `slides[].caption` of the slide you replaced. A visual swapped in without its caption leaves the review page with nothing to describe.
5. Add or update the asset entry in `assets/manifest.json` and mark `usedInPosts` with the existing post id.
6. Verify both the post JSON and the manifest after the write.

## File workflow

When drafting a new post on disk/API:

> **API-posting technique (reliable).** `$API_TOKEN` / `$API_BASE` / `$CLIENT_SLUG` are NOT expanded inside the `execute_code` sandbox (they live in the terminal shell env). To create posts robustly: write each post payload to a JSON file (`write_file`), then loop in a single `terminal` call using `curl -X POST --data @file.json -H "Authorization: Bearer $API_TOKEN" "$API_BASE/clients/$CLIENT_SLUG/posts"`. A successful create returns HTTP 201 with the new id. Building the curl string with inline JSON via `-d` is fragile (quoting/escaping breaks) — `--data @file` avoids that. The public asset host may not resolve from the tool environment; the internal `$API_BASE` host does, so fetch brand assets via the API_BASE host.
> **DELETE to clear the board:** `DELETE /clients/$CLIENT_SLUG/posts/{id}` returns 200. Only delete pipeline posts (idea/drafting/in_review/approved/scheduled that never actually published). Posts already live (check Postiz `state: PUBLISHED`) — deleting them only loses the dashboard record, it does NOT unpublish from the platform; leave them as history unless the user insists.

1. Create the post via the API (e.g. `POST /clients/$CLIENT_SLUG/posts`). If on disk, create `posts/pNNN.json`.
2. Set `status` to `in_review`.
3. Provide the full payload in the API request, including `copy`, `date`, `title`, `channel`, `campaign`, etc.
4. **Include the visual caption in the same payload.** Carousel: `slides: [{image, caption}, ...]` with a caption on every slide. Single image, story, or video: `media: [{type, url, caption}]`. If the asset does not exist yet, still write the caption — send the `media`/`slides` entry once you have the URL, and never leave the entry captionless.
5. If an image is generated, do **not** try to write directly to `manifest.json` if you don't have permissions. Use the API (e.g. `PATCH /clients/$CLIENT_SLUG/posts/pNNN`) to update the post with the generated image URL if direct file access fails.
6. **After any tool wires an asset for you, re-check the caption.** `image_generate(post_id=)` PATCHes only the post's `image`, and `video_generate(post_id=)` appends a `media[]` entry with no caption. Neither tool writes one, so the caption you wrote in step 4 is what carries the visual — that is the point of writing it first. Only if it is genuinely missing, PATCH it on now, sending `media`/`slides` as whole arrays (a partial array drops the other entries).
7. Provide the draft and the image link directly in the chat for the user to review.

## Approval handoff

- Never self-approve.
- Never auto-publish.
- Leave the post ready for `approve pNNN` / `reject pNNN` / `revise pNNN`.

## Duplicate avoidance

Before drafting, check whether the same angle already exists in `posts/*.json`. If the idea is too close, choose a different hook or pillar rather than cloning the post.

## Ambiguous calendar edits

When the user describes an existing calendar item loosely, search broadly before asking for clarification:

1. `posts/index.json`
2. `posts/*.json` for people, campaign names, title fragments, and alternate spellings
3. the session transcript if the wording sounds like a prior correction or review

If there is still no exact match, return the closest candidates and ask for the post ID or exact text. Do not guess the target file.

## Scheduling to Postiz (traps)

- **RESCHEDULING an already-queued post: there is NO reschedule verb.** The
  `postiz` CLI can only create / list / delete / status. To move a QUEUED post to
  a new time you MUST: (1) `postiz posts:delete <postizJobId>` for each queued
  entry (get the job IDs from `postiz_list_posts`, `state: QUEUE`), (2) PATCH the
  dashboard post's `date`, then (3) re-run `postiz_schedule_post` with the new
  `scheduled_for`. Skipping the delete leaves the OLD queued copy live and **the
  post publishes twice**. Always delete-then-recreate; never schedule on top.
- **Batch-schedule false positive.** Scheduling 3–4 posts in one turn trips a
  `same_tool_failure_warning` loop warning even though every call returned
  `ok: true`. Ignore it when the results show `ok: true` — re-sending duplicates
  the queue.
- **`scheduled_for` is UTC.** Convert every local time the user gives you before
  passing it, and state the local time back to them so they can confirm. The
  client's audience timezone and preferred slots are client-specific — read
  `skills/client/post-drafting-refs/` for them; never assume the server's zone.

## Reviewing videos produced outside video_generate

When asked to review a video someone else made (found in the assets manifest or
folder):

1. `ffprobe` it for duration, resolution, and codecs. Our own generation cap does
   not apply — externally-produced longer pieces are legitimate for boosted or
   commercial placements. Judge them on their goal, not on our cap.
2. Extract frames with `ffmpeg` at several timestamps (e.g. 2s, 10s, 20s, 30s,
   last second) and inspect them with vision.
3. Send the video to the chat as MEDIA so the user sees it inline, then give the
   analysis.
4. Checklist: on-screen text quality and language mix; brand correctness (**the
   logo MUST be the official asset — a generated or invented monogram is a hard
   fail, and critical in paid impressions**); hook strength in the first 3s; CTA
   quality ("link in bio" is weak for paid — platform buttons carry the ad CTA);
   length fit for the placement (45s is long for cold paid, suggest a 15–20s
   cut); and whether the concept supports the client's commercial strategy.

## Support files

- `references/ambiguous-calendar-edits.md` — lookup checklist for vague post/calendar references.

> Client-specific strategy references (if any) live in the client skills folder
> (`skills/client/post-drafting-refs/` on the box). Read them when present.

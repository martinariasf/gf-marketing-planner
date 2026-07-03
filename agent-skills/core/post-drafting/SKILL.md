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

Client-specific channel strategy (positioning vs selling, tools allowlists, editorial themes, narrative voice) lives in the client skills folder — read `skills/client/post-drafting-refs/` when present and treat its rules as hard constraints.

## Boundary-safe reframing

If the user asks for a post that touches a sensitive or blocked topic (per the brief's `boundaries`), do **not** keep the unsafe angle and do **not** argue.

Reframe to a safe adjacent topic when possible:

- **Countries / national identity / geopolitics** → cross-border collaboration, distributed teams, international delivery, handoff design, time-zone coordination.
- **Politics / religion** → avoid; pivot to operational or workflow lessons.
- **Pricing or revenue claims** → avoid; pivot to process, learning, or customer pain.
- **Unshipped or confidential work** → avoid naming it; pivot to a generalized lesson from shipped work.

A good reframing keeps the structure but changes the topic from identity to workflow.

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
4. Add or update the asset entry in `assets/manifest.json` and mark `usedInPosts` with the existing post id.
5. Verify both the post JSON and the manifest after the write.

## File workflow

When drafting a new post on disk/API:

> **API-posting technique (reliable).** `$API_TOKEN` / `$API_BASE` / `$CLIENT_SLUG` are NOT expanded inside the `execute_code` sandbox (they live in the terminal shell env). To create posts robustly: write each post payload to a JSON file (`write_file`), then loop in a single `terminal` call using `curl -X POST --data @file.json -H "Authorization: Bearer $API_TOKEN" "$API_BASE/clients/$CLIENT_SLUG/posts"`. A successful create returns HTTP 201 with the new id. Building the curl string with inline JSON via `-d` is fragile (quoting/escaping breaks) — `--data @file` avoids that. The public asset host may not resolve from the tool environment; the internal `$API_BASE` host does, so fetch brand assets via the API_BASE host.
> **DELETE to clear the board:** `DELETE /clients/$CLIENT_SLUG/posts/{id}` returns 200. Only delete pipeline posts (idea/drafting/in_review/approved/scheduled that never actually published). Posts already live (check Postiz `state: PUBLISHED`) — deleting them only loses the dashboard record, it does NOT unpublish from the platform; leave them as history unless the user insists.

1. Create the post via the API (e.g. `POST /clients/$CLIENT_SLUG/posts`). If on disk, create `posts/pNNN.json`.
2. Set `status` to `in_review`.
3. Provide the full payload in the API request, including `copy`, `date`, `title`, `channel`, `campaign`, etc.
4. If an image is generated, do **not** try to write directly to `manifest.json` if you don't have permissions. Use the API (e.g. `PATCH /clients/$CLIENT_SLUG/posts/pNNN`) to update the post with the generated image URL if direct file access fails.
5. Provide the draft and the image link directly in the chat for the user to review.

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

## Support files

- `references/ambiguous-calendar-edits.md` — lookup checklist for vague post/calendar references.

> Client-specific strategy references (if any) live in the client skills folder
> (`skills/client/post-drafting-refs/` on the box). Read them when present.

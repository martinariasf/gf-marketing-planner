---
name: copywriting
description: Writing or editing post copy, captions, CTAs, and headlines. ALWAYS read the brand voice (toneKeywords, words to use / avoid, boundaries) and the post's pillar BEFORE writing, so the copy is on-voice. Covers where the voice lives and how to write the change back via the API.
tags: [marketing, copy, voice]
---

# Copywriting (on-voice)

For the client `$CLIENT_SLUG` on the Marketing-Planner server.

## STEP 0 — READ THE VOICE FIRST (non-negotiable)

Never write or edit copy before you know the voice. If you have not already read
the brief this conversation, your first action is:

```
GET /clients/$CLIENT_SLUG/brief    →  use data.branding.toneKeywords + tone/voice + boundaries
GET /clients/$CLIENT_SLUG/plan     →  the post's pillar / campaign / monthly focus
```

From the brief take:
- **toneKeywords / tone / voice** — the words and register to write in.
- **words to use / words to avoid** — honor both. No buzzwords if the brand is
  allergic to them.
- **boundaries** — hard limits (sensitive topics, claims to avoid, who handles
  DMs). Check EVERY line of copy against these before you output it.

From the plan take the post's **pillar** and **campaign** so the copy serves the
strategy, not a generic message.

Copy that ignores the voice is wrong even if it reads well — rewrite it to match
without asking permission.

## STEP 1 — Write

- Match the channel: LinkedIn long-form by default; concise + hook-first for
  Instagram/X. One clear CTA.
- Stay brand-consistent and concise. No filler phrases.
- Show the proposed text + platform settings for confirmation BEFORE you
  schedule/publish via Postiz. For in-dashboard edits (copy tweak, title) just
  act.

## STEP 2 — Write the change back via the API (not the JSON file)

- New post:   `POST  /clients/$CLIENT_SLUG/posts`  (date + title required)
- Edit copy:  `PATCH /clients/$CLIENT_SLUG/posts/:id  {"copy": "...", "title": "..."}`
- Send only the fields that change; each must keep the correct type. `hashtags`
  is an array of strings, not a string.

Status changes (approve/reject/schedule) go through `POST /approvals`, never the
file — otherwise they miss the audit log and kanban.

## See also

- `image-generation` — read the BRAND IDENTITY before generating a cover image.
- The platform API write-contract skill (when present on this box) — full API write-contract and post lifecycle.

---
name: copywriting
description: Writing or editing post copy, captions, CTAs, and headlines. ALWAYS read the brand voice (toneKeywords, words to use / avoid, boundaries) and the post's pillar BEFORE writing, so the copy is on-voice. Covers where the voice lives and how to write the change back via the API.
tags: [marketing, copy, voice, staging]
---

# Copywriting (on-voice)

For the client **staging-demo** on the Marketing-Planner staging server.

## STEP 0 — READ THE VOICE FIRST (non-negotiable)

Never write or edit copy before you know the voice. If you have not already read
the brief this conversation, your first action is:

```
GET /clients/staging-demo/brief    →  use data.branding.toneKeywords + tone/voice + boundaries
GET /clients/staging-demo/plan     →  the post's pillar / campaign / monthly focus
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
- Show the proposed text + platform settings in the dashboard for approval.
  Postiz scheduling/publishing is allowed ONLY after the post is approved in the
  `marketing.gfinnov.com` dashboard. Never schedule chat-only copy or an
  unapproved draft directly to Postiz.

## STEP 2 — Write the change back via the API (not the JSON file)

- New post:   `POST  /clients/staging-demo/posts`  (date + title required)
- Edit copy:  `PATCH /clients/staging-demo/posts/:id  {"copy": "...", "title": "..."}`
- Send only the fields that change; each must keep the correct type. `hashtags`
  is an array of strings, not a string.

Status changes (approve/reject/schedule) go through `POST /approvals`, never the
file — otherwise they miss the audit log and kanban. See `marketing-planner-staging`.

## See also

- `image-generation` — read the BRAND IDENTITY before generating a cover image.
- `marketing-planner-staging` — full API write-contract and post lifecycle.

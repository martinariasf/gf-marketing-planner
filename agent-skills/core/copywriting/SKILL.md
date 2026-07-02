---
name: copywriting
description: Writing or editing ANY marketing text — post copy, captions, CTAs, headlines. ALWAYS read the brand voice first and make it VISIBLE in the text. Hard rules against AI-sounding writing (no em dashes, no AI clichés). Covers where the voice lives and how to write changes back via the API.
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

**The voice must be VISIBLE, not just consulted.** After writing, re-read your
draft and point (to yourself) at where the toneKeywords show up. If a neutral
reader could not guess the brand's tone from the text alone, it is off-voice —
rewrite it. Generic marketing prose that "could be anyone" is a failure even if
it is grammatically perfect.

Copy that ignores the voice is wrong even if it reads well — rewrite it to match
without asking permission.

## STEP 1 — Write

- Match the channel: LinkedIn long-form by default; concise + hook-first for
  Instagram/X. One clear CTA.
- Stay brand-consistent and concise. No filler phrases.
- Show the proposed text + platform settings for confirmation BEFORE you
  schedule/publish via Postiz. For in-dashboard edits (copy tweak, title) just
  act.

## STEP 1.5 — Don't sound like an AI (hard rules)

The reader must never suspect the text was machine-written. These are hard
rules, not preferences:

- **NEVER use an em dash (—) or spaced hyphen ( - ) as a rhetorical pause.**
  This is the single biggest AI tell. Use a period, a comma, or a rewrite.
- No "it's not X, it's Y" / "not just X — Y" contrast constructions.
- Banned vocabulary: delve, elevate, unleash, seamless, game-changer, unlock,
  empower, revolutionize, synergy, "in today's fast-paced world", "look no further".
- No rule-of-three padding ("faster, smarter, better") unless the brand voice
  explicitly uses it.
- Vary sentence length. A human writes short ones. Then sometimes a longer one
  that carries the actual point. Uniform medium-length sentences read as AI.
- No summary sentence that restates what the copy just said.
- Emojis, hashtags, exclamation marks: only as the brand voice dictates.

Before output, scan the draft for every rule above. One violation = rewrite
that line.

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

---
name: copywriting
description: Writing or editing ANY marketing text — post copy, captions, CTAs, headlines. ALWAYS read the brand voice AND the client's uploaded source material first, and make the voice VISIBLE in the text. Hard rules against AI-sounding writing (no em dashes, no AI clichés) plus the craft bar the copy must clear to be worth posting. Every post also needs a one-line visual caption describing what the viewer will see. Covers where the voice lives, where the client's own facts live, and how to write changes back via the API.
tags: [marketing, copy, voice]
---

# Copywriting (on-voice)

For the client `$CLIENT_SLUG` on the Marketing-Planner server.

## STEP 0 — READ THE VOICE AND THE SOURCES FIRST (non-negotiable)

Never write or edit copy before you know the voice and the client's own facts.
If you have not already read these this conversation, your first action is:

```
GET /clients/$CLIENT_SLUG/brief    →  use data.branding.toneKeywords + tone/voice + boundaries
GET /clients/$CLIENT_SLUG/plan     →  the post's pillar / campaign / monthly focus
GET /clients/$CLIENT_SLUG/information-sources?approved=true
                                   →  documents the client uploaded for you to use
```

From the brief take:
- **toneKeywords / tone / voice** — the words and register to write in.
- **words to use / words to avoid** — honor both. No buzzwords if the brand is
  allergic to them.
- **boundaries** — hard limits (sensitive topics, claims to avoid, who handles
  DMs). Check EVERY line of copy against these before you output it.

From the plan take the post's **pillar** and **campaign** so the copy serves the
strategy, not a generic message.

**From the information sources take the facts.** This is the client's own
material — brand guidelines, product details, a transcript, a press release —
uploaded through the dashboard's Assets tab specifically so you would use it.
Each item carries the full document text in `summary`, a name in `title`, and
instructions for its use in `prompt`.

- These facts **outrank your own knowledge**. Where a source contradicts what
  you assumed about the client, the source is right and you are wrong.
- Quote and reuse the source's actual wording for names, numbers, product
  claims and dates. Do not paraphrase a specific from memory.
- An empty list is a legitimate answer — write from the brief. A list you never
  fetched is not. Never tell a user a document does not exist until you have
  called this endpoint.

One call per conversation is enough; reuse the result rather than re-fetching.

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
  empower, revolutionize, synergy, leverage, disrupt, "in today's fast-paced world",
  "look no further".
- No rule-of-three padding ("faster, smarter, better") unless the brand voice
  explicitly uses it.
- Vary sentence length. A human writes short ones. Then sometimes a longer one
  that carries the actual point. Uniform medium-length sentences read as AI.
- No summary sentence that restates what the copy just said.
- Emojis, hashtags, exclamation marks: only as the brand voice dictates.

Before output, scan the draft for every rule above. One violation = rewrite
that line.

These rules are the canonical anti-AI list for marketing copy — this skill owns
them. Do not also run a separate humanizing pass on a post you drafted here; it
costs tokens and drifts the text off the brief. The `humanizer` skill and its
`references/ai-patterns.md` are the deep reference for long-form text or when a
human explicitly asks you to humanize something.

## STEP 1.6 — The craft bar (what GOOD looks like)

STEP 1.5 only tells you what to avoid. Copy can pass every rule above and still
be forgettable, and that is the more common failure. This step is the bar it has
to clear.

**Stance.** You are not producing acceptable copy. You are producing the one post
in the feed someone stops scrolling for. Safe, timid and measured is a failure
even when it is on-voice and clean. Take a position and commit to it; hedged copy
reads as having nothing to say.

### The refuse list (marketing defaults)

These are the category's reflexes, not bans. The brief's own words can earn any
of them. But reaching for one when nothing forced you there means you were not
deciding — rewrite the line instead of softening it.

- The listicle scaffold: "3 things we learned", "5 ways to…", "Here are the steps".
- The rhetorical-question hook: "Ever wondered why…?", "What if I told you…?",
  "Sound familiar?".
- The milestone humble-brag: an achievement post whose only content is the
  achievement plus gratitude.
- The pivot line: "Here's the thing.", "But here's what nobody tells you.",
  "Let that sink in."
- A one-word opener on its own line for drama ("Wild.", "This.").
- Borrowed authority with no source: "Studies show", "Everyone in the industry
  knows", "The best teams all…".
- A CTA that begs for engagement instead of asking for an action: "Thoughts?",
  "Agree?", "Drop a comment below".
- Opening with the company name or "We're excited to announce". The news is the
  hook, not the announcement of the news.

### The skeleton test (run this before output)

Strip every adjective, every transition, and every line that only sets up another
line. Read what is left.

- If a specific, checkable claim survives — a number, a name, a workflow, a thing
  that actually happened — the post has a spine. Ship it.
- If nothing survives, the post was texture. Do NOT add the adjectives back. Go
  get the concrete detail from the brief, the plan, or by asking the user one
  question, and rebuild around it.

### One pass, then stop

Draft fully. Read it once against STEP 0, STEP 1.5 and this step together — one
batched pass, not a rule-by-rule loop. Fix everything that pass surfaces in a
single rewrite. Then stop and show the user. Do not re-polish copy that already
clears the bar; open-ended self-editing burns tokens and drifts the voice.

## STEP 1.7 — Write the visual caption (required, every post)

Copy is not finished until the visual is described in words. Every post you write
carries a one-line caption saying what the viewer will SEE, so a client can sign
off the plan before any image or video is produced. A post with no caption is an
incomplete draft — go back and add it before you show anything.

Where it goes depends on the format:

| Post format | Field | How many |
|---|---|---|
| carousel | `slides[].caption` | one per slide, cover included |
| single image / story | `media[].caption` | one, on the image entry |
| video / reel | `media[].caption` | one, on the video entry |

Both are plain strings. Do not invent a different key: the API is strict and a
typo'd field 422s the whole write.

**Describe the picture, not the copy.** The caption names the subject, the shot,
and what is on screen. It is a design brief for the visual, not a second
headline, and it never restates the post text.

- Good: "Split screen: the old six-tab spreadsheet on the left, the single
  planner view on the right, brand green line down the middle."
- Good: "Close crop of the shop-floor terminal mid-scan, hands in frame, logo
  bottom right."
- Bad: "An image about saving time with automation." (nothing checkable)
- Bad: "Stop losing hours to spreadsheets." (that is the copy, not the visual)

One sentence, literal, concrete. Mood words on their own ("modern", "clean",
"professional") do not count as a description unless a real subject carries them.
On a carousel each slide caption must differ; "slide 3" or a repeat of the cover
caption is not a caption.

## STEP 2 — Write the change back via the API (not the JSON file)

- New post:   `POST  /clients/$CLIENT_SLUG/posts`  (date + title required)
- Edit copy:  `PATCH /clients/$CLIENT_SLUG/posts/:id  {"copy": "...", "title": "..."}`
- Captions:   `PATCH ... {"slides": [{"image": "...", "caption": "..."}, ...]}`
  for a carousel, or `{"media": [{"type": "image", "url": "...", "caption": "..."}]}`
  otherwise. `slides` and `media` PATCH as whole arrays — send every entry, not
  just the one you changed, or the others are dropped.
- Send only the fields that change; each must keep the correct type. `hashtags`
  is an array of strings, not a string.

Status changes (approve/reject/schedule) go through `POST /approvals`, never the
file — otherwise they miss the audit log and kanban.

## See also

- `image-generation` — read the BRAND IDENTITY before generating a cover image.
  Its STEP 4 is the visual counterpart of STEP 1.6: the same stance, refuse list,
  and skeleton test applied to the picture instead of the words. A sharp caption
  on a stock-cliché image still reads as AI slop.
- `humanizer` — deep anti-AI reference for long-form or non-post text. Do NOT run
  it as a second pass over copy drafted here (see STEP 1.5).
- The platform API write-contract skill (when present on this box) — full API write-contract and post lifecycle.

---
name: gf-reel-text-overlay
description: Produce GF Instagram reels/video posts with correct on-screen text. The seedance video model MISSPELLS AI-generated text (e.g. "headlanes", "Relibility"), so generate a clean text-free branded background clip, then burn in real sharp text with ffmpeg drawtext. Vertical 9:16, charcoal brand bg, keyword in green.
---

# GF reel — clean background + real text overlay

## Problem
`video_generate` (bytedance/seedance) renders any on-screen copy as a GRAPHIC and frequently MISSPELLS it — real burns seen: "head**lanes**" for headlines, "**Relibility**" for reliability. A clip with a spelling error is NOT publishable, especially for AI-education content. Do NOT keep regenerating hoping the spelling comes out right, and do NOT approve a text-in-video clip without checking every text frame.

## Solution: generate a text-FREE branded background, then overlay real text with ffmpeg
This is the video sibling of `gf-carousel-slide-logo-embed` (same principle: never let the generative model render the text/logo; composite it ourselves).

### Brand style (matches the IG carousel/cover system)
- Vertical 9:16 (720x1280 from seedance). Solid charcoal #1a1a1a bg. Only accent colors: bright green #22c55e and white. Bold Inter-style sans (use `/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf` on this host). Minimal, mobile-legible, generous spacing, ONE keyword per line group in green.

### Steps
1. **Generate the background clip with NO TEXT.** In the `video_generate` prompt say explicitly: "NO TEXT ANYWHERE — no words, letters, numbers, captions or logos." Ask for calm branded motion (thin green accent line that draws across, soft green/white particles, faint grid/gradient glow), lots of negative space so text sits on top. `aspect_ratio=portrait`, `duration` ~6, `resolution=720p`, pass `post_id` to auto-link.
2. **Vision-check the raw clip** on 3–4 frames: confirm zero text/logo, charcoal bg, green accents, room for text. (`ffmpeg -ss <t> -i clip.mp4 -frames:v 1 frame.png` then vision_analyze.)
3. **Burn in real text with ffmpeg drawtext** (see `scripts/reel_text_overlay.sh`). Split the message into 2–3 timed segments, each with fade-in/out via an `alpha` expression, keyword line in green #22c55e at a larger size. `-an` (no audio), `-crf 18 -pix_fmt yuv420p`.
4. **Vision-check EACH text segment frame** — read the exact text back, confirm spelling perfect, centered, legible on mobile.
5. **Cut the cover** from the final closing frame (the keyword payoff, e.g. "reliability") with `ffmpeg -ss <end> -frames:v 1`.
6. **Wire into the post**: append final .mp4 + cover .png to `manifest.json`; PATCH the post with `image` = cover and `media` = a SINGLE video entry (the final clip). See "media[] hygiene" below.

### Extending / re-timing an existing reel (e.g. "make it 10 seconds")
Do NOT time-stretch the finished clip or slow the existing overlay — that looks sluggish and desyncs the fades. Instead:
1. Re-generate a NEW text-free background at the target `duration` (same brand prompt, add "very slow relaxed pacing").
2. Re-time the overlay: add MORE message beats to fill the extra time (a 10s clip comfortably holds 4 beats of ~2.3s each vs. 3 beats in 6s). A natural 4th beat is a CTA/payoff restatement (e.g. "Not what it can do once. What it does **every time.**").
3. Space segment envelopes evenly across the new length; keep ~0.4s fade in/out and a ~1.9s hold per beat so each stays fully readable.
4. Vision-check every new beat frame, cut a fresh cover from the closing frame, and re-do media[] hygiene (single final clip).

### Support files
- `scripts/reel_text_overlay.sh` — parametrized ffmpeg drawtext overlay: edit the IN/OUT, per-segment text, timings, and alpha fade expressions. Copy + modify per post. Contains 3-beat (6s) timings; for a 10s/4-beat version follow the "Extending" section above.

### media[] hygiene (critical — from memory)
- `media[]` ACCUMULATES every video version you attach. After finishing, PATCH `media` to a list with ONLY the final clip so old misspelled versions don't linger in the kanban.
- `format` must be `"reel"` for video posts. `image` (the cover) is a SEPARATE top-level field from `media[]` — always set it to a real frame you cut with ffmpeg.
- POST /approvals only logs; to change status use `PATCH /posts/{id} {"status":...}`.

### Pitfalls
- Never trust generated on-screen text — always vision-check the exact spelling frame by frame.
- Don't hardcode a font that isn't installed; `fc-list | grep -i bold` first. LiberationSans-Bold is the reliable Inter/Arial stand-in here.
- Keep text on high-contrast negative space; avoid placing a line exactly over the bright green accent line (mid-screen) unless it stays legible.
- Deliver the finished clip in chat for Pilar to review before scheduling; ask whether to approve or adjust text/pacing.

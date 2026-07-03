---
name: gf-carousel-slide-logo-embed
description: Build GF Instagram carousel inner slides with the REAL official logo (the image model keeps inventing a fake one). Generate the slide text/layout with image_generate, then composite the official logo PNG/JPG on top with PIL, then wire it into the post.
---

# GF carousel slide — guaranteed real logo

## Problem
`image_generate` (gemini flash image) ignores the logo reference file and stamps a FAKE logo (all-white monogram or a generic OpenAI-style swirl labeled "logo"). This has burned us 3+ times. Do NOT keep retrying the prompt.

## Solution: generate text, then embed the official logo with PIL

### Brand facts
- Official dark-bg logo file: `/opt/marketing-planner/client/assets/gf_logo_official_dark.jpg` (G green + F white monogram, "INNOVATIVE" thin white, "SOLUTIONS" bold white, green wifi icon). Backup: `/tmp/jul/gf_logo_dark_bg.jpg`.
- Slide style: charcoal #1a1a1a bg, bold Inter-ish white headline with ONE keyword in green #22c55e, slate #94a3b8 subline, thin green vertical accent bar, footer slate divider + green "→ Swipe" (omit Swipe on final slide), vertical 4:5.

### Steps
1. **Generate the slide WITHOUT a logo.** In the image_generate prompt, ask for empty clean space top-left for a logo, and do NOT use brand words ("GF", "logo", "brand") — those trigger the fake logo. Pass the matching cover as a reference_images entry for style only. Use channel="instagram" so it's vertical.
2. **Composite the official logo with PIL** (via execute_code):
   - Sample slide bg color near top: `bg = slide.load()[W//2, int(H*0.20)]`.
   - Open the logo, recolor its near-charcoal bg pixels (r,g,b all <55) to `bg` so no box shows.
   - Resize logo to ~26% of slide width, paste at (~6% W, ~4.5% H). Cover any stray fake mark with a `bg` rectangle first.
   - Save final PNG.
3. **Verify** with vision_analyze: real logo present, no visible box, text spelling correct, vertical.
4. **Wire into the post**: image_generate(post_id, slide_index) uploads the model's (fake-logo) version, so instead copy the FINAL composited file into assets, append manifest, and PATCH the post's slides[] / image yourself for that slide index. (Or re-run the embed on the file the tool produced.)

### Support files
- `scripts/embed_logo.py` — re-runnable PIL compositor. `python embed_logo.py <in.png> <out.png> [logo.jpg]`. Recolors logo bg to match slide, pastes top-left at ~26% width. Use this instead of hand-typing the embed each time.
- `references/post-wiring-api.md` — Marketing Platform API quirks (GET /posts/{id} returns nulls — read via the /posts list instead; PATCH works) and the full manifest+PATCH wiring recipe.

### Delivery workflow (Pilar's preference)
- Share ONE slide as a preview first (e.g. slide 2 of carousel 1) to validate the inner-slide style against the cover. Get the green light.
- Once approved, BATCH-produce the rest and upload straight to the dashboard/kanban — do NOT paste every slide into chat. Pilar said "no es necesario que lo compartas acá, lo puedes subir directo al kanban." Just report what was completed and where.
- Efficient batch pattern: fire all the `image_generate` calls for a carousel in one go, then loop the embed script over all outputs, then vision-check each, then one PATCH per post.

### Multi-item carousel nuances
- For "N things" listicle carousels, add a small green number marker top-right per slide ("1", "2", ...). Ask for it in the prompt; the model places it fine (it's text, not a logo).
- Final slide: omit "→ Swipe" and use a CTA-appropriate green glyph instead — bookmark/save glyph for "save this", comment/reply glyph for "which will you try first?".

### Pitfalls
- Never let the model draw the logo. Never describe it in words.
- Don't regenerate covers blindly: a prior session's cover (slide 1) may already have the REAL logo. Vision-check it first and reuse if correct.
- Keep the embed subtle: match bg, ~26% width, top-left.
- The image_generate tool reports aspect "landscape"/size 1536x1024 in its result even when the actual PNG is vertical 4:5 — verify the real file with vision, don't trust the result string.

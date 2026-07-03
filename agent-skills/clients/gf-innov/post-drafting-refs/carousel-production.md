# GF Instagram carousel (multi-slide) production

How to produce a full GF Instagram carousel so the inner slides match the cover exactly. Builds on the dark-charcoal design system in `gf-instagram-strategy.md`.

## Workflow order (avoid rework)

1. **Check for existing covers FIRST.** Carousel cover images (slide 1) are often already generated in a prior session. Before regenerating anything, read `assets/manifest.json` and match `usedInPosts` to the carousel post ids. If a cover exists (e.g. `c-...slide1...png`), reuse it as slide 1 — do NOT regenerate it. Pilar called this out: "ayer trabajamos con todas las portadas."
2. **Capture the cover's style before building interiors.** vision-analyze the existing cover and note: background, logo placement, headline weight, accent treatment, footer/swipe indicator. Then pass the cover file itself as `reference_images` to every inner-slide generation so the look is reproduced, not reinvented.
3. **Preview ONE inner slide, get approval, then batch.** Generate slide 2 only, send it as a MEDIA attachment, and wait for the user's green light before generating the remaining ~13 slides across the set. This prevents redoing a whole carousel if the interior look is off. Pilar explicitly works this way.
4. Generate the rest of the slides for that carousel, then move to the next.

## Inner-slide anatomy (matches the proven cover system)

- Vertical 4:5, 1080×1350, solid charcoal `#1a1a1a`.
- White GF "INNOVATIVE SOLUTIONS" logo (green wifi icon) small, top-left — the WHITE+green variant (dark background rule).
- Thin bright-green `#22c55e` accent line under the logo.
- Large bold Inter-style white headline with exactly **ONE** keyword in green `#22c55e`.
- One short slate-gray `#94a3b8` subline below the headline (optional).
- Footer: thin slate divider + small green "→ Swipe" indicator bottom-right on every slide EXCEPT the last; the last slide carries the takeaway/CTA instead of "Swipe".
- Minimal text, generous negative space, mobile-legible.

## Slide plan per carousel
Slide 1 = hook (the existing cover). Middle slides = one idea each, drawn from the post `copy`. Last slide = the post's CTA / takeaway. Typical length 5–6 slides.

## Pitfall: the generator's returned `aspect_ratio` / `size` metadata is unreliable
`image_generate` may report `aspect_ratio: landscape` and `size: 1536x1024` in its JSON response even when the actual rendered file is a correct vertical 4:5 1080×1350 slide. **Do not trust the metadata fields — vision-check the real pixels** to confirm orientation, that the logo is the correct variant and not cropped, spelling is right, and the green keyword is the intended word. Verify before sending to Pilar.

## Format reassignment
The user may convert one planned carousel into a different format (e.g. "the 4th one design it as a video"). When that happens, drop that post from the carousel batch and produce it in the requested format (vertical 9:16 for video) instead — don't generate carousel slides for it.

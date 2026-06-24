---
name: image-generation
description: Generating or changing images for posts and assets. ALWAYS read the brand identity (colors, typography, logos, tone) AND the Visual Guidelines from the brief BEFORE generating, so the image is on-brand and cohesive across posts. Covers per-channel format (Instagram vertical 4:5, LinkedIn horizontal), fidelity, post_id auto-link, never inventing logos, and using the real logo as a reference image.
tags: [marketing, images, branding, staging]
---

# Image Generation (on-brand)

For the client **staging-demo** on the Marketing-Planner staging server.

## STEP 0 — READ THE BRAND IDENTITY + VISUAL GUIDELINES FIRST (non-negotiable)

Never generate an image before you know the brand. If you have not already read
the brief this conversation, your first action is:

```
GET /clients/staging-demo/brief    →  use data.branding  +  the Visual Guidelines
```

From `data.branding` take:
- **colors** (e.g. Primary Green `#22c55e`, Teal `#14b8a6`, Dark `#1a1a1a`)
- **typography** (headingFont / bodyFont — usually `Inter`)
- **toneKeywords** (the visual mood: precise, technical, warm, …)
- **logos** (official logo URLs / asset filenames)

**Visual Guidelines (GF-34) — ALWAYS read and apply.** The client's
Company-Context exposes a **"Visual Guidelines"** field. The dashboard writes it
at the brief **top level**, so from `GET /clients/<slug>/brief` read
`data.visualGuidelines` (fall back to `data.branding.visualGuidelines` only on
older clients). It describes the consistent
layout, element placement, color usage, and fonts that every image must follow.
Read it on the first image task of the conversation and apply it to EVERY
generation so the whole feed is cohesive (cross-post cohesion): same layout
grid, same logo placement, same palette, same fonts. If the field is empty,
fall back to `data.branding` and keep your own choices consistent across the
batch. An image that ignores the Visual Guidelines is wrong even if it looks
nice — fix it without asking.

Put the brand **colors, fonts, layout and Visual-Guidelines style into the image
prompt**. An image that ignores the brand palette is wrong even if it looks nice
— fix it without asking.

## STEP 0.5 — PICK THE FORMAT FROM THE CHANNEL (GF-33)

The **target channel decides the format**, never a global default:
- **Instagram → VERTICAL 4:5, 1080x1350.** Pass `channel="instagram"` (or
  `aspect_ratio="portrait_4_5"`). Instagram feed images are vertical.
- **LinkedIn → horizontal.** Pass `channel="linkedin"` (landscape).
- **X / Facebook → horizontal** (`channel="x"` / `channel="facebook"`).

Always pass `channel` (or a `post_id` whose channel is known — the tool reads it
and sizes automatically). Do NOT hard-code one shape for everything.

## STEP 1 — Generate

Default model is **Nano Banana 2** via `fidelity="fast"`. Before every image
generation, ask one short question: whether the user wants **fast / Nano Banana
2** or **high fidelity** (`fidelity="high"`, premium, slower). Then pass the
selected fidelity explicitly to `image_generate`.

**Changing/setting the cover of an EXISTING post = ONE call.** Pass `post_id`
(the tool reads that post's channel and sizes the image accordingly):

```
image_generate(prompt="<scene grounded in the post copy + brand + Visual Guidelines>",
               fidelity="<fast-or-high-selected-by-user>",
               post_id="p016")
```

For a stand-alone image, pass the **channel** so the format is right (GF-33):

```
image_generate(prompt="<scene + brand + Visual Guidelines>",
               channel="instagram",   # → vertical 4:5 1080x1350
               fidelity="fast")
```

The `image_gen_openrouter` plugin then copies the file into the client assets
dir, appends the manifest entry, PATCHes the post's `image`, and confirms. You
MUST NOT copy the file, edit the manifest, or PATCH the post yourself — passing
`post_id` already did it. Just confirm to the user (in their language), citing
the url. Only fall back to manual wiring if the result shows
`post_link.linked: false` or an `error`.

For a **reserve / stand-alone** image (no target post), omit `post_id` — the
plugin publishes it to a public URL and adds a reserve manifest entry.

## STEP 2 — NEVER invent a logo / isotipo (GF-28)

This is a recurring failure: the model fabricates a fake GF logo/isotipo when it
is only described. **Hard rule: never invent, redraw, or guess a logo.**

- If the image must carry the real official logo (or a specific product), pass
  the **actual file** via `reference_images` — do NOT describe the logo in
  words, do NOT do a Pillow overlay:

  ```
  image_generate(prompt="<scene>, leave clean space bottom-right for the brand logo",
                 reference_images=["logo_official.png"],   # asset filename, URL, or path
                 channel="instagram", post_id="p016")
  ```

  Find the logo via `data.branding.logos` (`GET /brief`) or the client assets
  folder.

- **If NO official logo file is available** (none in `branding.logos`, none
  given): do NOT generate a fabricated logo. Either
  1. **ask the user** for the official logo file, or
  2. generate the image **WITHOUT the logo** (e.g. "leave clean space
     bottom-right for the brand logo" so it can be added later).

  The `image_generate` tool enforces this: a prompt mentioning a logo/isotipo
  with no resolvable reference returns `error_type:"logo_reference_required"`.
  When you see it, follow option 1 or 2 above — never retry with a described
  logo.

- Omit `reference_images` for ordinary illustrations that do not need the logo.

## STEP 3 — Text INSIDE the image (GF-32, Instagram especially)

When the image carries on-canvas text:
- **Instagram: keep text MINIMAL** — only the highlight / core info (a short
  hook, one stat, or the CTA). Do not paste the whole caption onto the image;
  the body copy lives in the post text, not baked into the picture.
- **Legible minimum size:** on the 1080x1350 canvas, the smallest text must be
  at least ~**8–9 pt equivalent** (roughly **38–45 px** tall on 1080x1350).
  Nothing smaller — tiny text is unreadable on a phone. Prefer fewer, larger
  words over many small ones.
- State this in the prompt, e.g. "minimal on-image text: one short headline only,
  large legible sans-serif, no small print, no paragraphs."

## Delivery

Send the generated image **once** (no preview + URL duplication). Confirm the
change in the user's language, citing the public url.

## See also

- `video-generation` - create Seedance 2.0 MP4 assets with `video_generate`.

- `copywriting` — read the VOICE before writing the post text.
- `marketing-planner-staging` — full API write-contract, assets, carousels.

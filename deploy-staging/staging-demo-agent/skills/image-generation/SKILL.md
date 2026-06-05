---
name: image-generation
description: Generating or changing images for posts and assets. ALWAYS read the brand identity (colors, typography, logos, tone) from the brief BEFORE generating, so the image is on-brand. Covers fidelity, post_id auto-link, and using the real logo as a reference image.
tags: [marketing, images, branding, staging]
---

# Image Generation (on-brand)

For the client **staging-demo** on the Marketing-Planner staging server.

## STEP 0 — READ THE BRAND IDENTITY FIRST (non-negotiable)

Never generate an image before you know the brand. If you have not already read
the brief this conversation, your first action is:

```
GET /clients/staging-demo/brief    →  use data.branding
```

From `data.branding` take:
- **colors** (e.g. Primary Green `#22c55e`, Teal `#14b8a6`, Dark `#1a1a1a`)
- **typography** (headingFont / bodyFont — usually `Inter`)
- **toneKeywords** (the visual mood: precise, technical, warm, …)
- **logos** (official logo URLs / asset filenames)

Put the brand **colors and style into the image prompt**. An image that ignores
the brand palette is wrong even if it looks nice — fix it without asking.

## STEP 1 — Generate

Default model is **Nano Banana 2** via `fidelity="fast"`. Before every image
generation, ask one short question: whether the user wants **fast / Nano Banana
2** or **high fidelity** (`fidelity="high"`, premium, slower). Then pass the
selected fidelity explicitly to `image_generate`.

**Changing/setting the cover of an EXISTING post = ONE call.** Pass `post_id`:

```
image_generate(prompt="<scene grounded in the post copy + brand colors/style>",
               fidelity="<fast-or-high-selected-by-user>",
               post_id="p016")
```

The `image_gen_openrouter` plugin then copies the file into the client assets
dir, appends the manifest entry, PATCHes the post's `image`, and confirms. You
MUST NOT copy the file, edit the manifest, or PATCH the post yourself — passing
`post_id` already did it. Just confirm to the user (in their language), citing
the url. Only fall back to manual wiring if the result shows
`post_link.linked: false` or an `error`.

For a **reserve / stand-alone** image (no target post), omit `post_id` — the
plugin publishes it to a public URL and adds a reserve manifest entry.

## STEP 2 — Exact logo / product = REFERENCE IMAGE, never a description

The model invents a WRONG logo when it is only described. When the image must
carry the real official logo (or a specific product), pass the actual file via
`reference_images` — do NOT describe the logo in words, do NOT do a Pillow
overlay:

```
image_generate(prompt="<scene>, leave clean space bottom-right for the brand logo",
               reference_images=["logo_official.png"],   # asset filename, URL, or path
               post_id="p016")
```

Find the logo via `data.branding.logos` (`GET /brief`) or the client assets
folder. Omit `reference_images` for ordinary illustrations.

## Delivery

Send the generated image **once** (no preview + URL duplication). Confirm the
change in the user's language, citing the public url.

## See also

- `copywriting` — read the VOICE before writing the post text.
- `marketing-planner-staging` — full API write-contract, assets, carousels.

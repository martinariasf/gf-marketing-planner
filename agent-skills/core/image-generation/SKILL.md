---
name: image-generation
description: Generating or changing images for posts and assets. ALWAYS read the brand identity (colors, typography, logos, tone) AND the Visual Guidelines from the brief BEFORE generating, so the image is on-brand and cohesive across posts. Covers per-channel format (Instagram vertical 4:5, LinkedIn horizontal), fidelity, post_id auto-link, generate vs. edit (image_generate edit=true for a client's own photo), never inventing logos or headline text, stamping the real logo and exact copy with image_compose, and the visual craft bar that keeps the result from looking AI-made.
tags: [marketing, images, branding]
---

# Image Generation (on-brand)

For the client `$CLIENT_SLUG` on the Marketing-Planner server.

## STEP 0 — READ THE BRAND IDENTITY + VISUAL GUIDELINES FIRST (non-negotiable)

Never generate an image before you know the brand. If you have not already read
the brief this conversation, your first action is:

```
GET /clients/$CLIENT_SLUG/brief    →  use data.branding  +  the Visual Guidelines
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

## STEP 0.5 — PICK THE FORMAT FROM THE CHANNEL (GF-33) — AND FROM THE POST FORMAT WHEN IT'S A STORY (GF-69)

The **target channel decides the format**, never a global default:
- **Instagram → VERTICAL 4:5, 1080x1350.** Pass `channel="instagram"` (or
  `aspect_ratio="portrait_4_5"`). Instagram feed images are vertical.
- **LinkedIn → horizontal.** Pass `channel="linkedin"` (landscape).
- **X / Facebook → horizontal** (`channel="x"` / `channel="facebook"`).

Always pass `channel` (or a `post_id` whose channel is known — the tool reads it
and sizes automatically). Do NOT hard-code one shape for everything.

**This is still how you pick the generation size.** `image_compose`'s `canvas`
parameter (GF-143, see the reference below) is a separate thing — it reshapes
an image that already exists (a client photo, or an image generated at a
different shape). It is not a second way to choose the shape here; do not pass
`canvas` on a compose call just because you already picked a channel in this
step.

**Exception — an Instagram STORY is a different shape (GF-69).** A Story is
**full-screen 9:16, 1080x1920** — NOT the 4:5 1080x1350 feed image. The POST
FORMAT overrides the channel default whenever the post is a story:
- If `post_id` points to a post whose format is `"story"`, the tool detects
  that automatically and renders 9:16 — no extra argument needed.
- Generating a story stand-alone (no post yet)? Pass `aspect_ratio="story"`
  explicitly; it wins even if you also pass `channel="instagram"`.
- Every other Instagram case (feed single image, carousel slide) still follows
  the GF-33 channel rule above — this exception is story-only and leaves
  feed/LinkedIn/X/Facebook sizing untouched.

## STEP 1 — Generate or Edit

Two layers do the work now. **Layer 1, `image_generate`, is AI and costs an API
call** — use it to create pixels (a new scene, or a reinterpreted background).
**Layer 2, `image_compose`, is local Pillow and free** — use it to stamp
pixel-exact elements (the real logo, exact headline text) onto an image that
already exists. See STEP 2 and the "Stamping" section below for the compose
side; this step covers `image_generate`'s two modes.

### Generate vs. edit — which mode

- **Nothing exists yet** (a fresh scene, no source photo to preserve) → plain
  generate, `edit` omitted or `false`. This is the default and covers most
  requests.
- **The client sent a photo and wants it changed** (e.g. a product photo from
  Telegram, "swap the background", "make this look like golden hour") → pass
  the photo in `reference_images` AND set `edit=true`. In edit mode the model
  preserves the subject exactly — identity, shape, proportions, material,
  colors — and changes only what the prompt asks, typically the background.

  ```
  image_generate(prompt="replace the background with a bright modern kitchen, keep the product untouched",
                 reference_images=["client_photo.jpg"],
                 edit=true,
                 channel="instagram")
  ```

  **Without `edit=true`, references are treated as brand assets to composite
  into a new scene** — that fights an edit request and the client's photo will
  not be preserved. Do not omit `edit=true` when the intent is "change this
  photo," and do not set it when the intent is "generate something new using
  this asset as a brand reference."

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
MUST NOT copy the file, edit the manifest, or PATCH the **asset wiring** —
`image`, `slides[].image`, `media[].url`, `thumbnail`, `assetId` — yourself;
passing `post_id` already did it. Just confirm to the user (in their language),
citing the url. Only fall back to manual wiring if the result shows
`post_link.linked: false` or an `error`.

**The one exception is the caption.** The plugin never writes
`slides[].caption` or `media[].caption`, so the prohibition above does not cover
them: you MUST make sure a caption is on the post. Normally it is already there,
because `post-drafting` writes the visual caption at draft time and you generate
*against* it — the caption is the design brief for this image, so read it before
you write the prompt. Only if the post arrives with no caption do you PATCH one
on after generating, describing what the finished image actually shows. When you
do, send `slides` / `media` as WHOLE arrays including every existing entry and
its current `image`/`url`; a partial array drops the other entries.

For a **reserve / stand-alone** image (no target post), omit `post_id` — the
plugin publishes it to a public URL and adds a reserve manifest entry.

## STEP 2 — NEVER invent a logo / isotipo (GF-28) — stamp it, don't draw it

This is a recurring failure: a generative model fabricates a fake logo/isotipo,
or misspells headline text, when it is only described. **Hard rule: a
generative model never draws a logo and never renders headline text.** Scenes
and backgrounds may be AI-reinterpreted; brand marks and exact copy are always
stamped afterward with `image_compose` (Layer 2, local Pillow, free — see
"Stamping the logo and text" below). This mirrors the video doctrine already in
this codebase: `generate-media/references/polished-branded-video.md:9` —
"Never let the generative video model render text or a logo."

- **Never describe the logo in the prompt.** Generate a clean plate with space
  reserved for it, then stamp the real logo on top:

  ```
  image_generate(prompt="<scene>, leave clean space bottom-right for the brand logo",
                 channel="instagram", post_id="p016")

  image_compose(base_image="<the file image_generate just produced>",
                include_logo=true,          # pulls the client's real branding.logos
                logo_anchor="bottom-right",
                logo_margin="5%")
  ```

  `image_generate` no longer auto-injects the client's logo into
  `reference_images` — that responsibility moved entirely to `image_compose`.
  `include_logo=true` (the default) resolves the real file from
  `data.branding.logos` itself; you do not need to look it up or pass it
  yourself unless you want a non-default logo file (`logo=<path>`).

- **If NO official logo file is available** (none in `branding.logos`, none
  given): do NOT generate a fabricated logo. Either
  1. **ask the user** for the official logo file, or
  2. generate the image **WITHOUT calling `image_compose`** (e.g. leave the
     clean space so it can be stamped later once the file exists).

- `reference_images` on `image_generate` is now for brand-asset compositing
  into a new scene (a product shot, packaging, a physical object) — not for
  logos, and not for edits (see STEP 1's edit mode).

## STEP 3 — Text INSIDE the image (GF-32, Instagram especially) — stamp it, don't draw it

Same doctrine as the logo: **never describe exact headline copy in the
`image_generate` prompt.** The model cannot spell reliably (see the "Garbled
text" mechanical check in STEP 4) and it will misspell or melt the words. When
the wording matters exactly, generate a text-free plate and stamp the copy with
`image_compose`:

```
image_compose(base_image="<the plate>",
              text="Your headline here",
              text_anchor="bottom",
              text_size=64,
              text_color="white",
              text_use_heading_font=true,   # resolves branding.typography.headingFont
              text_outline=4)               # px stroke width, 0 = none
```

When on-canvas text IS appropriate:
- **Instagram: keep text MINIMAL** — only the highlight / core info (a short
  hook, one stat, or the CTA). Do not paste the whole caption onto the image;
  the body copy lives in the post text, not baked into the picture.
- **Legible minimum size:** on the 1080x1350 canvas, the smallest text must be
  at least ~**8–9 pt equivalent** (roughly **38–45 px** tall on 1080x1350).
  Nothing smaller — tiny text is unreadable on a phone. Prefer fewer, larger
  words over many small ones. `image_compose`'s default `text_size=64` clears
  this floor; do not shrink it below ~45px on a 1080-wide canvas.
- If the prompt still needs to describe the *scene* around where text will go
  (e.g. "leave clean space at the bottom for a headline"), that is fine — only
  the literal words are banned from the prompt.

## When to stamp vs. when to prompt

- **Logo, exact headline copy, any text that must spell correctly** →
  `image_compose`. Never the prompt.
- **Scene, background, subject, mood, composition, color palette** →
  `image_generate`'s prompt. Let the model reinterpret these; do not try to
  stamp a whole scene with Pillow.

## Stamping the logo and text — `image_compose` reference

`image_compose` is local (Pillow), free, and takes no API call. It stamps
pixel-exact elements onto an image that already exists — the output of
`image_generate`, or a photo the client sent.

**Logo parameters:**
- `include_logo` (default `true`) — pulls the client's real `branding.logos`
- `logo` — override path/URL if you need a non-default logo file
- `logo_anchor` (default `bottom-right`) — one of `top-left top top-right left
  center right bottom-left bottom bottom-right`
- `logo_margin` (default `5%`) — px (`48`) or percent (`5%`, per-axis)
- `logo_scale` — logo size, px or percent of base width
- `logo_opacity` (default `100`) — integer 0-100

**Text parameters:**
- `text` — the exact string to stamp
- `text_anchor` (default `bottom`) — same anchor set as the logo
- `text_margin`, `text_size` (default `64`), `text_color` (default `white`)
- `text_max_width`, `text_font` — explicit font file override
- `text_use_heading_font` (default `true`) — resolves the client's
  `branding.typography.headingFont` automatically; leave this on unless the
  user asks for a specific different font
- `text_outline` (default `0`) — integer stroke width in px around the text,
  `0` for none; `text_outline_color`, `text_shadow` — legibility aids over
  busy backgrounds

**Canvas parameters (GF-143):**
- `canvas` — reshape `base_image` onto a named channel canvas BEFORE the logo
  and text are stamped, so anchors/margins measure against the final size:
  `instagram` 1080x1350, `story` 1080x1920, `landscape` 1536x1024, `square`
  1024x1024, `portrait` 1024x1536, `ig_square` 1080x1080, `ig_feed` 1080x1350,
  `ig_story` 1080x1920, `fb_feed` 1200x630, `fb_story` 1080x1920
- `canvas_mode` (default `crop`) — `crop` scales to cover and center-crops;
  `pad` letterboxes onto `canvas_fill` with nothing cropped
- `canvas_fill` (default `white`) — pad-mode fill color
- Omitting `canvas` leaves behavior exactly as before. On `story`/`ig_story`/
  `fb_story`, the logo and text are auto-kept out of Instagram's UI bands (top
  250px, bottom 340px) WHEN THE ELEMENT FITS in that 1330px gap — do not
  adjust anchors or margins yourself for this. A logo or text block taller
  than the gap is top-aligned at the 250px line instead, and its bottom edge
  still overlaps the bottom band; there is no shrinking or rejecting it, so
  keep stamped elements smaller than the gap on story canvases.
  These 250/340 numbers are Instagram's own story chrome; `fb_story` reuses
  them as a conservative approximation (Facebook's actual story UI differs
  slightly), which is close enough to be safe.

### Fitting an existing image to a channel (GF-143)

If the base image is not already the right shape for its channel — a client's
own photo, or an image generated at a different aspect ratio — pass `canvas`
by name rather than assuming the shape is already correct or hand-computing
pixels:

| `canvas` value | pixels |
|---|---|
| `instagram` | 1080x1350 |
| `story` | 1080x1920 |
| `landscape` | 1536x1024 |
| `square` | 1024x1024 |
| `portrait` | 1024x1536 |
| `ig_square` | 1080x1080 |
| `ig_feed` | 1080x1350 |
| `ig_story` | 1080x1920 |
| `fb_feed` | 1200x630 |
| `fb_story` | 1080x1920 |

**Which channel/format maps to which `canvas` name** — use this instead of
inferring it:

| Channel + format | `canvas` value |
|---|---|
| Instagram feed post / grid square | `ig_square` |
| Instagram feed (portrait 4:5) | `ig_feed` |
| Instagram Story | `ig_story` |
| Facebook feed post | `fb_feed` |
| Facebook Story | `fb_story` |

**Prefer the `ig_*`/`fb_*` names for new calls.** `instagram`, `story`,
`landscape`, `square`, and `portrait` are the original generic sizes from
before GF-143 and are kept only so existing callers stay byte-identical —
`instagram` == `ig_feed` (1080x1350) and `story` == `ig_story` == `fb_story`
(1080x1920) are the same pixels under different names. The trap is `square`
(1024x1024, the old generic AI-generation size) vs `ig_square` (1080x1080,
Instagram's actual grid-post size) — they are NOT interchangeable. For an
Instagram grid post, pick `ig_square`, not `square`.

Both logo and text can be stamped in one call — pass both sets of parameters
together. `base_image` (required) is the existing image to stamp onto — a
path/URL/asset filename, e.g. the output of a prior `image_generate` call.
`image_compose` DOES take `post_id`, with the same auto-link behavior as
`image_generate`'s `post_id` (copies the composed file into the client assets
dir, PATCHes the post, and confirms) — pass it when the composed file is the
cover for an existing post; omit it for a stand-alone / reserve image.

## STEP 4 — The visual craft bar (don't produce AI slop)

STEP 0–3 make the image on-brand, correctly sized, and legible. An image can pass
all of that and still look machine-made, which is the failure that gets work
rejected. This step is the bar it has to clear.

**Stance.** You are art-directing, not requesting a picture. Safe, generic and
decorative is a failure even when the palette is right. Make one deliberate
visual decision the image is built around, and let everything else stay quiet.
Reaching for more effects is the opposite of bold: an image where the background,
the lighting, the overlay and the type are all fighting reads as noise, not
craft.

### The refuse list (AI-image defaults)

These are the generator's reflexes. The brief or the Visual Guidelines can earn
any of them explicitly — but reaching for one because it is what the model
offers first means you were not deciding. Put the refusal in the prompt as a
negative instruction when it matters.

Scene clichés:
- The diverse team smiling at a laptop in a bright open-plan office.
- Glowing blue holographic circuitry, neural-network meshes, or floating data
  streams to mean "AI" or "technology".
- Translucent glass UI panels or fake dashboards hovering in mid-air, and a hand
  reaching into a glowing interface.
- The metaphor bin: brain made of circuits, lightbulb, handshake, gears, rocket
  launch, chess piece, glowing padlock.
- Hyper-glossy 3D-render plastic surfacing applied to everything regardless of
  subject.

Surface habits (these are the tells that got the v1 pitch slides rejected as
"too AI / too sales-y" — treat them as known-bad for GF):
- **Pill eyebrows / kicker labels above a headline.** This is a ban, not a
  default. The headline carries its own weight.
- Radial glows and lens flares as the depth system. Real depth has an offset and
  a soft blur, not a zero-offset colored halo.
- Ghost numbers and giant faded background digits.
- Heavy drop shadows, over-rounded corners, chip/tag rows.
- Abstract skeleton bars standing in for content that does not exist.
- Purple-to-blue gradient mesh as the default background.
- A perfectly centered, symmetrical hero object floating on a gradient.
- Emoji or unicode glyphs standing in for a real icon system.
- Uncanny over-smooth skin and identical three-point studio lighting on every
  subject.

Hard mechanical checks:
- **Garbled text is the single biggest AI tell.** The generator cannot spell
  reliably. Keep on-canvas text to the minimum STEP 3 allows, and when the exact
  wording matters, generate a **text-free** plate and stamp the type afterwards
  with `image_compose` (see STEP 3; the analogous ffmpeg route for video lives in
  `video-generation` and the reel-overlay skill). Never ship an image with a
  misspelled or melted word.
- **Hands.** Prefer compositions without visible hands, or crop them. If hands
  are unavoidable, inspect the finger count before delivering.
- **Contrast.** Any text over imagery needs a real contrast floor — roughly
  4.5:1. If it is not there, add a scrim or move the text, do not tint the type
  gray.

### The skeleton test (run this before delivering)

Ignore the styling and read the image as structure alone. Does it say what this
post is about, and does it carry one thing a viewer could actually point at — a
real product screen, a real object, a real number, a real place?

- If yes, ship it.
- If the image only works because of its surface treatment (glow, gradient,
  texture), it is decoration. Do NOT add more effects. Change the subject to
  something concrete, or ask the user what the real thing is.

Fabricated product screens must be labelled as illustrative, not passed off as a
real client. Prefer a real screenshot whenever one exists in the client assets.

### One pass, then stop

Generate, then inspect once against STEP 0–3 and this step together — one batched
look, not a rule-by-rule loop. Fix everything that look surfaces in a single
regeneration. Then deliver. Do not iterate open-endedly on an image that already
clears the bar; every regeneration costs credits and drifts off the Visual
Guidelines.

## PIL-based image editing (fallback for transforms `image_generate` and `image_compose` don't cover)

`image_generate` with `edit=true` (STEP 1) handles AI-driven edits — background
swaps, style changes that need the model to reinterpret the scene.
`image_compose` (STEP 2/3) handles pixel-exact stamping — logo, headline text.
Neither covers deterministic filter-style transforms (recolor, posterize,
cartoon-ify) where no AI reinterpretation is wanted and no compositing is
involved. For those, use **PIL + numpy** directly. The venv at
`/opt/hermes/.venv/bin/python3` has Pillow; install numpy if missing
(`/opt/hermes/.venv/bin/pip install numpy -q`).

### Common transforms

- **Boost colour/saturation:** `ImageEnhance.Color(img).enhance(2.5)` then convert
  to HSV, multiply the S channel by 1.4 (clamped to 255), convert back.
- **Illustration / cartoon effect:** Smooth → posterize (reduce to 6 colour
  levels) → edge-detect (FIND_EDGES, threshold >40) → composite edges as dark
  outlines over posterized fill → `ModeFilter(size=5)` for oil-painting look.
  See `references/pil-image-transforms.md` for the full recipe and tunable parameters.
- **Always save to the client assets path** (e.g.
  `/opt/marketing-planner/client/assets/<filename>.jpg`) so the post's `image`
  URL stays valid. The file overwrites in place — no manifest update needed if
  the entry already exists.

### Verifying an edit was applied

When the user asks "did you actually change it?" (skepticism signal), verify with
**measurable data**, not just words:

1. Compare original vs. edited: saturation mean, brightness mean, file size.
2. Compute pixel diff: `np.abs(orig - edited).mean()` and percentage of changed
   pixels.
3. Report the numbers — e.g. "Saturation 61→128, 99% pixels changed, file size
   445KB→1.1MB." This is far more convincing than "yes I did it."


## Delivery

Send the generated image **once** (no preview + URL duplication). Confirm the
change in the user's language, citing the public url.

**Tell the user to refresh (GF-29).** The dashboard does not live-update after an
image PATCH. Whenever you generate or change a post image, end your confirmation
by telling the user — in their language — to **update the page to see the post**
(e.g. click the green reload button on the Content Calendar). Otherwise they
think nothing happened.

## See also

- `video-generation` - create Seedance 2.0 MP4 assets with `video_generate`.

- `copywriting` — read the VOICE before writing the post text. Its STEP 1.6 is
  the verbal counterpart of STEP 4 above: same stance, same refuse-list logic,
  same skeleton test, applied to the words.
- The platform API write-contract skill (when present on this box) — full API write-contract, assets, carousels.

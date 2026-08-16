---
name: image-generation
description: Generating or changing images for posts and assets. ALWAYS read the brand identity (colors, typography, logos, tone) AND the Visual Guidelines from the brief BEFORE generating, so the image is on-brand and cohesive across posts. Covers per-channel format (Instagram vertical 4:5, LinkedIn horizontal), fidelity, post_id auto-link, never inventing logos, using the real logo as a reference image, and the visual craft bar that keeps the result from looking AI-made.
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

## STEP 3 — Text INSIDE the image (GF-32) — HARD CAPS, not preferences

On-canvas text is capped by COUNT and by PROPORTION OF THE FRAME. "Minimal" is
not a number and points are a print unit with no meaning on a raster, so both
are stated here as things you can actually count and measure. **State every
number below verbatim in the image prompt.**

Applies to Instagram feed (1080x1350), Story (1080x1920) and every carousel
slide, which each get their own budget:

- **Max 3 text elements total:** 1 headline + at most 1 sub-line + at most 1
  CTA/stat.
- **Word and line caps** — headline: max 7 words, max 2 lines. Sub-line: max 10
  words, max 2 lines. CTA/stat: max 4 words, 1 line. No paragraphs, no bullet
  lists, no body copy.
- **Headline size:** cap-height >= 8% of image height (>= ~108 px on 1080x1350,
  >= ~155 px on 1080x1920). The headline block should occupy 15-25% of frame
  height.
- **Floor:** nothing smaller than 4% of image height (~54 px on 1080x1350,
  ~77 px on 1080x1920). If a line will not fit at that size, **DELETE it** —
  never shrink it.
- **Never on the image:** small print, footnotes, legal lines, URLs, hashtags.
- **Breathing room:** keep >= 20% of the frame as empty margin; text never
  enters the outer 6%.

Everything that does not fit these caps belongs in the post copy.

If the exact wording has to be perfect, generate a TEXT-FREE plate and composite
the type afterwards — see `gf-reel-text-overlay` for the ffmpeg route.

**Check the output, not the prompt.** After generating, count the text elements
and the words, and eyeball the headline against the 8% floor. If it misses,
regenerate — do not ship it and describe it as compliant.

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
  wording matters, generate a **text-free** plate and composite the type
  afterwards (see `video-generation` and the reel-overlay skill for the ffmpeg
  route). Never ship an image with a misspelled or melted word.
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

## PIL-based image editing (fallback when image_generate can't transform an existing image)

The active `image_generate` backend is **text-to-image only** — it cannot edit or
transform an existing image (no image-to-image). When the user asks to modify a
photo they already have (change colours, make an illustration, apply a filter),
use **PIL + numpy** directly. The venv at `/opt/hermes/.venv/bin/python3` has
Pillow; install numpy if missing (`/opt/hermes/.venv/bin/pip install numpy -q`).

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

---
name: video-generation
description: Producing branded marketing videos where Seedance makes only CLEAN motion and ffmpeg composites the REAL logo + perfectly-spelled brand-font text on top. This is the DEFAULT — the user just asks for "a branded video". MANDATORY storyboard-first flow, then per-scene clean plates, then composite, then merge scenes with xfade into ONE final reel.
tags: [marketing, videos, branding, compositing]
---

# Video Generation — branded compositing pipeline (Seedance 2.0 + ffmpeg)

For the client `$CLIENT_SLUG` on the Marketing-Planner server.

## The core principle: Seedance animates, ffmpeg composites (DEFAULT, no special prompting)

`video_generate` (bytedance/seedance) renders any on-screen copy as a GRAPHIC and
frequently **MISSPELLS** it (real burns seen: "head**lanes**" for headlines,
"**Relibility**" for reliability) and **invents fake logos**. A clip with a spelling
error or a fake logo is NOT publishable.

So this is the default for every branded video, with no prompt engineering needed from
the user:

1. **Seedance makes clean, text-free branded PLATES** — motion only, "NO TEXT ANYWHERE".
2. **ffmpeg composites the REAL logo + perfectly-spelled text** in the brand font
   (Montserrat, shipped with this skill) on top.
3. **ffmpeg merges the scenes** into ONE final reel with smooth `xfade` transitions.

In-model text/logo rendering is **opt-out only**: only skip compositing if the user
explicitly asks Seedance to draw the text/logo itself.

## Set expectations up front (timing — GF-76)

**Before you start generating, tell the user each video plate takes about 6–7 minutes
to generate** (Seedance is a slow async model), and a multi-scene reel takes roughly
that per scene plus compositing/merge time. Generate independent plates in parallel in
the background to keep the total down, but still warn the user it will not be instant.

## STEP 0 — Read the brand identity first

Never generate before you know the brand. If you have not already read the brief this
conversation, your first action is:

```
GET /clients/$CLIENT_SLUG/brief   ->  use data.branding
```

Take the brand colors, typography, and tone into the plate prompts and the overlay
colors. The exact logo and font are NOT prompted into Seedance — they are composited
from real files (see STEP 4).

## STEP 0.5 — Storyboard FIRST (mandatory, no exceptions)

Never call `video_generate` directly from a request. The user must see and approve the
scenes as still images first:

1. Break the concept into scenes (typically 2–4 for a 15–30s reel; problem → solution
   → benefit → CTA works well). For each note: subject, action, camera movement, copy,
   and approximate duration.
2. Generate ONE still per scene with `image_generate` (fidelity="fast"), using the brand
   colors/style from the brief. These stills double as the Seedance `first_frame` plates
   in STEP 2, so make them clean and brand-exact — but they may carry text for review.
3. Send the stills to the user, one line per scene + planned total duration, and the
   6–7 min/plate timing warning.
4. **STOP and wait for explicit approval.** On change requests, adjust the affected
   still and re-send. Do NOT proceed on silence.

## STEP 1 — Duration limits

- **Seedance per-clip cap: 15 seconds.** Never ask Seedance for a longer single plate.
- The composited FINAL reel MAY be longer — it is several scenes merged. Default target
  total **15–30s**. For longer, add more scenes; do not stretch a clip.
- These caps apply only to clips WE generate. **Externally-produced videos are a
  separate class** (longer, more elaborate pieces aimed at boosted/commercial
  placements or format experiments). Do not reject them for length; review them
  on their own goal — the review checklist lives in `post-drafting` under
  "Reviewing videos produced outside video_generate".

## STEP 2 — Generate a CLEAN, text-free plate per scene

For each approved scene, pin its approved still as `first_frame` and ask Seedance for
motion only. **Use the `video_generate` TOOL — it is available on every surface
(Telegram AND the dashboard chat) and uses the configured OpenRouter key.** Do NOT
hand-roll Seedance with terminal `curl`, do NOT go hunting for API keys in the
environment or `/proc`, and do NOT enable other video plugins — the tool owns this.

```
video_generate(
  prompt="Animate this exact scene: <MOTION + camera only>. Keep the exact colors and
          flat style of the first frame. NO TEXT ANYWHERE — no words, letters, numbers,
          captions or logos.",
  post_id="<post id>",
  first_frame="<approved scene still — public URL or asset filename>",
  duration=<approved seconds, max 15>,
  resolution="720p",
  aspect_ratio="portrait",     # 9:16 for reels; use landscape/square to match the post
  generate_audio=false
)
```

Prompt tips (from the launch-reel build):
- Lead with *"Animate this exact scene…"* and end with *"keep the exact colors and
  style of the first frame."* — stops Seedance drifting off-brand.
- ALWAYS append the explicit **"NO TEXT ANYWHERE…"** clause.
- Constrain color when it hallucinates ("only these colors; NO orange, NO glows").
- Reference values must be public HTTPS URLs or client-asset filenames — never `data:`.

`video_generate` submits the async job, polls, downloads the MP4 into the client assets
folder, and appends a manifest entry. **These raw plates are intermediates** — do not
deliver them; they get composited and merged, and only the FINAL reel is wired to the
post (STEP 5–6).

## STEP 3 — Vision-check each plate

Extract 3–4 frames per plate and confirm: ZERO text/logo, on-brand colors, and enough
negative space for the overlay text to sit on.

```
ffmpeg -ss <t> -i plate.mp4 -frames:v 1 frame.png   # then vision_analyze the frame
```

If a plate has text, a fake logo, an edge artifact band, or an off-brand bloom,
regenerate with a tighter prompt — do NOT settle.

## STEP 4 — Composite the REAL text + logo (`scripts/composite_overlay.sh`)

Copy `scripts/composite_overlay.sh` per scene and edit it (don't hand-roll your own
ffmpeg — the script already handles the traps below). It:
- normalizes the plate (`scale=…:flags=lanczos, setsar=1, fps=30`),
- burns timed text beats with `drawtext` (brand font, per-beat alpha fade in/out,
  keyword lines in the accent color),
- overlays the client's **real logo PNG** on a subtle dark scrim so it reads on ANY
  plate (see the logo traps below),
- exports `-crf 18 -pix_fmt yuv420p -movflags +faststart`.

Assets (never guessed). You run inside the agent CONTAINER, where skills mount at
`/opt/data/skills/` (core under `/core/`, client under `/client/`) — NOT the host
`/opt/agents/<slug>/…` path:
- **Fonts** ship with THIS skill at `assets/fonts/Montserrat-{Regular,SemiBold,Bold,ExtraBold}.ttf`
  → in the container `/opt/data/skills/core/video-generation/assets/fonts/` (SIL OFL).
- **Logo** is the client's real transparent PNG in the client overlay skill, e.g.
  gf-innov: `/opt/data/skills/client/gf-reel-text-overlay/assets/gf-logo-white.png`
  (light lockup, the default for video) or `gf-logo-transparent.png` (dark lockup).
  NEVER let Seedance draw a logo; NEVER invent one.

**Two logo traps the script already solves — keep them if you edit the command:**
1. The logo is a SINGLE still, so overlay it with `-loop 1 -i logo.png … overlay=…:shortest=1`.
   Without the loop it paints on frame 1 only and then VANISHES for the rest of the clip.
2. A flat logo has no contrast on some plates (dark logo on dark footage, or a white logo
   on a bright shot). Use the LIGHT lockup on a subtle dark **scrim** (`drawbox … black@0.35`)
   so it reads on every plate.

**Vision-check EVERY text beat frame AND the logo (MANDATORY).** Read the exact copy
back (a single misspelling makes the clip unpublishable), AND confirm the REAL logo is
actually VISIBLE in the frame — not washed out, not clipped, not gone after frame 1. An
invisible or absent logo is a FAIL: raise the scrim opacity, move it, or swap the logo
variant, then re-check. Do not claim "logo top-center" without seeing it in a frame.

## STEP 5 — Merge the scenes (`scripts/merge_scenes.sh`)

Copy `scripts/merge_scenes.sh` and edit it to crossfade the composited scenes into ONE
final reel. It re-normalizes each scene then `xfade`s at explicit offsets
(`offset_k = (D1+…+Dk) − k·XF`; recompute from the REAL clip lengths with `ffprobe`).
Default transition `fade` (or `slideleft`); default `XF=0.6s`.

## STEP 6 — Cut the cover, then wire the FINAL reel into the post

1. Cut a cover PNG from a strong keyword moment of the FINAL reel:
   `ffmpeg -ss <t> -i <POSTID>_final.mp4 -frames:v 1 -q:v 2 <POSTID>_cover_final.png`
2. Because the composited final bypasses the `video_generate` auto-linker, **manually
   append** the final MP4 + cover to `manifest.json` (recipe below).
3. **PATCH the post**: `media[]` = a list with ONLY the final reel (drop the raw plates
   and any earlier version), `format="reel"`, and top-level `image` = the cover.

### media[] hygiene (critical)
- `media[]` ACCUMULATES every clip you attach. After finishing, PATCH `media` to hold
  ONLY the final reel so raw plates / old versions don't linger in the kanban.
- `format` must be `"reel"` for video posts. `image` (the cover) is a SEPARATE
  top-level field — always set it to a real frame you cut with ffmpeg.
- `POST /approvals` only logs; to change status use `PATCH /posts/{id} {"status":...}`.
- **Every `media[]` entry needs a `caption`**, and the compositing path does not
  add one. The caption is the one-line description of what the viewer will see,
  and it is the brief for this clip: `post-drafting` writes it at draft time, so
  read the post's existing `media[].caption` before you write the plate prompts
  and shoot against it. If the post arrives without one, PATCH a caption onto the
  final `media[]` entry describing what the finished reel shows.
- `media` PATCHes as a WHOLE array — send every entry with its current `type` and
  `url`, or the others are dropped.

### Manifest append recipe (for the composited final — bypasses the auto-linker)
*Beware python f-string backslash escaping inside single-quoted shell; use `.zfill()`
and string concatenation.*

```bash
python3 -c '
import json
with open("/opt/marketing-planner/client/assets/manifest.json", "r") as f:
    data = json.load(f)
items_len = len(data["items"])
next_id = "a" + str(items_len + 1).zfill(3)
data["items"].append({
    "id": next_id,
    "filename": "<POSTID>_final.mp4",
    "url": "<public assets base>/clients/$CLIENT_SLUG/assets/files/<POSTID>_final.mp4",
    "kind": "video",
    "source": "seedance plate + ffmpeg branded compositing",
    "usedInPosts": [],
    "owner": "Viktor",
    "finalApproved": False,
    "createdAt": "2026-07-15T12:00:00Z"
})
with open("/opt/marketing-planner/client/assets/manifest.json", "w") as f:
    json.dump(data, f, indent=2)
'
```

## Delivery

Deliver the FINAL reel once (public URL, saved in the dashboard Videos section) and
confirm it is attached to the post. Never create videos with terminal `curl`, raw
OpenRouter calls, or any other path — `video_generate` owns plate generation, and the
compositing scripts here own the branded edit.

## Simple speed change (existing clip, no re-brand)

When a user just wants an existing video slower/faster, use `setpts` and manually append
the new file to the manifest (same recipe above):

```bash
ffmpeg -y -i /opt/marketing-planner/client/assets/original_video.mp4 \
  -filter:v "setpts=(1/0.7)*PTS" /opt/marketing-planner/client/assets/video_slow_07.mp4
```

Do NOT time-stretch a finished branded reel to "make it longer" — that desyncs the text
fades; add more scenes instead (STEP 2–5).

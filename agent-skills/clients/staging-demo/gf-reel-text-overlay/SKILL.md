---
name: gf-reel-text-overlay
description: GF-Innov brand style + logo asset for branded videos. The pipeline itself (clean Seedance plate -> ffmpeg composite real text/logo -> xfade merge) lives in the core `video-generation` skill; this skill only carries GF's palette, font weights, layout, and the real transparent logo file.
---

# GF-Innov branded video — style notes (pipeline lives in core `video-generation`)

The full branded-video pipeline — clean text-free Seedance plates, ffmpeg `drawtext`
compositing of the real text + logo, and `xfade` scene merge — is the DEFAULT in the
core **`video-generation`** skill. Do NOT duplicate that logic here. This file is only
GF-Innov's brand specifics that plug into that pipeline.

## Brand style (matches the IG carousel/cover system)
- **Vertical 9:16** reels (Seedance renders 720×1280 → composite/upscale to 1080×1920).
- **Solid charcoal `#1a1a1a`** background motion. Only accent colors: bright green
  `#22c55e` and white. Everything else stays neutral — no orange, no glows.
- **Montserrat** (bundled with core `video-generation` at `assets/fonts/`): SemiBold for
  body beats, ExtraBold for the green keyword line. In `composite_overlay.sh` set
  `KEY=0x22c55e`, `BODY=0xffffff`.
- Minimal, mobile-legible, generous spacing, ONE keyword per line group in green,
  ≤6 words per beat, each block held ≥1.5s.

## GF logo (the real asset — never let Seedance draw it)
Two real GF lockups ship here. On the box: `…/data/skills/client/gf-reel-text-overlay/assets/`.
- **`gf-logo-white.png`** — WHITE "GF Innovative Solutions" lockup (green G accent + wifi
  mark). **The default for video overlays** and what `composite_overlay.sh` uses: cinematic
  plates are usually dark, and on the script's subtle dark scrim it also reads on bright shots.
- `gf-logo-transparent.png` — navy `~#374461` monogram; only for genuinely light backgrounds.
- GF-28 rule: the agent must NEVER invent a GF logo — always composite one of these files.
- The navy lockup vanishes on dark footage and the white one vanishes on bright footage, so
  the script overlays the white logo on a semi-transparent dark scrim (reads on ANY plate).
  ALWAYS vision-check the logo is actually visible in a rendered frame.

## Legacy single-clip template
`scripts/reel_text_overlay.sh` is the original single-clip drawtext overlay (charcoal/
green, LiberationSans). It is superseded by core `video-generation/scripts/composite_overlay.sh`
(Montserrat + logo overlay + normalization + multi-scene merge); kept only as a concrete
GF example. Prefer the core scripts for new work.

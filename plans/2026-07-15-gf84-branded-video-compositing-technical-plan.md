---
project: GF-84 Branded Video Compositing (Viktor)
updated: 2026-07-15
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005]
items:
  - gf-84: Video skill: overlay logo + text via compositing by default | priority: medium
  - gf-76: For the Video generation, the skill should say that when creating a video it should take 6-7min per video. | priority: low
---

# Plan

## Simple Words

- Today, when Viktor makes a video, the AI video model (Seedance) tries to draw the
  text and the logo inside the video. That is why text comes out misspelled and the
  logo looks fake.
- After this change, Viktor works like the launch reel in `GF/presentation-video/`:
  Seedance only makes clean moving backgrounds (no text, no logo). Then Viktor puts
  the real logo file and perfectly spelled text on top with ffmpeg, in the brand
  font (Montserrat), and can merge several scenes into one video with smooth
  transitions.
- This becomes the DEFAULT: Martin/Pilar just ask for "a branded video" and get the
  polished result, without special prompting. The finished video attaches to the
  dashboard post exactly as today.
- Also included (GF-76, one line): the skill tells Viktor to warn the user that each
  video takes about 6-7 minutes to generate.
- NOT included yet: headless-Chrome/HTML-rendered overlays (HyperFrames, GF-83),
  audio/music synthesis, and videos for other channels than the current formats.

## Decisions and API Contracts

### TASK-001: Decide + verify the on-box overlay method (ffmpeg drawtext + logo PNG, no Chrome)
status: todo
owner: claude
agent: claude
reviewer: human
branch: none
area: decisions
estimate: XS
depends_on: []
tags: [notion, gf-84, agent, decision]
acceptance:
- Confirmed on the staging Viktor box: ffmpeg present, fonts available (fc-list), python3 + PIL available for logo alpha-keying.
- Decision recorded: overlays are ffmpeg drawtext (text) + overlay (logo PNG), NOT headless-Chrome HTML rendering; Chrome/HyperFrames stays deferred to GF-83.
- Decision recorded: Seedance per-clip cap stays 15s; the composited final may be longer (multi-scene merge, default target 15-30s total).
notes:
- Source: GF-84 in Notion + Martin's clarification 2026-07-15 ("Viktor should create the text and merge videos, like presentation-video").
- Code evidence: agent-skills/clients/gf-innov/gf-reel-text-overlay/SKILL.md already proves ffmpeg + LiberationSans on the box; no Chrome assumed.
- Code evidence: local recipe at ~/.claude/skills/generate-media/references/polished-branded-video.md uses Chrome for overlays — that part is replaced by drawtext/PIL on the box.
- The storyboard stills (image_generate, already public URLs in client assets) double as Seedance first_frame plates, so no extra hosting is needed.

## Skill Implementation (repo agent-skills/)

### TASK-002: Ship brand assets: Montserrat fonts + transparent client logo convention
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-84-branded-video-compositing
area: agent
estimate: S
depends_on: [TASK-001]
tags: [notion, gf-84, agent, assets]
acceptance:
- Montserrat Regular/SemiBold/Bold/ExtraBold TTFs committed under agent-skills/core/video-generation/assets/fonts/ (SIL OFL, license noted).
- A documented per-client logo convention exists (e.g. clients/<slug>/ brand logo as transparent PNG reachable from the agent container), with the gf-innov logo prepared (white background alpha-keyed via PIL).
- SKILL.md references the font path and logo path explicitly so the agent never guesses.
notes:
- Source: GF-84 in Notion.
- Code evidence: fonts already exist locally at GF/presentation-video/fonts/ (Montserrat-*.ttf) — copy from there.
- Code evidence: GF-28 memory — agent must never invent logos; the real asset is mandatory.

### TASK-003: Add compositing scripts: text/logo overlay + multi-scene merge
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-84-branded-video-compositing
area: agent
estimate: M
depends_on: [TASK-002]
tags: [notion, gf-84, agent, ffmpeg]
acceptance:
- agent-skills/core/video-generation/scripts/composite_overlay.sh burns timed text beats (drawtext, alpha fade in/out, brand font, keyword color support) and overlays the logo PNG onto a clip; output normalized (scale lanczos, setsar=1, fps=30, crf 18, yuv420p, +faststart).
- agent-skills/core/video-generation/scripts/merge_scenes.sh concatenates N clips with xfade transitions (fade/slideleft) at explicit offsets, normalizing resolution/fps first.
- Scripts are parametrized copy-per-job templates (same pattern as gf-reel-text-overlay/scripts/reel_text_overlay.sh) and run with only ffmpeg + coreutils on the box.
notes:
- Source: GF-84 in Notion; merge requirement from Martin's 2026-07-15 clarification.
- Code evidence: agent-skills/clients/gf-innov/gf-reel-text-overlay/scripts/reel_text_overlay.sh is the single-clip drawtext baseline to generalize.
- Code evidence: ffmpeg filter_complex recipe (xfade offsets, overlay eof_action=pass, setpts placement) in polished-branded-video.md steps 5.

### TASK-004: Rewrite core video-generation SKILL.md — compositing is the default pipeline
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-84-branded-video-compositing
area: agent
estimate: M
depends_on: [TASK-003]
tags: [notion, gf-84, agent, skill]
acceptance:
- Default flow in SKILL.md: (1) storyboard stills via image_generate + user approval (existing STEP 0.5 kept); (2) per scene, video_generate a CLEAN plate with the approved still as first_frame and the mandatory "NO TEXT ANYWHERE — no words, letters, numbers, captions or logos" clause; (3) vision-check plates frame-by-frame; (4) composite real text + logo with the TASK-003 scripts; (5) merge scenes with xfade; (6) cut cover frame; (7) manifest append + PATCH post media[] to the SINGLE final clip, format "reel", image = cover.
- In-model text/logo rendering is explicit opt-out only (user must ask for it); no user prompt engineering needed for the default.
- media[] hygiene, per-clip 15s Seedance cap, and vision-check-every-text-beat rules carried over from gf-reel-text-overlay.
- gf-innov's gf-reel-text-overlay SKILL.md is reduced to client-specific style notes (charcoal/green palette) pointing at the core pipeline, so logic is not duplicated.
notes:
- Source: GF-84 in Notion.
- Code evidence: agent-skills/core/video-generation/SKILL.md currently prompts Seedance directly with brand style (text baked in) — the part being replaced.
- Keep the existing manifest-append python recipe (SKILL.md "Video Post-Processing" section) for the composited final since it bypasses the video_generate auto-linker.

### TASK-005: GF-76 — state the 6-7 min per-video expectation in the skill
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-84-branded-video-compositing
area: agent
estimate: XS
depends_on: [TASK-004]
tags: [notion, gf-76, agent, skill]
acceptance:
- SKILL.md instructs Viktor to tell the user up front that each video takes about 6-7 minutes per clip (longer for multi-scene reels), before generation starts.
notes:
- Source: GF-76 in Notion (Low, Inbox) — one-line rider on the same SKILL.md rewrite; folded in to avoid a second deploy.

## Deployment and Verification

### TASK-006: Deploy to staging agent + live end-to-end branded video test
status: todo
owner: claude
agent: viktor-staging
reviewer: human
branch: claude/gf-84-branded-video-compositing
area: deployment
estimate: M
depends_on: [TASK-004, TASK-005]
tags: [notion, gf-84, agent, staging]
acceptance:
- Skill + scripts + fonts + logo synced onto the staging box bind-mount (/opt/agents/<slug>/data/skills) as root with chown 10000 and agent restart — NOT just committed to the repo.
- Live test: asking staging Viktor for a branded multi-scene video (no special prompting) yields an MP4 where the logo is the real pixel-accurate asset, all text is crisp/correctly spelled in Montserrat, and scenes transition smoothly.
- The final MP4 + cover appear in the dashboard (assets manifest + post media[] single final clip), matching GF-84 acceptance criterion 3.
notes:
- Source: GF-84 in Notion.
- Gotcha: skill DRIFT incident (GF-32) — editing repo SKILL.md alone does nothing on the box; overwrite the host bind-mount (see memory reference_hermes_agents_ignore_skills).
- Use sync-agent-skills.sh from GF-79 where applicable.

### TASK-007: Layer-5 independent cross-vendor review
status: todo
owner: claude
agent: codex
reviewer: codex
branch: claude/gf-84-branded-video-compositing
area: review
estimate: S
depends_on: [TASK-006]
tags: [notion, gf-84, review]
acceptance:
- Independent review (different vendor, per independent-review skill) returns PASS on the diff vs GF-84 acceptance criteria; findings looped through fix -> re-verify -> re-review.
- PR merged to experimental; Notion GF-84 (and GF-76) moved to "Done in Staging".
notes:
- Agent-skills changes are inert on the website, so no changelog.ts entry needed (agent-side only, not user-visible dashboard UI).

### TASK-008: Promote skill to production agents (gf-innov, biomas)
status: todo
owner: martin
agent: claude
reviewer: human
branch: none
area: deployment
estimate: S
depends_on: [TASK-007]
tags: [notion, gf-84, prod]
acceptance:
- After Martin validates the staging video, the same synced skill set lands on prod gf-innov (and biomas if its brand assets exist); Notion moved to "Done in Main".
notes:
- Separate explicit step per promote-staging-to-prod discipline; biomas needs its own transparent logo prepared first.

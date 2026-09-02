---
project: GF-143 compose-image canvas presets
updated: 2026-09-02
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
default_group: item
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005]
items:
  - gf-143: compose-image, honor Instagram/Facebook canvas sizes | priority: high
---

# Plan

## Simple Words

Viktor and the local `compose-image` tool can already stamp a real logo and real
text onto a picture. The local tool can also reshape a picture to a few named
sizes; Viktor cannot reshape at all. This plan adds the missing Instagram and
Facebook sizes by name (IG square, IG feed, IG story, FB feed, FB story) and
teaches Viktor to use them, so nobody has to type pixel numbers and nothing gets
badly cropped by Instagram.

It also stops the logo landing behind Instagram's own buttons on a story: an
opt-in "story safe zone" keeps the logo and text out of the top and bottom bands
where Instagram draws its interface.

Not included: any new preset for LinkedIn, X, TikTok or YouTube; automatic
choice of a canvas from the post's channel; and changing the pixel numbers of
the five presets that already exist (renaming or resizing `square` would
silently change output for existing callers).

## Decisions and API Contracts

### TASK-001: Extend the preset table and add a story safe zone to compose_core
status: done
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-143-canvas-presets
area: agent-plugin
estimate: S
depends_on: []
tags: [gf-143, compose, presets]
acceptance:
- `PRESETS` in `deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/compose_core.py` gains `ig_square` (1080, 1080), `ig_feed` (1080, 1350), `ig_story` (1080, 1920), `fb_feed` (1200, 630), `fb_story` (1080, 1920).
- The five existing keys `instagram`, `story`, `landscape`, `square`, `portrait` keep their current tuples byte-identical.
- A new `SAFE_ZONES` dict maps preset name to `(top_px, bottom_px)` insets; `ig_story`, `fb_story` and `story` map to `(250, 340)`, every other preset to `(0, 0)`.
- A new `frame_to_preset(img, preset, mode, fill)` returns a new `Image` padded or center-cropped to the preset size; an unknown preset raises `ComposeError` naming the valid keys; an unknown mode raises `ComposeError`.
- `composite_logo` and `composite_text` accept an optional `safe_zone` preset name; when given, the computed y is clamped to `[top_px, base_h - el_h - bottom_px]` so the element cannot land in the story UI band. Omitted or `None` leaves placement byte-identical to today.
notes:
- Source: GF-143 in Notion (Change, High, Estimate S).
- Code evidence: `compose_core.py:39-45` holds `PRESETS` today but the module has NO frame function; `anchor_xy` at `compose_core.py:70` computes placement.
- Contradiction with the Notion item: the item says compose-image "has no built-in knowledge of the standard social media canvas sizes". It does - the local skill has a `frame` verb with five presets. The genuine gaps are the missing IG-square/FB-feed numbers and the fact that the agent plugin has no framing capability at all.
- Safe-zone numbers: 250px top / 340px bottom on a 1080x1920 canvas, the bands where Instagram draws the profile header and the reply/CTA row. Documented as constants, not magic numbers.
- TDD: `test_gf134_review_fixes.py` and `test_story_aspect.py` establish a pytest harness in this directory - write the failing tests first.

### TASK-002: Expose canvas + safe zone on the image_compose agent tool
status: done
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-143-canvas-presets
area: agent-plugin
estimate: S
depends_on: [TASK-001]
tags: [gf-143, compose, viktor]
acceptance:
- The `image_compose` schema in `deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/__init__.py` gains a `canvas` string param (enum = `compose_core.PRESETS` keys), a `canvas_mode` param (`pad`|`crop`, default `crop`) and a `canvas_fill` param (default `white`).
- `_handle_image_compose` applies `frame_to_preset` to the base image BEFORE the logo and text stamps, so anchors and percent margins are measured against the final canvas.
- When `canvas` names a story preset, the logo and text stamps automatically pass that preset as `safe_zone`.
- Omitting `canvas` leaves the handler's behavior byte-identical to today; the existing plugin tests still pass unchanged.
- The tool description tells the agent to pass `canvas` rather than hand-computing pixels, and names the five channel presets.
notes:
- Code evidence: `image_compose` schema at `__init__.py:1570-1705`; handler `_handle_image_compose` at `__init__.py:1718`; logo stamp at `:1805`, text stamp at `:1842`, save at `:1888`.
- Order matters: framing after stamping would rescale a pixel-exact logo. Frame first.
- `_handle_image_compose` is also called internally from the `image_generate` compose path (`__init__.py:2109`) - that call must keep passing no `canvas`.

## Skill Sync

### TASK-003: Mirror the change into the local compose-image skill
status: done
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-143-canvas-presets
area: skill
estimate: XS
depends_on: [TASK-001]
tags: [gf-143, compose, skill]
acceptance:
- `C:\Users\Admin\.claude\skills\compose-image\scripts\compose_image.py` gains the same five new `PRESETS` keys and the same `SAFE_ZONES` table, and its `frame` verb accepts them.
- The `logo` and `text` verbs gain `--safe-zone PRESET`, with the same clamping semantics as TASK-001.
- `SKILL.md` documents the full preset table with pixel numbers and the safe-zone flag, and the "Wrong preset name" common-mistake row lists the new names.
- `python compose_image.py frame --preset fb_feed` on a test image produces a 1200x630 file, verified with `python -c "from PIL import Image; print(Image.open('out.png').size)"`.
notes:
- The two files are a vendored pair - `compose_core.py:2-10` says so explicitly. Divergence is the failure mode this task exists to prevent.
- The skill script is a CLI (argparse, `sys.exit`); the plugin core raises `ComposeError`. Keep that difference; mirror only the vocabulary and the math.
- NOTE FOR REVIEWERS: the skill script lives OUTSIDE this repo (under the user's Claude skills directory), so this task's changes never appear in a `git diff`. Round 1 of the Layer-5 review raised the twin as a HIGH finding for exactly that reason. Verify it by reading the file, not the diff.

## Verification

### TASK-004: Verify on staging, then promote the plugin to Biomas prod
status: todo
owner: martin
agent: claude
reviewer: human
branch: claude/gf-143-canvas-presets
area: deployment
estimate: S
depends_on: [TASK-002, TASK-003, TASK-005]
tags: [gf-143, staging, biomas, deploy]
acceptance:
- Every test module in the plugin directory passes when run individually with `python -m unittest <module>`, new preset/safe-zone tests included, and the actual output is quoted. NOT pytest: pytest's package-aware collection executes the plugin `__init__.py`, which imports the Hermes-only `agent` package, so it fails at collection on the unmodified tree too.
- On the staging agent, `image_compose` with `canvas: "fb_feed"` returns an image that is 1200x630, and with `canvas: "ig_story"` returns 1080x1920 with the logo clear of the top and bottom bands.
- After the staging check, the plugin is promoted to `/opt/agents/biomas/` via `promote-staging-to-prod`, and the deployed `__init__.py` + `compose_core.py` md5s match `origin/experimental`.
- The other four agents on the Hetzner box have identical before/after md5s.
notes:
- Martin's decision 2026-09-02: staging first, then Biomas - not a direct prod patch.
- Deploy trap (from GF-134): `plugins/` is a read-only bind mount and the image is built from `/opt/agents/biomas/Dockerfile`; a `docker compose up -d --force-recreate` discards anything installed into the running container. No new dependency here, so this task should not need a Dockerfile change - confirm Pillow is still present after recreate.
- Biomas has `branding.logos` but no `typography` font file, so text stamps still fall back to DejaVu. Out of scope for GF-143.

### TASK-005: Document the canvas params in the agent-facing image-generation skill
status: done
owner: martin
agent: claude
reviewer: kimi-k3
branch: claude/gf-143-canvas-presets
area: agent-skill
estimate: XS
depends_on: [TASK-002]
tags: [gf-143, compose, agent-skill]
acceptance:
- `agent-skills/core/image-generation/SKILL.md` documents `canvas`, `canvas_mode` and `canvas_fill` in the `image_compose` reference section, with all ten preset names and their exact pixel sizes.
- The doc states that story safe zones are automatic and the agent must not adjust anchors or margins for the Instagram chrome itself.
- STEP 0.5 distinguishes `canvas` (reshaping an existing image) from the GF-33/GF-69 channel rule (choosing the generation size), so the agent does not pass `canvas` on every compose call.
- The diff is additions only; no existing line is removed or reworded.
notes:
- Added during Phase 4, not present in the original plan. Found by checking how the change reaches Viktor: `agent-skills/core/image-generation/SKILL.md` is the runtime doc the agent reads to decide how to call `image_compose`. Without it the Biomas bot would have the `canvas` parameter and never use it, which would fail the point of the task.
- Code evidence: the `image_compose` reference section at SKILL.md:220+ already enumerates every other tool parameter; STEP 0.5 at :43-62 owns the channel/size rule.


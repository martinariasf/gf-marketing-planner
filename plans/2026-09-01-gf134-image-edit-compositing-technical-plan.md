---
project: GF-134 Image edit + deterministic brand compositing
updated: 2026-09-01
owner: martin
repo: C:/Users/Admin/Desktop/GF Innovative Solutions/GF/marketing-planner
source_branch: experimental
code_reviewed: true
focus_tasks: [TASK-001, TASK-002, TASK-003, TASK-004, TASK-005, TASK-006, TASK-007, TASK-008]
items:
  - gf-134: Image editing skill (modify photos, swap backgrounds) | priority: high
---

# Plan

## Simple Words

Today Viktor can only *invent* images from a text description. If you hand him a
photo of a product, he cannot change its background without redrawing the whole
thing, and the product comes back slightly different. He also flatly refuses to
make any image that mentions a logo unless he has the real logo file, because he
would otherwise draw a fake one.

This plan splits image-making into two layers.

**Layer 1, the AI layer.** Viktor and the local `generate-media` skill can now
take an existing photo and *edit* it: "keep this bottle, put it on a white studio
background". The subject stays; only what you asked for changes. This costs an API
call, and the background is AI-optimised, which is fine, because backgrounds are
allowed to be reinterpreted.

**Layer 2, the insert layer.** Anything that must be exactly right, the logo and
the headline text, is no longer drawn by the AI at all. It is stamped onto the
image afterwards by a normal image-editing routine, using the client's real logo
file and the client's real font. This is pixel-exact, it can never be misspelled
or warped, it costs nothing, and it needs no API call. Ten sizes of the same post
means one AI call and ten free stamps.

Because of Layer 2, Viktor stops refusing logo requests. He generates a clean
plate with space left for the logo, then stamps the real one on.

You get two separate local skills, `generate-media` (the AI layer, now with the
edit workflow documented) and a new `compose-image` (the insert layer, which needs
no API key at all), plus the same two capabilities exposed to clients through the
agent.

**Not included yet:** pixel-exact background *removal* (rembg or Photoroom) for
cutting a client's own subject out of its original photo. Layer 2 solves the
logo-and-text problem, which is the part where mistakes are unacceptable. If a
real client case shows the AI drifting on a *subject*, that becomes its own item.

**Fonts:** the brief already stores font *names* (`branding.typography`), not font
files. Layer 2 resolves a name to a real `.ttf` in the client's assets folder, and
falls back to a bundled default when the client has not uploaded one.

## Decisions and API Contracts

### TASK-001: Define the compose-image CLI and tool contract
status: todo
owner: martin
agent: claude
reviewer: human
branch: none
area: decisions
estimate: S
depends_on: []
tags: [notion, gf-134, contract, compositing]
acceptance:
- The three verbs (logo, text, frame) have a fixed argument list written down.
- Anchor vocabulary is fixed and shared by the CLI and the agent tool.
- Font resolution order is fixed: explicit path, then client asset by name, then bundled default.
- The same argument names are used by the local skill and the agent image_compose tool.
notes:
- Source: GF-134 in Notion; scope widened by Martin on 2026-09-01 to add a deterministic insert layer.
- Anchors: nine-grid (top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right) plus a margin in px or percent.
- Percent denominators, pinned 2026-09-01 after TASK-002 raised the ambiguity: --scale percent is of the BASE WIDTH; --margin percent is per-axis (x of base width, y of base height). Implemented as parse_measure(value, base_px) where the caller supplies the denominator. The vendored core in TASK-005 must match exactly.
- Contract must be settled before TASK-002 and TASK-005 build against it, or the CLI and the tool drift.
- Code evidence: app-v2/src/types/brief.ts:66 stores branding.typography as headingFont/bodyFont NAMES, not files.

## Local Skills

### TASK-002: Build the compose-image skill (PIL insert layer)
status: todo
owner: claude
agent: claude
reviewer: codex
branch: none
area: local-skill
estimate: M
depends_on: [TASK-001]
tags: [notion, gf-134, compositing, pillow]
acceptance:
- C:/Users/Admin/.claude/skills/compose-image/scripts/compose_image.py runs with no OPENROUTER_API_KEY set.
- The logo verb places an alpha PNG at any of the nine anchors with margin and scale, preserving transparency.
- The text verb renders a wrapped headline in a supplied .ttf at a given size and color, with an outline or shadow option.
- The frame verb pads or crops an image to a named channel size (instagram 1080x1350, story 1080x1920, landscape 1536x1024, square 1024x1024).
- Verbs chain: the output of one is valid input to the next, verified by running all three in sequence on one file.
- SKILL.md describes the two-layer doctrine and links generate-media as the layer-1 companion.
notes:
- New skill directory. C:/Users/Admin/.claude/skills is NOT version controlled, so this task produces no branch and no PR.
- Back up any file before overwriting; there is no git safety net on this path.
- Pillow only. No new dependency: PIL 12.2.0 confirmed present in the hermes container and available locally.
- The description must trigger on "add our logo to this", "put text on this image", "brand this photo", and NOT on "generate an image".

### TASK-003: Document the edit workflow in generate-media SKILL.md
status: todo
owner: claude
agent: claude
reviewer: codex
branch: none
area: local-skill
estimate: XS
depends_on: []
tags: [notion, gf-134, docs]
acceptance:
- SKILL.md has an "Editing an existing image" section with a runnable --ref example.
- The quick-reference table lists --ref under the Image column (it is entirely absent today).
- The section states that the subject is preserved and the background is AI-reinterpreted, and points at compose-image for anything that must be pixel-exact.
notes:
- Source: GF-134 acceptance criterion 2.
- Code evidence: scripts/generate_media.py:93-97 already sends input_references; :68-79 already accepts local paths and base64-encodes them. No code change needed, docs only.
- Code evidence: the SKILL.md quick-reference table currently lists --image and --first-frame for video only; --ref appears nowhere.

## Agent Plugin

### TASK-004: Add edit mode to image_gen_openrouter
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-134-image-edit-compositing
area: agent-plugin
estimate: M
depends_on: []
tags: [notion, gf-134, hermes, plugin]
acceptance:
- image_generate accepts an explicit edit intent argument, distinct from plain reference conditioning.
- In edit mode the appended directive instructs the model to preserve the subject and change only what the prompt asks, replacing the composite-this-logo-unaltered directive.
- In non-edit mode the existing compositing directive is unchanged, verified by asserting the built payload text for both modes.
- The tool description tells the agent that editing a photo the client just sent is a supported use, and how to reference it.
notes:
- Code evidence: deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/__init__.py:258-271 hardcodes a compositing directive whenever any reference is attached; it fights an edit instruction.
- Code evidence: same file :1305-1325 frames reference_images purely as "the EXACT official logo".
- Code evidence: gateway/run.py:945 and :7597-7625 already download inbound client photos and surface them, so the inbound half needs no work.
- Plan against the REPO copy: it is 61 lines AHEAD of the staging box (GF-69 story support merged but not yet deployed). Nothing exists only on the box; verified by diff on 2026-09-01.

### TASK-005: Add the image_compose tool to the plugin
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-134-image-edit-compositing
area: agent-plugin
estimate: L
depends_on: [TASK-001, TASK-002]
tags: [notion, gf-134, hermes, plugin, compositing]
acceptance:
- A new image_compose tool stamps a logo and/or text onto an existing image and returns a path or URL in the same shape image_generate returns.
- The logo defaults to the client's real branding.logos entry; the text font resolves from branding.typography via the client assets dir, with a bundled fallback.
- The tool works with no OPENROUTER_API_KEY set (no network call in the compose path), asserted by a test that unsets the key.
- A missing logo, a missing font, and an unreadable base image each return a structured error rather than raising.
notes:
- Reuses the compositing core from TASK-002; do NOT re-implement the PIL logic, share or vendor the same module.
- Code evidence: :606-625 _branding_logo_refs already fetches branding.logos from the client brief API.
- Code evidence: :411-419 _assets_dir and _public_assets_base give the asset resolution this tool needs for font files.
- Code evidence: :464-490 _reference_to_data_uri shows the existing accepted reference forms to stay consistent with.

### TASK-006: Stop conditioning the model on logos; stamp them instead
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-134-image-edit-compositing
area: agent-plugin
estimate: M
depends_on: [TASK-005]
tags: [notion, gf-134, hermes, plugin]
acceptance:
- A prompt mentioning a logo, with a branding logo available, generates a plate with clean space and then stamps the real logo via the TASK-005 compose path, instead of appending the logo to reference_images.
- No code path routes a branding logo into reference_images for the model to redraw.
- The no-logo refusal at :1462-1473 is left exactly as it is, including its error_type, and a test asserts it still fires unchanged.
- The image_generate tool description no longer instructs the agent to pass logos as reference_images.
notes:
- Narrowed by Martin on 2026-09-01: the original task also replaced the no-logo refusal. That half is dropped, because it changes behavior on a path biomas and black-venture-farm hit today and no acceptance criterion needs it. Only the conditioning change remains.
- Code evidence: :1456-1461 appends _branding_logo_refs() into refs, so the model renders the logo under a reproduce-unaltered directive. This is the path that must go.
- Without this task, TASK-005 ships a compose tool nothing calls: image_generate would still tell the agent to pass logos as references.
- Rationale matches the existing video doctrine in generate-media/references/polished-branded-video.md:9 — never let a generative model render a logo.

## Verification and Deployment

### TASK-007: Update the image-generation agent skill for the two layers
status: todo
owner: claude
agent: claude
reviewer: codex
branch: claude/gf-134-image-edit-compositing
area: agent-skill
estimate: S
depends_on: [TASK-004, TASK-006]
tags: [notion, gf-134, agent-skills]
acceptance:
- agent-skills/core/image-generation/SKILL.md documents when to edit versus generate, and when to stamp versus prompt.
- The skill states that logos and headline text are never described in the prompt, they are stamped.
- The skill stays client-agnostic (uses $CLIENT_SLUG, names no client).
notes:
- Code evidence: agent-skills/core/image-generation/SKILL.md is 285 lines and currently assumes generation only.
- Code evidence: agent-skills/README.md requires editing here, never on the box, and deploying via ./sync-agent-skills.sh <slug>.

### TASK-008: Verify on staging-demo before any production stack
status: todo
owner: claude
agent: claude
reviewer: human
branch: claude/gf-134-image-edit-compositing
area: verification
estimate: M
depends_on: [TASK-004, TASK-005, TASK-006, TASK-007]
tags: [notion, gf-134, verification, staging]
acceptance:
- python -m py_compile passes on the changed plugin file.
- On staging-demo only, hermes tools lists image_compose alongside image_generate.
- An end-to-end Telegram run edits a supplied photo's background with the subject preserved.
- An end-to-end run generates a plate and stamps the real staging-demo logo, with the output inspected visually.
- The former refusal prompt now succeeds.
- biomas, black-venture-farm, gf-innov and marketing-demo are confirmed untouched.
notes:
- Deploy path is deploy-staging/staging-demo-agent plus ./sync-agent-skills.sh staging-demo; never edit /opt/agents/*/plugins directly.
- Deploying this also carries the already-merged GF-69 story support onto the box, since staging is 61 lines behind. Confirm story sizing still behaves after the sync.
- Production stacks are a separate promotion, explicitly out of scope for this plan.

# Instagram branding QA for GF

Use this checklist whenever a GF post is designed for Instagram.

## Hard requirements

- Instagram image format: **1080 × 1350 px** (4:5 portrait).
- Use the **real GF logo asset** already loaded in the client library.
- Do **not** invent a new logo, monogram, or brand identity unless the user explicitly asks for generated branding.
- Keep all text and logo elements inside safe margins so nothing is cut off by Instagram crops or UI overlays.

## Practical checks

- Verify the exported image dimensions before sharing.
- Ensure the logo is legible at mobile size.
- If the logo is too busy or collides with the layout, simplify the placement rather than redrawing the mark.
- Prefer generous whitespace over filling every corner.

## Good fallback behavior

If the available logo asset is awkward for the layout:

1. Reposition the real logo.
2. Resize it conservatively.
3. Add a simple background plate only if needed for contrast.
4. If legibility still fails, redesign the composition around the real logo instead of inventing a substitute.

## Reminder

For GF, the logo is a brand asset, not a decorative element. The design should adapt to the logo, not the other way around.

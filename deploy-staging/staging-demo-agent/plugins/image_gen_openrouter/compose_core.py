"""Pure PIL compositing core for stamping a logo and/or text onto an image.

VENDORED from the `compose-image` Claude skill at
``C:\\Users\\Admin\\.claude\\skills\\compose-image\\scripts\\compose_image.py``.
The plugin runs inside a Docker container and cannot import from that path,
so the pure compositing functions are copied here with the SAME function
names, the SAME anchor/preset vocabulary, and the SAME percent-denominator
semantics (scale is a percent of base WIDTH; margin is per-axis — margin_x
against base WIDTH, margin_y against base HEIGHT). Keep the two files in sync:
if you change behavior here, change it there too (and vice versa).

Differences from the skill script (required to embed this in a tool handler
instead of running it as a CLI):
  - No argparse, no top-level ``main()``, no ``print``.
  - Every failure raises an exception (``ComposeError`` or a normal
    ``OSError``/``ValueError``) instead of calling ``sys.exit``. The plugin
    catches these and turns them into structured error responses — GF-134
    acceptance criterion 5 (a missing logo/font/base image must never raise
    out of the tool handler).
  - ``DEFAULT_FONT_CANDIDATES`` includes Linux font paths (the container is
    Linux) in addition to the Windows paths from the skill script, so a
    fallback font can still be found when no client font is available.
"""

from __future__ import annotations

import os
from typing import List, Optional, Tuple

from PIL import Image, ImageDraw, ImageFont

ANCHORS = [
    "top-left", "top", "top-right",
    "left", "center", "right",
    "bottom-left", "bottom", "bottom-right",
]

PRESETS = {
    "instagram": (1080, 1350),
    "story": (1080, 1920),
    "landscape": (1536, 1024),
    "square": (1024, 1024),
    "portrait": (1024, 1536),
    # GF-143: named channel canvas sizes so callers don't hand-compute pixels.
    "ig_square": (1080, 1080),
    "ig_feed": (1080, 1350),
    "ig_story": (1080, 1920),
    "fb_feed": (1200, 630),
    "fb_story": (1080, 1920),
}

# GF-143: (top_px, bottom_px) insets, in pixels, that composite_logo/
# composite_text will clamp element placement out of when a caller passes
# safe_zone=<preset name>. On a 1080x1920 story canvas Instagram draws its
# own profile-header chrome in the top band and a reply/CTA row in the
# bottom band; 250/340 keeps a stamped logo or caption out of both.
SAFE_ZONES = {name: (0, 0) for name in PRESETS}
SAFE_ZONES["story"] = (250, 340)
SAFE_ZONES["ig_story"] = (250, 340)
SAFE_ZONES["fb_story"] = (250, 340)

# GF-134: the skill's Windows-only candidates plus common Linux container
# paths, so a fallback font resolves whether this runs on a dev box or in
# the Docker image that actually serves the plugin.
DEFAULT_FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arial.ttf",
    r"C:\Windows\Fonts\Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]


class ComposeError(Exception):
    """Raised for any compositing failure (bad file, bad anchor, no font)."""


def parse_measure(value, base_px: int) -> int:
    """'48' -> 48px, '5%' -> percent of base_px."""
    value = str(value).strip()
    if value.endswith("%"):
        return int(round(base_px * float(value[:-1]) / 100.0))
    return int(round(float(value)))


def anchor_xy(base_w, base_h, el_w, el_h, anchor, margin_x, margin_y) -> Tuple[int, int]:
    if anchor not in ANCHORS:
        raise ComposeError(f"Unknown anchor '{anchor}'. Must be one of: {', '.join(ANCHORS)}")

    if anchor in ("top-left", "left", "bottom-left"):
        x = margin_x
    elif anchor in ("top", "center", "bottom"):
        x = (base_w - el_w) // 2
    else:  # top-right, right, bottom-right
        x = base_w - el_w - margin_x

    if anchor in ("top-left", "top", "top-right"):
        y = margin_y
    elif anchor in ("left", "center", "right"):
        y = (base_h - el_h) // 2
    else:  # bottom-left, bottom, bottom-right
        y = base_h - el_h - margin_y

    return x, y


def frame_to_preset(img: Image.Image, preset: str, mode: str = "crop", fill="white") -> Image.Image:
    """Reshape `img` to a named PRESETS size, returning a NEW Image.

    `mode="pad"` letterboxes the whole image onto a `fill`-colored canvas;
    `mode="crop"` scales to cover the target size and center-crops. Matches
    the exact scale/crop arithmetic of `cmd_frame` in the vendored skill
    script (compose_image.py) so the two stay behaviourally identical.
    """
    if preset not in PRESETS:
        raise ComposeError(f"Unknown preset '{preset}'. Must be one of: {', '.join(PRESETS)}")
    target_w, target_h = PRESETS[preset]

    base = img.convert("RGBA")

    if mode == "pad":
        scale = min(target_w / base.width, target_h / base.height)
        new_w = max(1, int(round(base.width * scale)))
        new_h = max(1, int(round(base.height * scale)))
        resized = base.resize((new_w, new_h), Image.LANCZOS)
        canvas = Image.new("RGBA", (target_w, target_h), fill)
        x = (target_w - new_w) // 2
        y = (target_h - new_h) // 2
        canvas.alpha_composite(resized, (x, y))
        return canvas
    elif mode == "crop":
        scale = max(target_w / base.width, target_h / base.height)
        new_w = max(1, int(round(base.width * scale)))
        new_h = max(1, int(round(base.height * scale)))
        resized = base.resize((new_w, new_h), Image.LANCZOS)
        x = (new_w - target_w) // 2
        y = (new_h - target_h) // 2
        return resized.crop((x, y, x + target_w, y + target_h))
    else:
        raise ComposeError(f"Unknown mode '{mode}'. Must be 'pad' or 'crop'")


def _clamp_into_safe_zone(y: int, el_h: int, base_h: int, safe_zone: Optional[str]) -> int:
    """Clamp a computed y into [top_px, base_h - el_h - bottom_px] for the
    given safe_zone preset name. safe_zone=None returns y unchanged (today's
    behavior, pixel-identical). Raises ComposeError for an unknown name.

    Oversized-element behavior: if the element is TALLER than the safe gap
    (high < low — e.g. a huge caption block on a 1080x1920 story canvas,
    where the gap between the 250px top band and 340px bottom band is only
    1330px), this does not raise and does not shrink the element. It
    top-aligns the element at `top_px` and returns that, which means the
    element's bottom edge still overlaps the bottom band. This is a
    deliberate, deterministic choice — the alternative (raising, or silently
    shrinking the caller's element) is worse — but it means the safe zone
    only actually keeps an element OUT of both bands when the element fits
    in the gap; an oversized element is top-aligned, not protected.
    """
    if safe_zone is None:
        return y
    if safe_zone not in SAFE_ZONES:
        raise ComposeError(
            f"Unknown safe_zone '{safe_zone}'. Must be one of: {', '.join(SAFE_ZONES)}"
        )
    top_px, bottom_px = SAFE_ZONES[safe_zone]
    low = top_px
    high = base_h - el_h - bottom_px
    if high < low:
        # Element taller than the safe gap: top-align rather than raise or
        # shrink. See the oversized-element note in this function's
        # docstring above.
        return low
    return min(max(y, low), high)


def resolve_font(font_path, font_dir, size, text_for_fallback_name=None):
    """Resolution order: font_path -> stem match in font_dir -> bundled default.

    Raises ComposeError (instead of sys.exit) when nothing resolves.
    """
    tried = []

    if font_path:
        tried.append(font_path)
        if os.path.exists(font_path):
            return ImageFont.truetype(font_path, size)

    if font_dir and font_path:
        stem = os.path.splitext(os.path.basename(font_path))[0].lower()
        tried.append(f"{font_dir} (stem match for '{stem}')")
        if os.path.isdir(font_dir):
            for fname in os.listdir(font_dir):
                fstem, ext = os.path.splitext(fname)
                if ext.lower() in (".ttf", ".otf") and fstem.lower() == stem:
                    return ImageFont.truetype(os.path.join(font_dir, fname), size)

    for candidate in DEFAULT_FONT_CANDIDATES:
        tried.append(candidate)
        if os.path.exists(candidate):
            return ImageFont.truetype(candidate, size)

    raise ComposeError(
        "Could not resolve a font. Tried, in order: " + " | ".join(tried) +
        ". Pass a font path pointing at a valid .ttf/.otf, or a font_dir containing "
        "one matching the font stem, or install a default fallback font."
    )


def composite_logo(
    base_path: str,
    logo_path: str,
    anchor: str,
    margin="0",
    scale: Optional[str] = None,
    opacity: int = 100,
    safe_zone: Optional[str] = None,
):
    """Stamp `logo_path` onto `base_path`, returning an RGBA PIL Image.

    Raises ComposeError / OSError on a missing or unreadable file. Does not
    write to disk — the caller decides where/how to save.
    """
    try:
        base = Image.open(base_path).convert("RGBA")
    except (OSError, ValueError) as exc:
        raise ComposeError(f"Could not open base image '{base_path}': {exc}") from exc
    try:
        logo = Image.open(logo_path).convert("RGBA")
    except (OSError, ValueError) as exc:
        raise ComposeError(f"Could not open logo image '{logo_path}': {exc}") from exc

    if scale:
        target_w = parse_measure(scale, base.width)
        target_h = int(round(logo.height * (target_w / logo.width)))
        logo = logo.resize((max(1, target_w), max(1, target_h)), Image.LANCZOS)

    if opacity is not None and opacity < 100:
        alpha = logo.getchannel("A")
        alpha = alpha.point(lambda a: int(a * (opacity / 100.0)))
        logo.putalpha(alpha)

    margin_x = parse_measure(margin, base.width) if anchor != "center" else 0
    margin_y = parse_measure(margin, base.height) if anchor != "center" else 0
    x, y = anchor_xy(base.width, base.height, logo.width, logo.height,
                      anchor, margin_x, margin_y)
    y = _clamp_into_safe_zone(y, logo.height, base.height, safe_zone)

    out = base.copy()
    out.alpha_composite(logo, (x, y))
    return out


def wrap_text(draw, text, font, max_width) -> List[str]:
    words = text.split()
    if not words:
        return [""]
    lines = []
    current = words[0]
    for word in words[1:]:
        candidate = current + " " + word
        bbox = draw.textbbox((0, 0), candidate, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def composite_text(
    base_image_or_path,
    text: str,
    font_path: Optional[str] = None,
    font_dir: Optional[str] = None,
    size: int = 48,
    color="white",
    anchor: str = "center",
    margin="5%",
    max_width=None,
    line_spacing: int = 8,
    outline: int = 0,
    outline_color="black",
    shadow: bool = False,
    safe_zone: Optional[str] = None,
):
    """Draw `text` onto a base image, returning an RGBA PIL Image.

    `base_image_or_path` may be a path (str) or an already-open PIL Image
    (so composite_logo's output can be piped straight into this without a
    round-trip through disk). Raises ComposeError / OSError on failure.
    """
    if isinstance(base_image_or_path, Image.Image):
        base = base_image_or_path.convert("RGBA")
    else:
        try:
            base = Image.open(base_image_or_path).convert("RGBA")
        except (OSError, ValueError) as exc:
            raise ComposeError(f"Could not open base image '{base_image_or_path}': {exc}") from exc

    draw = ImageDraw.Draw(base)
    font = resolve_font(font_path, font_dir, size)

    max_w = parse_measure(max_width, base.width) if max_width else base.width
    lines = wrap_text(draw, text, font, max_w)

    line_bboxes = [draw.textbbox((0, 0), line, font=font) for line in lines]
    line_heights = [b[3] - b[1] for b in line_bboxes]
    line_widths = [b[2] - b[0] for b in line_bboxes]
    spacing = line_spacing
    block_w = max(line_widths) if line_widths else 0
    block_h = sum(line_heights) + spacing * (len(lines) - 1) if lines else 0

    margin_x = parse_measure(margin, base.width) if anchor != "center" else 0
    margin_y = parse_measure(margin, base.height) if anchor != "center" else 0
    x0, y0 = anchor_xy(base.width, base.height, block_w, block_h,
                        anchor, margin_x, margin_y)
    y0 = _clamp_into_safe_zone(y0, block_h, base.height, safe_zone)

    # GF-134 (review round 2): draw every glyph onto a transparent overlay and
    # alpha_composite it, rather than drawing straight onto the base.
    # ImageDraw REPLACES pixel values instead of blending them, so laying down
    # semi-transparent ink (the shadow's alpha 160) directly on an RGBA base
    # punches translucent holes through an opaque plate and destroys the
    # imagery underneath instead of darkening it.
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)

    y = y0
    for line, bbox, lh in zip(lines, line_bboxes, line_heights):
        lw = bbox[2] - bbox[0]
        lx = x0 + (block_w - lw) // 2

        if shadow:
            odraw.text((lx + 3, y + 3), line, font=font, fill=(0, 0, 0, 160))

        if outline:
            odraw.text((lx, y), line, font=font, fill=color,
                       stroke_width=outline, stroke_fill=outline_color)
        else:
            odraw.text((lx, y), line, font=font, fill=color)

        y += lh + spacing

    return Image.alpha_composite(base, overlay)


def save(img, out_path: str, base_path: Optional[str] = None) -> None:
    ext = os.path.splitext(out_path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        img.convert("RGB").save(out_path)
    else:
        img.save(out_path)

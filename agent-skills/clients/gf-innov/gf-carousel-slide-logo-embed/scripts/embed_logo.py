#!/usr/bin/env python3
"""Composite the official GF dark-bg logo onto a generated carousel slide.

Usage: python embed_logo.py <slide_in.png> <slide_out.png> [logo.jpg]

Why: image_generate (gemini flash image) reliably invents a FAKE GF logo.
So generate the slide text WITHOUT a logo (and without brand words), then run
this to stamp the real logo top-left, recoloring its background so no box shows.
"""
import sys
from PIL import Image, ImageDraw

DEFAULT_LOGO = "/opt/marketing-planner/client/assets/gf_logo_official_dark.jpg"


def embed_logo(slide_path, out_path, logo_src=DEFAULT_LOGO,
               width_frac=0.26, x_frac=0.06, y_frac=0.045):
    slide = Image.open(slide_path).convert("RGB")
    W, H = slide.size
    # sample slide bg well away from logo/text/footer
    bg = slide.load()[W // 2, int(H * 0.20)]

    logo = Image.open(logo_src).convert("RGB")
    lpx = logo.load()
    lw, lh = logo.size
    # recolor near-charcoal logo bg pixels to the slide bg so no box edge shows.
    # threshold <55 keeps bright green + white logo marks intact.
    for y in range(lh):
        for x in range(lw):
            r, g, b = lpx[x, y]
            if r < 55 and g < 55 and b < 55:
                lpx[x, y] = bg

    target_w = int(W * width_frac)
    scale = target_w / lw
    logo2 = logo.resize((target_w, int(lh * scale)), getattr(Image, 'Resampling', Image).LANCZOS)
    lw2, lh2 = logo2.size

    # wipe any stray fake mark first, then paste the real logo
    d = ImageDraw.Draw(slide)
    d.rectangle([0, 0, int(W * x_frac) + lw2 + 60, int(H * y_frac) + lh2 + 60], fill=bg)
    slide.paste(logo2, (int(W * x_frac), int(H * y_frac)))
    slide.save(out_path)
    return out_path, slide.size


if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    logo = sys.argv[3] if len(sys.argv) > 3 else DEFAULT_LOGO
    print(embed_logo(src, out, logo))

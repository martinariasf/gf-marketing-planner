"""Unit tests for GF-143 TASK-001: extend PRESETS with the five channel sizes,
add a SAFE_ZONES table, add frame_to_preset(), and let composite_logo /
composite_text accept an optional safe_zone that clamps placement into the
story-safe band.

Pure compose_core tests — no Hermes-runtime stubbing needed since this module
only imports stdlib + PIL (see compose_core.py's own docstring). Run with:

    python -m pytest -q deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/test_gf143_canvas_presets.py

or as part of the full-suite `python -m pytest -q` from this directory.
"""

import importlib.util
import os
import unittest

from PIL import Image

# Load compose_core.py directly by path (not `import compose_core`) so pytest
# never has to import this package's __init__.py first — that file pulls in
# httpx/agent.* Hermes-runtime deps that aren't installed on a bare box.
# Mirrors the by-path-loading pattern test_story_aspect.py uses for __init__.py.
_spec = importlib.util.spec_from_file_location(
    "compose_core_under_test",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "compose_core.py"),
)
cc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cc)


def _img(w, h, color=(255, 0, 0, 255)):
    return Image.new("RGBA", (w, h), color)


class LegacyPresetsUnchangedTests(unittest.TestCase):
    def test_legacy_preset_tuples_are_byte_identical(self):
        self.assertEqual(cc.PRESETS["instagram"], (1080, 1350))
        self.assertEqual(cc.PRESETS["story"], (1080, 1920))
        self.assertEqual(cc.PRESETS["landscape"], (1536, 1024))
        self.assertEqual(cc.PRESETS["square"], (1024, 1024))
        self.assertEqual(cc.PRESETS["portrait"], (1024, 1536))


class NewPresetsTests(unittest.TestCase):
    def test_new_preset_tuples(self):
        self.assertEqual(cc.PRESETS["ig_square"], (1080, 1080))
        self.assertEqual(cc.PRESETS["ig_feed"], (1080, 1350))
        self.assertEqual(cc.PRESETS["ig_story"], (1080, 1920))
        self.assertEqual(cc.PRESETS["fb_feed"], (1200, 630))
        self.assertEqual(cc.PRESETS["fb_story"], (1080, 1920))


class SafeZonesTests(unittest.TestCase):
    def test_story_presets_have_the_instagram_ui_band(self):
        self.assertEqual(cc.SAFE_ZONES["story"], (250, 340))
        self.assertEqual(cc.SAFE_ZONES["ig_story"], (250, 340))
        self.assertEqual(cc.SAFE_ZONES["fb_story"], (250, 340))

    def test_other_presets_have_no_safe_zone(self):
        for name in ("instagram", "landscape", "square", "portrait",
                     "ig_square", "ig_feed", "fb_feed"):
            self.assertEqual(cc.SAFE_ZONES[name], (0, 0))


class FrameToPresetTests(unittest.TestCase):
    def test_each_preset_size_in_crop_mode(self):
        base = _img(500, 500)
        for name, (w, h) in cc.PRESETS.items():
            out = cc.frame_to_preset(base, name, mode="crop")
            self.assertEqual(out.size, (w, h), name)

    def test_each_preset_size_in_pad_mode(self):
        base = _img(500, 500)
        for name, (w, h) in cc.PRESETS.items():
            out = cc.frame_to_preset(base, name, mode="pad")
            self.assertEqual(out.size, (w, h), name)

    def test_unknown_preset_raises_compose_error_naming_valid_keys(self):
        base = _img(100, 100)
        with self.assertRaises(cc.ComposeError) as ctx:
            cc.frame_to_preset(base, "linkedin_banner", mode="crop")
        msg = str(ctx.exception)
        for key in cc.PRESETS:
            self.assertIn(key, msg)

    def test_unknown_mode_raises_compose_error(self):
        base = _img(100, 100)
        with self.assertRaises(cc.ComposeError):
            cc.frame_to_preset(base, "square", mode="stretch")

    def test_pad_matches_skill_cli_math_exactly(self):
        # Mirrors cmd_frame's pad arithmetic in the vendored skill script:
        # scale = min(target/base), center on a fill canvas.
        base = _img(1000, 500)
        out = cc.frame_to_preset(base, "ig_square", mode="pad", fill="white")
        self.assertEqual(out.size, (1080, 1080))
        # scale = min(1080/1000, 1080/500) = 1.08 -> new size (1080, 540)
        # centered vertically: y offset = (1080-540)//2 = 270
        # so pixel at (0, 0) should be the fill color, not the base color.
        self.assertEqual(out.convert("RGB").getpixel((0, 0)), (255, 255, 255))

    def test_crop_matches_skill_cli_math_exactly(self):
        base = _img(1000, 500)
        out = cc.frame_to_preset(base, "ig_square", mode="crop")
        self.assertEqual(out.size, (1080, 1080))
        # scale = max(1080/1000, 1080/500) = 2.16 -> new size (2160, 1080)
        # crop x offset = (2160-1080)//2 = 540, y offset = 0 -> whole image is
        # base color everywhere (no fill visible in crop mode).
        self.assertEqual(out.convert("RGB").getpixel((0, 0)), (255, 0, 0))


class SafeZoneClampingTests(unittest.TestCase):
    """composite_logo/composite_text with safe_zone=None must be byte-identical
    to current (pre-GF-143) behavior; a preset name must clamp y into range."""

    def setUp(self):
        self.tmpdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_tmp_gf143")
        os.makedirs(self.tmpdir, exist_ok=True)
        self.base_path = os.path.join(self.tmpdir, "base.png")
        self.logo_path = os.path.join(self.tmpdir, "logo.png")
        _img(1080, 1920, (10, 20, 30, 255)).save(self.base_path)
        _img(100, 60, (200, 200, 200, 255)).save(self.logo_path)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def _logo_bbox(self, out_img, bg=(10, 20, 30, 255)):
        # Find the bounding box of non-background pixels (the stamped logo).
        px = out_img.load()
        w, h = out_img.size
        min_x, min_y, max_x, max_y = w, h, -1, -1
        for y in range(h):
            for x in range(w):
                if px[x, y] != bg:
                    min_x, min_y = min(min_x, x), min(min_y, y)
                    max_x, max_y = max(max_x, x), max(max_y, y)
        return min_x, min_y, max_x, max_y

    def test_safe_zone_none_is_byte_identical_to_default(self):
        out_default = cc.composite_logo(
            self.base_path, self.logo_path, anchor="bottom", margin="0")
        out_explicit_none = cc.composite_logo(
            self.base_path, self.logo_path, anchor="bottom", margin="0", safe_zone=None)
        self.assertEqual(list(out_default.getdata()), list(out_explicit_none.getdata()))

    def test_bottom_anchored_logo_without_safe_zone_sits_at_the_very_bottom(self):
        out = cc.composite_logo(self.base_path, self.logo_path, anchor="bottom", margin="0")
        _, _, _, max_y = self._logo_bbox(out)
        # base height 1920, logo height 60 -> bottom edge at y=1919 (no margin)
        self.assertEqual(max_y, 1919)

    def test_ig_story_safe_zone_pushes_bottom_anchored_logo_above_the_band(self):
        out = cc.composite_logo(
            self.base_path, self.logo_path, anchor="bottom", margin="0",
            safe_zone="ig_story")
        _, _, _, max_y = self._logo_bbox(out)
        # bottom_px = 340 -> logo bottom edge must be at/above 1920-340=1580
        self.assertLessEqual(max_y, 1580)

    def test_unknown_safe_zone_raises_compose_error(self):
        with self.assertRaises(cc.ComposeError):
            cc.composite_logo(
                self.base_path, self.logo_path, anchor="bottom", margin="0",
                safe_zone="not_a_real_preset")


if __name__ == "__main__":
    unittest.main()

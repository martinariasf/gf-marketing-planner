"""Unit tests for GF-143 TASK-002: image_compose gains a `canvas` param that
frames the base image to a named channel preset (compose_core.frame_to_preset)
BEFORE any logo/text stamping, and automatically passes safe_zone= for the
story presets.

Mirrors the stubbing pattern of test_gf134_review_fixes.py so __init__.py
loads standalone without the Hermes-only `agent`/`httpx` deps. Run with:

    python -m unittest test_gf143_image_compose_canvas -v
"""

import importlib.util
import io
import json
import os
import shutil
import sys
import tempfile
import types
import unittest

from PIL import Image


# --- stub the Hermes-only imports so the module loads standalone -------------

class _FakeHTTPStatusError(Exception):
    def __init__(self, response=None):
        super().__init__("fake http status error")
        self.response = response


class _FakeClient:
    def __init__(self, *_a, **_k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False

    def post(self, *_a, **_k):
        raise AssertionError("no network call expected in these tests")

    def get(self, *_a, **_k):
        raise AssertionError("no network call expected in these tests")


_httpx = types.ModuleType("httpx")
_httpx.Client = _FakeClient
_httpx.HTTPStatusError = _FakeHTTPStatusError
sys.modules.setdefault("httpx", _httpx)

_agent = types.ModuleType("agent")
_provider = types.ModuleType("agent.image_gen_provider")
_provider.DEFAULT_ASPECT_RATIO = "1:1"
_provider.ImageGenProvider = type("ImageGenProvider", (), {})
_provider.error_response = lambda **k: {"success": False, "image": None, **k}
_provider.resolve_aspect_ratio = lambda *a, **k: "1:1"
_provider.save_b64_image = lambda *a, **k: "/tmp/fake_generated.png"
_provider.success_response = lambda **k: {"success": True, **k}
_agent.image_gen_provider = _provider
sys.modules.setdefault("agent", _agent)
sys.modules.setdefault("agent.image_gen_provider", _provider)

_spec = importlib.util.spec_from_file_location(
    "image_gen_openrouter_gf143_canvas_under_test",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "__init__.py"),
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)


def _real_png_bytes(w, h, color=(255, 0, 0, 255)):
    buf = io.BytesIO()
    Image.new("RGBA", (w, h), color).save(buf, format="PNG")
    return buf.getvalue()


class _BaseCanvasTest(unittest.TestCase):
    def setUp(self):
        self._tmp_home = tempfile.mkdtemp(prefix="gf143-canvas-test-home-")
        self._had_home = "HERMES_HOME" in os.environ
        self._old_home = os.environ.get("HERMES_HOME")
        os.environ["HERMES_HOME"] = self._tmp_home

        self._orig_resolve_bytes = _mod._resolve_image_bytes
        self._orig_publish = _mod._publish_reserve_image
        self._orig_branding_refs = _mod._branding_logo_refs

        self._base_bytes = _real_png_bytes(500, 500, (255, 0, 0, 255))
        _mod._resolve_image_bytes = lambda ref: self._base_bytes
        _mod._publish_reserve_image = lambda ref: {
            "published": True, "url": "https://example.com/x.png"
        }
        _mod._branding_logo_refs = lambda: []

    def tearDown(self):
        if self._had_home:
            os.environ["HERMES_HOME"] = self._old_home
        else:
            os.environ.pop("HERMES_HOME", None)
        shutil.rmtree(self._tmp_home, ignore_errors=True)
        _mod._resolve_image_bytes = self._orig_resolve_bytes
        _mod._publish_reserve_image = self._orig_publish
        _mod._branding_logo_refs = self._orig_branding_refs


class CanvasFramesOutputSizeTests(_BaseCanvasTest):
    def test_fb_feed_canvas_produces_1200x630(self):
        raw = _mod._handle_image_compose({
            "base_image": "https://example.com/base.png",
            "include_logo": False,
            "text": "hello",
            "canvas": "fb_feed",
        })
        result = json.loads(raw)
        self.assertTrue(result.get("success"), result)
        with Image.open(result["path"]) as img:
            self.assertEqual(img.size, (1200, 630))

    def test_ig_story_canvas_produces_1080x1920(self):
        raw = _mod._handle_image_compose({
            "base_image": "https://example.com/base.png",
            "include_logo": False,
            "text": "hello",
            "canvas": "ig_story",
        })
        result = json.loads(raw)
        self.assertTrue(result.get("success"), result)
        with Image.open(result["path"]) as img:
            self.assertEqual(img.size, (1080, 1920))


class CanvasOmittedIsByteIdenticalTests(_BaseCanvasTest):
    def test_no_canvas_key_matches_explicit_canvas_none(self):
        args_common = {
            "base_image": "https://example.com/base.png",
            "include_logo": False,
            "text": "hello",
        }
        raw_a = _mod._handle_image_compose(dict(args_common))
        result_a = json.loads(raw_a)
        raw_b = _mod._handle_image_compose(dict(args_common, canvas=None))
        result_b = json.loads(raw_b)

        self.assertTrue(result_a.get("success"), result_a)
        self.assertTrue(result_b.get("success"), result_b)
        with Image.open(result_a["path"]) as img_a, Image.open(result_b["path"]) as img_b:
            self.assertEqual(img_a.size, img_b.size)
            self.assertEqual(list(img_a.convert("RGBA").getdata()),
                              list(img_b.convert("RGBA").getdata()))

    def test_no_canvas_key_size_stays_the_original_base_size(self):
        raw = _mod._handle_image_compose({
            "base_image": "https://example.com/base.png",
            "include_logo": False,
            "text": "hello",
        })
        result = json.loads(raw)
        self.assertTrue(result.get("success"), result)
        with Image.open(result["path"]) as img:
            # base image fixture is 500x500 and no canvas was requested, so
            # the composed output must stay 500x500 (untouched by framing).
            self.assertEqual(img.size, (500, 500))


class BogusCanvasReturnsStructuredErrorTests(_BaseCanvasTest):
    def test_unknown_canvas_name_returns_structured_error_not_raise(self):
        try:
            raw = _mod._handle_image_compose({
                "base_image": "https://example.com/base.png",
                "include_logo": False,
                "text": "hello",
                "canvas": "linkedin_banner_totally_bogus",
            })
        except Exception as exc:  # pragma: no cover - the assertion is the point
            self.fail(f"_handle_image_compose raised instead of returning a "
                      f"structured error: {exc!r}")
        result = json.loads(raw)
        self.assertFalse(result.get("success"))
        self.assertIsNotNone(result.get("error_type"))
        self.assertIn("linkedin_banner_totally_bogus", result.get("error", ""))


class StoryCanvasPassesSafeZoneTests(_BaseCanvasTest):
    def setUp(self):
        super().setUp()
        _mod._branding_logo_refs = lambda: ["https://example.com/logo.png"]
        self._logo_bytes = _real_png_bytes(50, 50, (0, 255, 0, 255))

        def fake_resolve(ref):
            if "logo" in str(ref):
                return self._logo_bytes
            return self._base_bytes

        _mod._resolve_image_bytes = fake_resolve

        self._orig_composite_logo = _mod.compose_core.composite_logo
        self._orig_composite_text = _mod.compose_core.composite_text
        self.logo_calls = []
        self.text_calls = []

        def fake_composite_logo(*a, **k):
            self.logo_calls.append(k)
            return Image.new("RGBA", (1080, 1920), (1, 2, 3, 255))

        def fake_composite_text(*a, **k):
            self.text_calls.append(k)
            base = a[0] if a else k.get("base_image_or_path")
            if isinstance(base, Image.Image):
                return base
            return Image.new("RGBA", (1080, 1920), (1, 2, 3, 255))

        _mod.compose_core.composite_logo = fake_composite_logo
        _mod.compose_core.composite_text = fake_composite_text

    def tearDown(self):
        _mod.compose_core.composite_logo = self._orig_composite_logo
        _mod.compose_core.composite_text = self._orig_composite_text
        super().tearDown()

    def test_ig_story_canvas_passes_safe_zone_to_logo_and_text(self):
        raw = _mod._handle_image_compose({
            "base_image": "https://example.com/base.png",
            "include_logo": True,
            "text": "hello",
            "canvas": "ig_story",
        })
        result = json.loads(raw)
        self.assertTrue(result.get("success"), result)
        self.assertEqual(len(self.logo_calls), 1)
        self.assertEqual(len(self.text_calls), 1)
        self.assertEqual(self.logo_calls[0].get("safe_zone"), "ig_story")
        self.assertEqual(self.text_calls[0].get("safe_zone"), "ig_story")

    def test_non_story_canvas_does_not_pass_safe_zone(self):
        raw = _mod._handle_image_compose({
            "base_image": "https://example.com/base.png",
            "include_logo": True,
            "text": "hello",
            "canvas": "fb_feed",
        })
        result = json.loads(raw)
        self.assertTrue(result.get("success"), result)
        self.assertIsNone(self.logo_calls[0].get("safe_zone"))
        self.assertIsNone(self.text_calls[0].get("safe_zone"))


if __name__ == "__main__":
    unittest.main()

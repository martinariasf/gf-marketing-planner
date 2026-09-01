"""Unit tests for the GF-134 independent-review round-2 fixes:

  1. edit=False produces the legacy composite directive; edit=True produces
     the PHOTO EDIT directive and NOT the composite one; no reference_images
     produces neither directive either way.
  2. image_compose works with OPENROUTER_API_KEY removed from the environment.
  3. The logo_reference_required refusal still fires with its exact original
     message and error_type when no logo is available and no caller refs
     are passed.
  4. FIX 1 regression: the internal auto-stamp call (image_generate's
     wants_logo path) does NOT publish a reserve asset for the intermediate
     plate — only the outer flow's own publish/link runs.
  5. FIX 4 regression: edit=true + "logo" mentioned in the prompt does NOT
     trigger the auto-stamp (and does not alter the edit prompt).

Mirrors the exact stubbing pattern used by test_story_aspect.py in this same
directory. Requires Pillow (compose_core imports it); run it with the
plugin venv's Python, not a bare interpreter:

    python -m unittest deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/test_gf134_review_fixes.py

NOTE ON CI: as of this writing there is no CI/workflow step that runs pytest
or `python -m unittest` for this plugin (see test_story_aspect.py's header for
the audit). This file, like its siblings, is currently only ever run by hand.
"""

import importlib.util
import json
import os
import shutil
import tempfile
import sys
import types
import unittest


# --- stub the Hermes-only imports so the module loads standalone -------------

class _FakeHTTPStatusError(Exception):
    def __init__(self, response=None):
        super().__init__("fake http status error")
        self.response = response


class _FakeResponse:
    def __init__(self, body, content=b"\x89PNG\r\n\x1a\nfakebytes"):
        self._body = body
        self.content = content

    def raise_for_status(self):
        pass

    def json(self):
        return self._body


class _FakeClient:
    """Records every POST payload so tests can inspect the prompt text sent
    to OpenRouter, without making a real network call."""

    captured_payloads = []

    def __init__(self, *_a, **_k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False

    def post(self, _url, json=None, headers=None):  # noqa: A002 - matches httpx signature
        _FakeClient.captured_payloads.append(json)
        return _FakeResponse({
            "choices": [{
                "message": {
                    "content": [{
                        "type": "image_url",
                        "image_url": {"url": "data:image/png;base64,AAAA"},
                    }],
                },
            }],
        })

    def get(self, _url, headers=None):
        return _FakeResponse({})


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
    "image_gen_openrouter_gf134_review_under_test",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "__init__.py"),
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)


class EditVsCompositeDirectiveTests(unittest.TestCase):
    """Assertion 1 of FIX 7: edit=False/True/no-refs directive text."""

    def setUp(self):
        _FakeClient.captured_payloads = []
        os.environ["OPENROUTER_API_KEY"] = "fake-key-for-tests"

    def tearDown(self):
        os.environ.pop("OPENROUTER_API_KEY", None)

    def _sent_text(self):
        payload = _FakeClient.captured_payloads[-1]
        content = payload["messages"][0]["content"]
        return content[0]["text"]

    def test_edit_false_produces_legacy_composite_directive(self):
        _mod.OpenRouterImageGenProvider().generate(
            prompt="place the logo on the poster",
            reference_images=["https://example.com/logo.png"],
            edit=False,
        )
        text = self._sent_text()
        self.assertIn("Reproduce them", text)
        self.assertIn("composite the provided brand", text)
        self.assertNotIn("PHOTO EDIT", text)

    def test_edit_true_produces_photo_edit_directive_not_composite(self):
        _mod.OpenRouterImageGenProvider().generate(
            prompt="swap the background to a studio backdrop",
            reference_images=["https://example.com/client_photo.jpg"],
            edit=True,
        )
        text = self._sent_text()
        self.assertIn("PHOTO EDIT", text)
        self.assertIn("preserve the subject exactly", text)
        self.assertNotIn("composite the provided brand", text)

    def test_no_refs_produces_neither_directive_regardless_of_edit(self):
        for edit_flag in (False, True):
            _FakeClient.captured_payloads = []
            _mod.OpenRouterImageGenProvider().generate(
                prompt="a plain scene with no references",
                reference_images=[],
                edit=edit_flag,
            )
            text = self._sent_text()
            self.assertNotIn("PHOTO EDIT", text)
            self.assertNotIn("composite the provided brand", text)
            self.assertEqual(text, "a plain scene with no references")


class ComposeWorksWithoutApiKeyTests(unittest.TestCase):
    """Assertion 2 of FIX 7: image_compose has no OPENROUTER_API_KEY gate."""

    def setUp(self):
        self._had_key = "OPENROUTER_API_KEY" in os.environ
        self._old_key = os.environ.pop("OPENROUTER_API_KEY", None)
        # Review round 2 (N5c): this test reaches the real compose cache dir
        # ($HERMES_HOME/cache/images), so isolate it from the developer's
        # ~/.hermes the same way the auto-stamp test does.
        self._tmp_home = tempfile.mkdtemp(prefix="gf134-test-home-")
        self._had_home = "HERMES_HOME" in os.environ
        self._old_home = os.environ.get("HERMES_HOME")
        os.environ["HERMES_HOME"] = self._tmp_home

    def tearDown(self):
        if self._had_key:
            os.environ["OPENROUTER_API_KEY"] = self._old_key
        if self._had_home:
            os.environ["HERMES_HOME"] = self._old_home
        else:
            os.environ.pop("HERMES_HOME", None)
        shutil.rmtree(self._tmp_home, ignore_errors=True)

    def test_missing_api_key_does_not_block_compose(self):
        """The compose path must RUN with no key, not just fail differently.

        Review round 2 (N2): the earlier version of this test passed
        include_logo=False and text="", which tripped the "nothing to compose"
        guard and returned before touching any compositing code — it would
        have passed even if the whole compose path crashed without a key.
        This version drives a REAL text stamp all the way through
        compose_core and asserts the composite actually happened.
        """
        self.assertIsNone(os.environ.get("OPENROUTER_API_KEY"))

        composited = {"called": False}
        orig_bytes = _mod._resolve_image_bytes
        orig_text = _mod.compose_core.composite_text
        orig_save = _mod.compose_core.save
        orig_publish = _mod._publish_reserve_image
        orig_font = _mod._resolve_font_path_from_name

        def fake_composite_text(*a, **k):
            # Fails loudly if the compose path ever starts requiring a key.
            self.assertIsNone(os.environ.get("OPENROUTER_API_KEY"))
            composited["called"] = True
            return object()

        _mod._resolve_image_bytes = lambda ref: b"\x89PNG\r\n\x1a\nfakebytes"
        _mod.compose_core.composite_text = fake_composite_text
        _mod.compose_core.save = lambda img, path: open(path, "wb").close()
        _mod._publish_reserve_image = lambda ref: {"published": True,
                                                   "url": "https://example.com/x.png"}
        _mod._resolve_font_path_from_name = lambda name: None
        try:
            raw = _mod._handle_image_compose({
                "base_image": "https://example.com/base.png",
                "include_logo": False,
                "text": "hello",
            })
        finally:
            _mod._resolve_image_bytes = orig_bytes
            _mod.compose_core.composite_text = orig_text
            _mod.compose_core.save = orig_save
            _mod._publish_reserve_image = orig_publish
            _mod._resolve_font_path_from_name = orig_font

        result = json.loads(raw)
        # The stamp path was genuinely entered — past the "nothing to
        # compose" guard — with no API key present.
        self.assertTrue(composited["called"],
                        "compose_core.composite_text was never reached; the "
                        "test did not get past the guard clause")
        self.assertTrue(result.get("success"), result)
        self.assertNotEqual(result.get("error_type"), "auth_required")


class LogoReferenceRequiredRefusalTests(unittest.TestCase):
    """Assertion 3 of FIX 7: the frozen refusal message/error_type."""

    EXPECTED_MESSAGE = (
        "This image asks for the brand logo/isotipo, but no official "
        "logo file is available (none in branding.logos and none passed "
        "via reference_images). I will NOT invent a fake logo. Provide "
        "the official logo file (reference_images=[\"logo_official.png\"], "
        "an asset filename, or a URL), or ask me to generate the image "
        "WITHOUT a logo (e.g. leave clean space for it)."
    )

    def setUp(self):
        os.environ["OPENROUTER_API_KEY"] = "fake-key-for-tests"
        self._orig_branding = _mod._branding_logo_refs
        _mod._branding_logo_refs = lambda: []

    def tearDown(self):
        os.environ.pop("OPENROUTER_API_KEY", None)
        _mod._branding_logo_refs = self._orig_branding

    def test_refusal_message_and_error_type_are_unchanged(self):
        raw = _mod._handle_image_generate({
            "prompt": "generate a poster with our logo on it",
        })
        result = json.loads(raw)
        self.assertFalse(result["success"])
        self.assertEqual(result["error_type"], "logo_reference_required")
        self.assertEqual(result["error"], self.EXPECTED_MESSAGE)


class AutoStampDoesNotPublishReserveAssetTests(unittest.TestCase):
    """FIX 1 regression: the internal auto-stamp call to _handle_image_compose
    must NOT write a reserve manifest entry / publish for the intermediate
    plate — only the outer image_generate flow publishes the final image."""

    def setUp(self):
        os.environ["OPENROUTER_API_KEY"] = "fake-key-for-tests"
        os.environ["CLIENT_SLUG"] = "test-client"
        # Review round 2 (N5c): the compose cache dir is $HERMES_HOME/cache/
        # images, so without this the test writes a real file into the
        # developer's ~/.hermes. Point HERMES_HOME at a temp dir instead.
        self._tmp_home = tempfile.mkdtemp(prefix="gf134-test-home-")
        self._had_home = "HERMES_HOME" in os.environ
        self._old_home = os.environ.get("HERMES_HOME")
        os.environ["HERMES_HOME"] = self._tmp_home
        self._orig_branding = _mod._branding_logo_refs
        self._orig_generate = _mod.OpenRouterImageGenProvider.generate
        self._orig_compose_publish = _mod._publish_reserve_image

        _mod._branding_logo_refs = lambda: ["https://example.com/logo.png"]
        self.publish_calls = []

        def fake_generate(_self, prompt, aspect_ratio=None, model=None, **kwargs):
            return {"success": True, "image": "/tmp/fake_plate.png"}

        def fake_publish_reserve(image_ref):
            self.publish_calls.append(image_ref)
            return {"published": True, "url": "https://example.com/gen_123.png"}

        # image_compose itself needs to run without hitting real image bytes;
        # stub the byte/font resolution and compositing so only the
        # publish-skip behavior is under test.
        self._orig_resolve_bytes = _mod._resolve_image_bytes
        _mod._resolve_image_bytes = lambda ref: b"\x89PNG\r\n\x1a\nfakebytes"
        self._orig_composite_logo = _mod.compose_core.composite_logo
        _mod.compose_core.composite_logo = lambda *a, **k: object()
        self._orig_save = _mod.compose_core.save
        _mod.compose_core.save = lambda img, path: open(path, "wb").close()

        _mod.OpenRouterImageGenProvider.generate = fake_generate
        _mod._publish_reserve_image = fake_publish_reserve

    def tearDown(self):
        os.environ.pop("OPENROUTER_API_KEY", None)
        os.environ.pop("CLIENT_SLUG", None)
        if self._had_home:
            os.environ["HERMES_HOME"] = self._old_home
        else:
            os.environ.pop("HERMES_HOME", None)
        shutil.rmtree(self._tmp_home, ignore_errors=True)
        _mod._branding_logo_refs = self._orig_branding
        _mod.OpenRouterImageGenProvider.generate = self._orig_generate
        _mod._publish_reserve_image = self._orig_compose_publish
        _mod._resolve_image_bytes = self._orig_resolve_bytes
        _mod.compose_core.composite_logo = self._orig_composite_logo
        _mod.compose_core.save = self._orig_save

    def test_internal_stamp_skips_publish_outer_flow_publishes_once(self):
        raw = _mod._handle_image_generate({
            "prompt": "a poster with our logo on it",
        })
        result = json.loads(raw)
        self.assertTrue(result.get("logo_composited"))
        # _publish_reserve_image must have been called exactly ONCE — by the
        # outer image_generate flow for the final composited image, never by
        # the internal image_compose call for the intermediate plate.
        self.assertEqual(len(self.publish_calls), 1)


class EditModeDoesNotAutoStampLogoTests(unittest.TestCase):
    """FIX 4 regression: edit=true + "logo" in the prompt must not trigger
    the plate-space instruction or the auto-stamp."""

    def setUp(self):
        os.environ["OPENROUTER_API_KEY"] = "fake-key-for-tests"
        self._orig_branding = _mod._branding_logo_refs
        self._orig_generate = _mod.OpenRouterImageGenProvider.generate
        self._orig_compose = _mod._handle_image_compose

        _mod._branding_logo_refs = lambda: ["https://example.com/logo.png"]
        self.captured = {}
        self.compose_called = []

        def fake_generate(_self, prompt, aspect_ratio=None, model=None, **kwargs):
            self.captured["prompt"] = prompt
            return {"success": True, "image": "/tmp/fake_edit_result.png"}

        def fake_compose(args, **_kw):
            self.compose_called.append(args)
            return json.dumps({"success": True, "image": "/tmp/should-not-run.png"})

        _mod.OpenRouterImageGenProvider.generate = fake_generate
        _mod._handle_image_compose = fake_compose

    def tearDown(self):
        os.environ.pop("OPENROUTER_API_KEY", None)
        _mod._branding_logo_refs = self._orig_branding
        _mod.OpenRouterImageGenProvider.generate = self._orig_generate
        _mod._handle_image_compose = self._orig_compose

    def test_edit_with_logo_mention_does_not_stamp_or_alter_prompt(self):
        raw = _mod._handle_image_generate({
            "prompt": "remove the logo from this photo",
            "reference_images": ["https://example.com/client_photo.jpg"],
            "edit": True,
        })
        result = json.loads(raw)
        self.assertNotIn("logo_composited", result)
        self.assertEqual(self.compose_called, [])
        # The edit prompt itself must reach generate() unmodified by the
        # plate-space instruction (which is skipped for edit=true).
        self.assertNotIn("Leave clean, uncluttered negative space", self.captured["prompt"])


if __name__ == "__main__":
    unittest.main()

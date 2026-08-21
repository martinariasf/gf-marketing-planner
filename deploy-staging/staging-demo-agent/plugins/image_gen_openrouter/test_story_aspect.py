"""Unit tests for GF-69 story-aspect resolution:
  1. _resolve_image_aspect() — an explicit story aspect (and its aliases) beats
     the channel default, while a channel-only call is unchanged (GF-33).
  2. _handle_image_generate() — a post_id whose stored `format` is "story"
     resolves 1080x1920 with no aspect_ratio passed by the caller, and a
     post_id with any other format still resolves the channel default.

The plugin module imports Hermes-runtime packages (httpx, agent.*) at the top,
so those are stubbed before loading the module by path — this file must run on
any box with a bare Python 3:

    python -m unittest deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/test_story_aspect.py

(or `python test_story_aspect.py` from this directory). Mirrors the exact
stubbing pattern used by test_append_manifest.py in this same directory.

NOTE ON CI: as of this writing there is no CI/workflow step that runs pytest
or `python -m unittest` for this plugin (checked .github/workflows/*.yml —
deploy-staging.yml only builds/rsyncs the SPA and syncs deploy-staging config;
there is no test step for either the Node API or this Python plugin). This
file, like test_append_manifest.py and plugins/drive/test_drive.py, is
currently only ever run by hand.
"""

import importlib.util
import json
import os
import sys
import types
import unittest

# --- stub the Hermes-only imports so the module loads standalone -------------
sys.modules.setdefault("httpx", types.ModuleType("httpx"))
_agent = types.ModuleType("agent")
_provider = types.ModuleType("agent.image_gen_provider")
_provider.DEFAULT_ASPECT_RATIO = "1:1"
_provider.ImageGenProvider = type("ImageGenProvider", (), {})
_provider.error_response = lambda *a, **k: {}
_provider.resolve_aspect_ratio = lambda *a, **k: "1:1"
_provider.save_b64_image = lambda *a, **k: ""
_provider.success_response = lambda *a, **k: {}
_agent.image_gen_provider = _provider
sys.modules.setdefault("agent", _agent)
sys.modules.setdefault("agent.image_gen_provider", _provider)

_spec = importlib.util.spec_from_file_location(
    "image_gen_openrouter_story_aspect_under_test",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "__init__.py"),
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)


class ResolveImageAspectTests(unittest.TestCase):
    """AC1/AC2 of TASK-006 — the resolver itself, no post_id involved."""

    def test_explicit_story_beats_instagram_channel(self):
        # This is the trap the round-1 review flagged: before the fix, the
        # channel check ran first and would have returned portrait_4_5 here.
        self.assertEqual(_mod._resolve_image_aspect("story", "instagram"), "story")

    def test_story_aliases_also_beat_instagram_channel(self):
        self.assertEqual(_mod._resolve_image_aspect("portrait_9_16", "instagram"), "story")
        self.assertEqual(_mod._resolve_image_aspect("9:16", "instagram"), "story")

    def test_story_resolves_to_the_1080x1920_size(self):
        aspect = _mod._resolve_image_aspect("story", "instagram")
        self.assertEqual(_mod._ASPECT_TO_SIZE[aspect], "1080x1920")

    def test_channel_only_instagram_is_unchanged_gf33(self):
        # No explicit story aspect -> the channel still wins -> 4:5 feed image.
        aspect = _mod._resolve_image_aspect(_provider.DEFAULT_ASPECT_RATIO, "instagram")
        self.assertEqual(aspect, "portrait_4_5")
        self.assertEqual(_mod._ASPECT_TO_SIZE[aspect], "1080x1350")

    def test_channel_only_linkedin_is_unchanged(self):
        aspect = _mod._resolve_image_aspect(_provider.DEFAULT_ASPECT_RATIO, "linkedin")
        self.assertEqual(aspect, "landscape")


class ImplicitStoryFromPostIdTests(unittest.TestCase):
    """AC4 of TASK-006 — post_id whose stored format is "story" resolves
    1080x1920 with the caller passing no aspect_ratio at all; a post_id with
    any other format falls through to the ordinary channel default.

    _fetch_post and the provider's generate() are monkeypatched so this stays
    a pure unit test — no real HTTP/network call is made. CLIENT_SLUG /
    API_BASE / API_TOKEN are also unset in this process, so even without the
    monkeypatch the plugin's own env guards would no-op any network calls.
    """

    def setUp(self):
        self._orig_fetch_post = _mod._fetch_post
        self._orig_generate = _mod.OpenRouterImageGenProvider.generate
        self.captured = {}

        def fake_generate(_self, prompt, aspect_ratio=None, model=None, **kwargs):
            self.captured["aspect_ratio"] = aspect_ratio
            return {"success": True, "image": "https://example.com/fake.png"}

        _mod.OpenRouterImageGenProvider.generate = fake_generate

    def tearDown(self):
        _mod._fetch_post = self._orig_fetch_post
        _mod.OpenRouterImageGenProvider.generate = self._orig_generate

    def test_story_format_post_resolves_1080x1920_with_no_aspect_passed(self):
        _mod._fetch_post = lambda post_id: {"channel": "instagram", "format": "story"}
        json.loads(_mod._handle_image_generate({"prompt": "a scene", "post_id": "p001"}))
        self.assertEqual(self.captured["aspect_ratio"], "story")
        self.assertEqual(_mod._ASPECT_TO_SIZE[self.captured["aspect_ratio"]], "1080x1920")

    def test_non_story_format_post_resolves_the_channel_default(self):
        _mod._fetch_post = lambda post_id: {"channel": "instagram", "format": "single image"}
        json.loads(_mod._handle_image_generate({"prompt": "a scene", "post_id": "p002"}))
        self.assertEqual(self.captured["aspect_ratio"], "portrait_4_5")
        self.assertEqual(_mod._ASPECT_TO_SIZE[self.captured["aspect_ratio"]], "1080x1350")

    def test_missing_format_on_the_linked_post_resolves_the_channel_default(self):
        _mod._fetch_post = lambda post_id: {"channel": "instagram"}
        json.loads(_mod._handle_image_generate({"prompt": "a scene", "post_id": "p003"}))
        self.assertEqual(self.captured["aspect_ratio"], "portrait_4_5")


if __name__ == "__main__":
    unittest.main()

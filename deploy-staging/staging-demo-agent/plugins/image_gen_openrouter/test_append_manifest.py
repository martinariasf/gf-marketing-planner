"""Unit tests for _append_manifest (GF-64 idempotency).

The plugin module imports Hermes-runtime packages (httpx, agent.*) at the top,
so those are stubbed before loading the module by path — this file must run on
any box with a bare Python 3:

    python -m unittest deploy-staging/staging-demo-agent/plugins/image_gen_openrouter/test_append_manifest.py

(or `python test_append_manifest.py` from this directory).
"""

import importlib.util
import json
import os
import sys
import tempfile
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
    "image_gen_openrouter_under_test",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "__init__.py"),
)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
_append_manifest = _mod._append_manifest


class AppendManifestTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = self._tmp.name

    def tearDown(self):
        self._tmp.cleanup()

    def _items(self):
        with open(os.path.join(self.dir, "manifest.json"), encoding="utf-8") as f:
            return json.load(f)["items"]

    def test_first_append_creates_row(self):
        _append_manifest(self.dir, "a.png", "https://x/a.png", "p001")
        items = self._items()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["id"], "a001")
        self.assertEqual(items[0]["filename"], "a.png")
        self.assertEqual(items[0]["usedInPosts"], ["p001"])

    def test_retry_same_filename_does_not_duplicate(self):
        _append_manifest(self.dir, "a.png", "https://x/a.png", "p001")
        _append_manifest(self.dir, "a.png", "https://x/a.png", "p001")
        self.assertEqual(len(self._items()), 1)

    def test_same_filename_new_post_merges_link(self):
        _append_manifest(self.dir, "a.png", "https://x/a.png", "p001")
        _append_manifest(self.dir, "a.png", "https://x/a.png", "p002")
        items = self._items()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["usedInPosts"], ["p001", "p002"])

    def test_reserve_then_link_merges_into_same_row(self):
        _append_manifest(self.dir, "a.png", "https://x/a.png", "")
        _append_manifest(self.dir, "a.png", "https://x/a.png", "p001")
        items = self._items()
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["usedInPosts"], ["p001"])

    def test_distinct_filenames_get_sequential_ids(self):
        _append_manifest(self.dir, "a.png", "https://x/a.png", "p001")
        _append_manifest(self.dir, "b.mp4", "https://x/b.mp4", "p001", kind="video")
        items = self._items()
        self.assertEqual([it["id"] for it in items], ["a001", "a002"])
        self.assertEqual(items[1]["kind"], "video")


if __name__ == "__main__":
    unittest.main()

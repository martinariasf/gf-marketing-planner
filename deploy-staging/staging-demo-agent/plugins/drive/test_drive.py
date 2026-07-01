"""Unit tests for the read-only Drive plugin — no network, fake Drive service.

Focus: the isolation guard (_is_within_root) and the read-cap / degradation
paths. Run standalone:  python test_drive.py   (exit 0 = all passed).
"""
from __future__ import annotations

import importlib.util
import json
import os
import re
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("drive_under_test", os.path.join(_HERE, "__init__.py"))
m = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m)

def _id(label: str) -> str:
    """Realistic-length Drive id from a short label (real ids are ~25+ chars)."""
    return (label + "0000000000000000000000000")[:25]


ROOT = _id("ROOT")


class _Req:
    def __init__(self, result):
        self._r = result

    def execute(self):
        if isinstance(self._r, Exception):
            raise self._r
        return self._r


class _Files:
    def __init__(self, graph, children=None):
        self.graph = graph          # id -> {"id","parents",...} or raises if absent
        self.children = children or {}

    def get(self, fileId, fields=None, supportsAllDrives=None):
        if fileId not in self.graph:
            return _Req(RuntimeError("404 not found"))
        return _Req(self.graph[fileId])

    def list(self, q=None, **kw):
        pid = re.search(r"'([^']+)' in parents", q or "").group(1)
        return _Req({"files": self.children.get(pid, [])})


class _Service:
    def __init__(self, files):
        self._files = files

    def files(self):
        return self._files


def _svc(graph, children=None):
    return _Service(_Files(graph, children))


_failures = []


def check(name, cond):
    print(("PASS " if cond else "FAIL ") + name)
    if not cond:
        _failures.append(name)


def _reset():
    """Reset module caches + env so tests don't leak state into each other."""
    m._SERVICE = None
    m._SERVICE_TRIED = False
    m._SA_INFO = None
    m._SA_INFO_TRIED = False
    for k in ("GDRIVE_FOLDER_ID", "GDRIVE_SA_KEY", "GDRIVE_SA_KEY_FILE", "GDRIVE_MAX_READ_MB"):
        os.environ.pop(k, None)


# --- _valid_id ------------------------------------------------------------
check("valid_id accepts a normal drive id", m._valid_id("1J18Qnm1V_MNfGQ9-abc"))
check("valid_id rejects empty", not m._valid_id(""))
check("valid_id rejects quote (injection char)", not m._valid_id("abcd' or '1"))
check("valid_id rejects too short", not m._valid_id("abcd"))

# --- _is_within_root ------------------------------------------------------
# file_id == root
check("root itself is within root", m._is_within_root(_svc({}), ROOT, ROOT))

# direct child
c1 = _id("CHILD")
g = {c1: {"id": c1, "parents": [ROOT]}}
check("direct child is within root", m._is_within_root(_svc(g), c1, ROOT))

# multi-parent: root present alongside another parent
c2 = _id("MULTI")
g = {c2: {"id": c2, "parents": [_id("OTHER"), ROOT]}}
check("multi-parent with root is within root", m._is_within_root(_svc(g), c2, ROOT))

# reachable ONLY via the 2nd parent chain (regression: old parents[0]-only walk failed this)
c3, dead, mid = _id("VIA"), _id("DEADEND"), _id("MID")
g = {
    c3: {"id": c3, "parents": [dead, mid]},
    dead: {"id": dead, "parents": []},
    mid: {"id": mid, "parents": [ROOT]},
}
check("reachable only via non-first parent is within root", m._is_within_root(_svc(g), c3, ROOT))

# foreign file, no path to root
fx, fy = _id("XFILE"), _id("YFILE")
g = {fx: {"id": fx, "parents": [fy]}, fy: {"id": fy, "parents": []}}
check("foreign file is NOT within root", not m._is_within_root(_svc(g), fx, ROOT))

# cycle must terminate and return False
ca, cb = _id("ACYC"), _id("BCYC")
g = {ca: {"id": ca, "parents": [cb]}, cb: {"id": cb, "parents": [ca]}}
check("cycle terminates and is not within root", not m._is_within_root(_svc(g), ca, ROOT))

# file not visible to SA (get 404) -> not within root
check("invisible file (404) is NOT within root", not m._is_within_root(_svc({}), _id("GHOST"), ROOT))

# --- streaming download cap (_download_capped, the Round-1 blocker fix) ----
import googleapiclient.http as _gh  # noqa: E402


class _FakeDL:
    """Writes `request` bytes on the first chunk, then reports done."""
    def __init__(self, fd, request, chunksize=None):
        self._fd, self._n = fd, request

    def next_chunk(self):
        self._fd.write(b"x" * self._n)
        return (None, True)


_orig_dl = _gh.MediaIoBaseDownload
_gh.MediaIoBaseDownload = _FakeDL
try:
    check("download over cap returns None (streamed, not buffered whole)",
          m._download_capped(200, 100) is None)
    check("download under cap returns the bytes",
          m._download_capped(50, 100) == b"x" * 50)
finally:
    _gh.MediaIoBaseDownload = _orig_dl

# --- read cap / degradation ----------------------------------------------
_reset()
big = _id("BIGFILE")
os.environ["GDRIVE_FOLDER_ID"] = ROOT
m._SERVICE = _svc({big: {"id": big, "name": "huge.pdf", "mimeType": "application/pdf",
                         "parents": [ROOT], "size": str(50 * 1024 * 1024)}})
m._SERVICE_TRIED = True
os.environ["GDRIVE_MAX_READ_MB"] = "10"
res = json.loads(m._handle_drive_read_file({"file_id": big}))
check("oversized file is skipped, not downloaded", res.get("kind") == "skipped" and res.get("success") is True)

# foreign file read is refused (isolation at the handler)
mine, foreign = _id("MINE"), _id("FOREIGN")
m._SERVICE = _svc({mine: {"id": mine, "parents": [ROOT]}})  # foreign not in graph
res = json.loads(m._handle_drive_read_file({"file_id": foreign}))
check("foreign file read is refused", res.get("success") is False and "outside" in res.get("error", ""))

# not-connected degradation (fully reset first, so this doesn't rely on order)
_reset()
res = json.loads(m._handle_drive_list_files({}))
check("no folder connected -> clean error, no crash", res.get("success") is False)

print()
if _failures:
    print(f"{len(_failures)} FAILED: {_failures}")
    sys.exit(1)
print("ALL PASSED")

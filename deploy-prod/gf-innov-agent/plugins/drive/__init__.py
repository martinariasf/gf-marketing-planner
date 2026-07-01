"""Google Drive (read-only) plugin for Hermes Agent — GF-19 Phase 1.

Lets Viktor READ one client-controlled Drive folder so it can pull brand assets,
logos, briefs, and reference images into its work (e.g. as reference_images for
image generation). Read-only by design; writing back into the folder is GF-19
Phase 2 (a paid per-client Google Workspace identity) and is intentionally not
implemented here.

Identity & isolation
  Each agent stack authenticates with ITS OWN service-account key and is pointed
  at exactly ONE folder id. Access is folder-scoped at two independent layers:
    1. Credential — the client only shared that one folder with this SA email, so
       Google itself returns 403/404 for anything else.
    2. Code — every listing is constrained to descendants of GDRIVE_FOLDER_ID,
       and every read verifies the file's parent chain resolves to that root
       (following ALL parents) before returning content. No broad "shared with
       me" call is ever made.
  A buggy/compromised agent therefore cannot read another client's folder.

Environment (per-stack, like POSTIZ_API_KEY):
  GDRIVE_FOLDER_ID    required — the id of the single folder the client shared.
  GDRIVE_SA_KEY_FILE  path to the mounted service-account JSON key (preferred).
  GDRIVE_SA_KEY       fallback — base64-encoded service-account JSON key.
  GDRIVE_MAX_READ_MB  optional — per-file read cap, default 10 (MB).

Registered tools:
  • drive_list_files  — list files/folders under the configured folder.
  • drive_read_file   — read one file's content (text exported; images saved to
                        a local path usable as an image_generate reference).
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import tempfile
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

SCOPE = "https://www.googleapis.com/auth/drive.readonly"
_DEFAULT_MAX_READ_MB = 10
_CHUNK = 1024 * 1024  # 1 MiB download chunks
_LIST_LIMIT = 200     # max children returned per folder
_WALK_LIMIT = 1000    # max files returned in a recursive walk

# Drive file ids are URL-safe base64-ish tokens; reject anything else before it
# ever reaches a query string (defense-in-depth against query injection).
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{5,256}$")

# Google Workspace export mappings: native Google file -> (export mime, extension)
_GOOGLE_EXPORT = {
    "application/vnd.google-apps.document": ("text/plain", ".txt"),
    "application/vnd.google-apps.spreadsheet": ("text/csv", ".csv"),
    "application/vnd.google-apps.presentation": ("text/plain", ".txt"),
}

_FILE_FIELDS = "id, name, mimeType, modifiedTime, size, parents"

# Process-lifetime caches. The container restarts on deploy/key rotation, so a
# per-process cache is sufficient and keeps secrets out of repeated file reads.
_SERVICE: Any = None
_SERVICE_TRIED = False
_SA_INFO: Optional[Dict[str, Any]] = None
_SA_INFO_TRIED = False


# ---------------------------------------------------------------------------
# Config / auth
# ---------------------------------------------------------------------------

def _folder_id() -> str:
    return os.environ.get("GDRIVE_FOLDER_ID", "").strip()


def _valid_id(file_id: str) -> bool:
    return bool(file_id) and bool(_ID_RE.match(file_id))


def _max_read_bytes() -> int:
    try:
        mb = float(os.environ.get("GDRIVE_MAX_READ_MB", "") or _DEFAULT_MAX_READ_MB)
    except ValueError:
        mb = _DEFAULT_MAX_READ_MB
    return int(mb * 1024 * 1024)


def _load_sa_info() -> Optional[Dict[str, Any]]:
    """Return the service-account key as a dict, from file or base64 env (cached).

    If GDRIVE_SA_KEY_FILE is explicitly set it is authoritative — a missing or
    unreadable file returns None rather than silently falling back to the env
    blob (which would mask the operator's intent).
    """
    global _SA_INFO, _SA_INFO_TRIED
    if _SA_INFO is not None or _SA_INFO_TRIED:
        return _SA_INFO
    _SA_INFO_TRIED = True

    key_file = os.environ.get("GDRIVE_SA_KEY_FILE", "").strip()
    raw: Optional[str] = None
    if key_file:
        if not os.path.exists(key_file):
            logger.warning("drive: GDRIVE_SA_KEY_FILE set but file not found: %s", key_file)
            return None
        try:
            with open(key_file, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as exc:
            logger.warning("drive: cannot read GDRIVE_SA_KEY_FILE: %s", exc)
            return None
    else:
        b64 = os.environ.get("GDRIVE_SA_KEY", "").strip()
        if b64:
            try:
                raw = base64.b64decode(b64).decode("utf-8")
            except Exception as exc:  # noqa: BLE001
                logger.warning("drive: GDRIVE_SA_KEY is not valid base64 JSON: %s", exc)
                return None
    if not raw:
        return None
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("drive: service-account key is not valid JSON: %s", exc)
        return None
    # Structural sanity so a valid-JSON-but-wrong-shape key fails at check_fn,
    # not with a cryptic auth error on the first tool call.
    if info.get("type") != "service_account" or not info.get("private_key") or not info.get("client_email"):
        logger.warning("drive: key JSON is not a service_account (missing type/private_key/client_email)")
        return None
    _SA_INFO = info
    return _SA_INFO


def _service() -> Any:
    """Build (and cache) a read-only Drive API client, or None if unavailable."""
    global _SERVICE, _SERVICE_TRIED
    if _SERVICE is not None or _SERVICE_TRIED:
        return _SERVICE
    _SERVICE_TRIED = True
    info = _load_sa_info()
    if not info:
        return None
    try:
        from google.oauth2 import service_account  # type: ignore
        from googleapiclient.discovery import build  # type: ignore
    except ImportError as exc:
        logger.warning("drive: google client libs missing (%s) — install "
                       "google-api-python-client google-auth", exc)
        return None
    try:
        creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE])
        _SERVICE = build("drive", "v3", credentials=creds, cache_discovery=False)
    except Exception as exc:  # noqa: BLE001 — never crash a tool on auth setup
        logger.warning("drive: failed to build Drive service: %s", exc)
        _SERVICE = None
    return _SERVICE


def _check_drive_available() -> bool:
    """Cheap gate: config + libs present (all cached). Network errors surface in
    handlers, not here."""
    if not _folder_id():
        return False
    if _load_sa_info() is None:
        return False
    try:
        import google.oauth2.service_account  # noqa: F401
        import googleapiclient.discovery  # noqa: F401
    except ImportError:
        return False
    return True


# ---------------------------------------------------------------------------
# Drive helpers (all scoped to the configured root folder)
# ---------------------------------------------------------------------------

def _is_within_root(svc: Any, file_id: str, root: str, max_nodes: int = 200) -> bool:
    """True iff file_id is the root or a descendant of it.

    Walks the FULL parent graph (a Drive file may have multiple parents), with a
    visited-set cycle guard and a node budget. This is the code-layer guard; the
    credential is the primary wall (the SA can only see what was shared with it),
    but we never return content for a file whose ancestry does not resolve to the
    configured root.
    """
    if not _valid_id(file_id) or not _valid_id(root):
        return False
    if file_id == root:
        return True
    seen = set()
    queue = [file_id]
    while queue and len(seen) < max_nodes:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.add(current)
        try:
            meta = svc.files().get(
                fileId=current, fields="id, parents", supportsAllDrives=True
            ).execute()
        except Exception:  # noqa: BLE001 — 403/404 => not reachable => not ours
            continue
        parents = meta.get("parents") or []
        if root in parents:
            return True
        queue.extend(p for p in parents if p not in seen)
    return False


def _list_children(svc: Any, parent_id: str, page_limit: int = _LIST_LIMIT) -> List[Dict[str, Any]]:
    """List immediate children of parent_id (non-trashed), following pagination."""
    if not _valid_id(parent_id):
        return []
    items: List[Dict[str, Any]] = []
    page_token: Optional[str] = None
    while True:
        resp = svc.files().list(
            q=f"'{parent_id}' in parents and trashed = false",
            fields=f"nextPageToken, files({_FILE_FIELDS})",
            pageSize=100,
            pageToken=page_token,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
            orderBy="folder,name",
        ).execute()
        items.extend(resp.get("files", []))
        page_token = resp.get("nextPageToken")
        if not page_token or len(items) >= page_limit:
            break
    return items[:page_limit]


def _shape(f: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": f.get("id"),
        "name": f.get("name"),
        "mimeType": f.get("mimeType"),
        "isFolder": f.get("mimeType") == "application/vnd.google-apps.folder",
        "modifiedTime": f.get("modifiedTime"),
        "size": f.get("size"),
    }


def _download_capped(request: Any, cap: int) -> Optional[bytes]:
    """Stream a media/export request in chunks, stopping if it exceeds cap.
    Returns the bytes, or None if the cap was exceeded."""
    from googleapiclient.http import MediaIoBaseDownload  # type: ignore
    buf = io.BytesIO()
    downloader = MediaIoBaseDownload(buf, request, chunksize=_CHUNK)
    done = False
    while not done:
        _status, done = downloader.next_chunk()
        if buf.tell() > cap:
            return None
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Tool: drive_list_files
# ---------------------------------------------------------------------------

DRIVE_LIST_FILES_SCHEMA: Dict[str, Any] = {
    "name": "drive_list_files",
    "description": (
        "List the files and subfolders in the client's connected Google Drive "
        "workspace folder. Call with no arguments to list the top level. Pass "
        "folder_id (an id returned here whose isFolder is true) to look inside a "
        "subfolder, or recursive=true to list every file under the workspace "
        "folder. Returns objects with {id, name, mimeType, isFolder, "
        "modifiedTime, size}. Use drive_read_file with an id to read a file."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "folder_id": {
                "type": "string",
                "description": "Optional subfolder id (must be inside the workspace folder). Defaults to the workspace root.",
            },
            "recursive": {
                "type": "boolean",
                "description": "If true, list all files under the workspace folder (walking subfolders). Default false.",
            },
        },
        "required": [],
    },
}


def _handle_drive_list_files(args: Dict[str, Any], **kw: Any) -> str:
    root = _folder_id()
    if not root:
        return json.dumps({"success": False, "error": "No Drive folder is connected (GDRIVE_FOLDER_ID unset)."})
    svc = _service()
    if svc is None:
        return json.dumps({"success": False, "error": "Drive is not connected (service-account key missing or invalid)."})

    start = (args.get("folder_id") or "").strip() or root
    if start != root:
        if not _valid_id(start) or not _is_within_root(svc, start, root):
            return json.dumps({"success": False, "error": "Requested folder is outside the connected workspace folder; refused."})

    recursive = bool(args.get("recursive"))
    try:
        if not recursive:
            children = _list_children(svc, start)
            return json.dumps({"success": True, "folder_id": start,
                               "truncated": len(children) >= _LIST_LIMIT,
                               "files": [_shape(f) for f in children]})

        # Breadth-first walk, bounded, starting at `start`.
        out: List[Dict[str, Any]] = []
        queue = [start]
        visited = set()
        while queue and len(out) < _WALK_LIMIT:
            pid = queue.pop(0)
            if pid in visited:
                continue
            visited.add(pid)
            for f in _list_children(svc, pid):
                out.append(_shape(f))
                if f.get("mimeType") == "application/vnd.google-apps.folder":
                    queue.append(f["id"])
        return json.dumps({"success": True, "folder_id": start, "recursive": True,
                           "truncated": len(out) >= _WALK_LIMIT, "files": out[:_WALK_LIMIT]})
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"success": False, "error": f"Drive list failed: {exc}"})


# ---------------------------------------------------------------------------
# Tool: drive_read_file
# ---------------------------------------------------------------------------

DRIVE_READ_FILE_SCHEMA: Dict[str, Any] = {
    "name": "drive_read_file",
    "description": (
        "Read one file from the client's connected Drive workspace folder, by "
        "the id returned from drive_list_files. Google Docs/Sheets/Slides are "
        "returned as text. Images are downloaded and saved to a local path you "
        "can pass to image_generate as a reference image. Other binary files "
        "return metadata only. Reads are capped (default 10MB)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "file_id": {"type": "string", "description": "The file id to read (from drive_list_files)."},
        },
        "required": ["file_id"],
    },
}


def _handle_drive_read_file(args: Dict[str, Any], **kw: Any) -> str:
    root = _folder_id()
    if not root:
        return json.dumps({"success": False, "error": "No Drive folder is connected (GDRIVE_FOLDER_ID unset)."})
    svc = _service()
    if svc is None:
        return json.dumps({"success": False, "error": "Drive is not connected (service-account key missing or invalid)."})

    file_id = (args.get("file_id") or "").strip()
    if not _valid_id(file_id):
        return json.dumps({"success": False, "error": "file_id is required and must be a valid Drive id."})
    if not _is_within_root(svc, file_id, root):
        return json.dumps({"success": False, "error": "File is outside the connected workspace folder; refused."})

    try:
        meta = svc.files().get(
            fileId=file_id, fields=_FILE_FIELDS, supportsAllDrives=True
        ).execute()
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"success": False, "error": f"Drive metadata fetch failed: {exc}"})

    name = meta.get("name", "")
    mime = meta.get("mimeType", "")
    cap = _max_read_bytes()

    # Native Google Workspace files -> export as text, streamed with a cap.
    if mime in _GOOGLE_EXPORT:
        export_mime, _ext = _GOOGLE_EXPORT[mime]
        try:
            data = _download_capped(
                svc.files().export_media(fileId=file_id, mimeType=export_mime), cap
            )
        except Exception as exc:  # noqa: BLE001
            return json.dumps({"success": False, "error": f"Drive export failed: {exc}"})
        if data is None:
            return json.dumps({"success": True, "name": name, "mimeType": mime, "kind": "skipped",
                               "note": f"Export exceeded the {cap}-byte read cap; not returned."})
        # utf-8-sig drops any leading BOM Google prepends to exports.
        text = data.decode("utf-8-sig", errors="replace")
        return json.dumps({"success": True, "name": name, "mimeType": mime,
                           "kind": "text", "content": text})

    if mime == "application/vnd.google-apps.folder":
        return json.dumps({"success": False, "error": f"{name} is a folder; use drive_list_files with folder_id={file_id}."})

    # Size guard before downloading binaries (when Drive reports a size).
    size = int(meta.get("size") or 0)
    if size and size > cap:
        return json.dumps({"success": True, "name": name, "mimeType": mime, "kind": "skipped",
                           "size": size, "note": f"File is {size} bytes, over the {cap}-byte read cap; not downloaded."})

    # Download bytes, streamed with the same cap (covers unknown-size files).
    try:
        raw = _download_capped(svc.files().get_media(fileId=file_id, supportsAllDrives=True), cap)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"success": False, "error": f"Drive download failed: {exc}"})
    if raw is None:
        return json.dumps({"success": True, "name": name, "mimeType": mime, "kind": "skipped",
                           "note": f"Stopped: exceeded the {cap}-byte read cap."})

    # Images -> save to a local file and return the path (usable by image_generate).
    if mime.startswith("image/"):
        suffix = os.path.splitext(name)[1] or {"image/png": ".png", "image/jpeg": ".jpg",
                                                "image/webp": ".webp"}.get(mime, "")
        cache_dir = os.path.join(tempfile.gettempdir(), "drive_cache")
        os.makedirs(cache_dir, exist_ok=True)
        path = os.path.join(cache_dir, f"{file_id}{suffix}")
        try:
            with open(path, "wb") as fh:
                fh.write(raw)
        except OSError as exc:
            return json.dumps({"success": False, "error": f"Could not cache image locally: {exc}"})
        return json.dumps({"success": True, "name": name, "mimeType": mime, "kind": "image",
                           "local_path": path, "size": len(raw),
                           "note": "Pass local_path to image_generate as a reference image."})

    # Text-ish -> return decoded content (utf-8-sig strips any BOM).
    if mime.startswith("text/") or mime in ("application/json", "application/xml"):
        return json.dumps({"success": True, "name": name, "mimeType": mime, "kind": "text",
                           "content": raw.decode("utf-8-sig", errors="replace")})

    # Anything else: metadata only.
    return json.dumps({"success": True, "name": name, "mimeType": mime, "kind": "binary",
                       "size": len(raw), "note": "Binary file; not rendered inline."})


# ---------------------------------------------------------------------------
# Plugin entry point
# ---------------------------------------------------------------------------

_TOOLS = (
    ("drive_list_files", DRIVE_LIST_FILES_SCHEMA, _handle_drive_list_files, "📁"),
    ("drive_read_file",  DRIVE_READ_FILE_SCHEMA,  _handle_drive_read_file,  "📄"),
)


def register(ctx) -> None:
    for name, schema, handler, emoji in _TOOLS:
        ctx.register_tool(
            name=name,
            toolset="drive",
            schema=schema,
            handler=handler,
            check_fn=_check_drive_available,
            emoji=emoji,
            # No hard env gate: _check_drive_available() is the real gate (folder
            # id + SA key + libs). Tools degrade gracefully when not connected.
            requires_env=[],
        )

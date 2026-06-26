"""Postiz integration plugin for Hermes Agent — CLI-driven.

Wraps the official `postiz` npm CLI (gitroomhq/postiz-agent) instead of
calling the REST API directly. Rationale: the CLI is the recommended
agent-facing surface, handles auth via POSTIZ_API_KEY env var, and is
maintained alongside the API.

Environment:
  POSTIZ_API_KEY     optional — explicit override. If unset, the key is fetched
                     at runtime from the Marketing Platform API (GF-11) using
                     API_BASE/CLIENT_SLUG/API_TOKEN and injected into the CLI.
                     The key is never logged or returned in tool output — the
                     dashboard owner configures it once and never sees it again.
  POSTIZ_API_URL     optional — custom endpoint (cloud default works)

Registered tools:
  • postiz_list_integrations  →  `postiz integrations:list --json`
  • postiz_list_posts         →  `postiz posts:list --json`
  • postiz_schedule_post      →  `postiz upload` (per image) + `postiz posts:create`
"""

from __future__ import annotations

import datetime as _dt
import json
import logging
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

CLI_BIN = "postiz"
CLI_TIMEOUT = 120  # seconds


def _api_base() -> str:
    return os.environ.get("API_BASE", "").rstrip("/")


def _client_slug() -> str:
    return os.environ.get("CLIENT_SLUG", "").strip()


def _api_token() -> str:
    return os.environ.get("API_TOKEN", "").strip()


# Cache the resolved Postiz key for the process lifetime. The agent container is
# restarted on every deploy/key rotation, so a per-process cache is sufficient
# and keeps the secret out of repeated network round-trips. `_KEY_RESOLVED`
# distinguishes "not configured" (cached None) from "not tried yet".
_POSTIZ_KEY: Optional[str] = None
_KEY_RESOLVED = False


def _resolve_postiz_api_key() -> Optional[str]:
    """Return the Postiz API key without ever logging it.

    Order: explicit POSTIZ_API_KEY env override → GF-11 agent-only fetch from
    the Marketing Platform API. The plaintext is held only in this module and is
    never returned through any tool handler ("Viktor can get it, never sees it").
    """
    global _POSTIZ_KEY, _KEY_RESOLVED
    env_key = os.environ.get("POSTIZ_API_KEY", "").strip()
    if env_key:
        return env_key
    if _KEY_RESOLVED:
        return _POSTIZ_KEY

    _KEY_RESOLVED = True
    api_base, slug, token = _api_base(), _client_slug(), _api_token()
    if not (api_base and slug and token):
        return None
    req = urllib.request.Request(
        f"{api_base}/clients/{slug}/integration/postiz/key",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            payload = json.loads(res.read().decode("utf-8"))
        key = (payload.get("apiKey") or "").strip()
        _POSTIZ_KEY = key or None
    except urllib.error.HTTPError as exc:
        # 404 = no key configured for this client; anything else is unexpected.
        if exc.code != 404:
            logger.warning("postiz key fetch failed: HTTP %s", exc.code)
        _POSTIZ_KEY = None
    except Exception as exc:  # noqa: BLE001 — never let key resolution crash a tool
        logger.warning("postiz key fetch failed: %s", exc)
        _POSTIZ_KEY = None
    return _POSTIZ_KEY


def _check_postiz_available() -> bool:
    if not _resolve_postiz_api_key():
        return False
    return shutil.which(CLI_BIN) is not None


def _run_cli(args: List[str], timeout: int = CLI_TIMEOUT) -> Dict[str, Any]:
    """Run a postiz CLI command. Returns {ok, stdout, stderr, code}."""
    env = os.environ.copy()
    # CLI requires POSTIZ_API_KEY in env. Inject the runtime-resolved key so the
    # operator does not have to bake it into the container (GF-11). Never logged.
    key = _resolve_postiz_api_key()
    if key:
        env["POSTIZ_API_KEY"] = key
    try:
        proc = subprocess.run(
            [CLI_BIN, *args],
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except FileNotFoundError:
        return {"ok": False, "stdout": "", "stderr": "postiz CLI not on PATH", "code": 127}
    except subprocess.TimeoutExpired:
        return {"ok": False, "stdout": "", "stderr": f"postiz CLI timed out after {timeout}s", "code": 124}

    return {
        "ok": proc.returncode == 0,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "code": proc.returncode,
    }


def _parse_json_stdout(stdout: str) -> Any:
    """The CLI emits JSON on --json flags; sometimes mixed with log lines.
    Try strict parse first, then locate the first {...} or [...] block."""
    stdout = (stdout or "").strip()
    if not stdout:
        return None
    try:
        return json.loads(stdout)
    except json.JSONDecodeError:
        pass
    # Fallback: find the first balanced JSON object or array.
    for opener, closer in (("{", "}"), ("[", "]")):
        start = stdout.find(opener)
        end = stdout.rfind(closer)
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(stdout[start : end + 1])
            except json.JSONDecodeError:
                continue
    return None


# ---------------------------------------------------------------------------
# Tool: postiz_list_integrations
# ---------------------------------------------------------------------------

POSTIZ_LIST_INTEGRATIONS_SCHEMA: Dict[str, Any] = {
    "name": "postiz_list_integrations",
    "description": (
        "List the social-media accounts connected in Postiz. Returns an "
        "array of integration objects each containing at least {id, name, "
        "identifier (= platform/provider)}. Call this FIRST so you know "
        "which integration IDs to pass to postiz_schedule_post."
    ),
    "parameters": {"type": "object", "properties": {}, "required": []},
}


def _handle_postiz_list_integrations(args: Dict[str, Any], **kw: Any) -> str:
    if not _check_postiz_available():
        return json.dumps({"success": False, "error": "postiz CLI or POSTIZ_API_KEY missing"})

    result = _run_cli(["integrations:list", "--json"])
    if not result["ok"]:
        return json.dumps({"success": False, "error": result["stderr"] or result["stdout"]})

    parsed = _parse_json_stdout(result["stdout"])
    return json.dumps({"success": True, "integrations": parsed if parsed is not None else result["stdout"]})


# ---------------------------------------------------------------------------
# Tool: postiz_list_posts
# ---------------------------------------------------------------------------

POSTIZ_LIST_POSTS_SCHEMA: Dict[str, Any] = {
    "name": "postiz_list_posts",
    "description": (
        "List recent and upcoming posts in Postiz (CLI default: 30 days "
        "past to 30 days future). Useful before scheduling to avoid "
        "clashes."
    ),
    "parameters": {"type": "object", "properties": {}, "required": []},
}


def _handle_postiz_list_posts(args: Dict[str, Any], **kw: Any) -> str:
    if not _check_postiz_available():
        return json.dumps({"success": False, "error": "postiz CLI or POSTIZ_API_KEY missing"})

    result = _run_cli(["posts:list", "--json"])
    if not result["ok"]:
        return json.dumps({"success": False, "error": result["stderr"] or result["stdout"]})

    parsed = _parse_json_stdout(result["stdout"])
    return json.dumps({"success": True, "posts": parsed if parsed is not None else result["stdout"]})


# ---------------------------------------------------------------------------
# Tool: postiz_schedule_post
# ---------------------------------------------------------------------------

POSTIZ_SCHEDULE_POST_SCHEMA: Dict[str, Any] = {
    "name": "postiz_schedule_post",
    "description": (
        "Schedule an already-approved marketing.gfinnov.com dashboard post on "
        "one or more connected Postiz integrations. You MUST pass post_id; the "
        "tool verifies the post through the Marketing Platform API and refuses "
        "chat-only copy, drafts, unapproved posts, and already scheduled/published "
        "posts. Use postiz_list_integrations first to discover IDs."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "post_id": {
                "type": "string",
                "description": "Approved dashboard post id, e.g. 'p014'. Required.",
            },
            "content": {
                "type": "string",
                "description": (
                    "IGNORED. The tool always publishes the approved dashboard "
                    "post's stored title + copy verbatim, so the real post is "
                    "byte-identical to what the user approved. Do not retype the "
                    "copy here."
                ),
            },
            "integration_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Integration IDs from postiz_list_integrations.",
            },
            "scheduled_for": {
                "type": "string",
                "description": (
                    "ISO 8601 UTC timestamp, e.g. '2026-05-20T09:00:00Z'. "
                    "Defaults to 'one minute from now' (Postiz rejects past times)."
                ),
            },
            "image_paths": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Optional local image paths (e.g. ones returned by "
                    "generate_image). Each is uploaded via `postiz upload` "
                    "before the post is created."
                ),
            },
        },
        "required": ["post_id", "integration_ids"],
    },
}


def _load_approved_dashboard_post(post_id: str) -> Dict[str, Any]:
    """Return an approved dashboard post or an error dict.

    Postiz publishing must always originate from marketing.gfinnov.com dashboard
    state, never from chat-only copy. This check is deliberately inside the tool
    so the model cannot bypass it by forgetting the instruction.
    """
    api_base = _api_base()
    slug = _client_slug()
    token = _api_token()
    if not (api_base and slug and token):
        return {
            "ok": False,
            "error": "API_BASE, CLIENT_SLUG, and API_TOKEN are required to verify dashboard approval",
        }
    if not post_id:
        return {"ok": False, "error": "post_id is required; Postiz scheduling must come from an approved dashboard post"}

    req = urllib.request.Request(
        f"{api_base}/clients/{slug}/posts/{post_id}",
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            post = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return {"ok": False, "error": f"dashboard post lookup failed: HTTP {exc.code}"}
    except Exception as exc:
        return {"ok": False, "error": f"dashboard post lookup failed: {exc}"}

    status = str(post.get("status") or "").strip()
    approval = post.get("approval") if isinstance(post.get("approval"), dict) else {}
    approval_status = str(approval.get("status") or "").strip()
    if status in {"scheduled", "published"}:
        return {"ok": False, "error": f"{post_id} is already {status}; refusing to double-schedule"}
    if status != "approved" and approval_status != "approved":
        return {
            "ok": False,
            "error": f"{post_id} is not approved in the marketing.gfinnov.com dashboard (status={status or 'missing'})",
        }
    return {"ok": True, "post": post}


def _normalize_newlines(s: str) -> str:
    """Collapse literal escape sequences into real characters (GF-63).

    The model often re-emits multi-paragraph copy with a literal ``\\n`` (the two
    characters backslash + n) instead of a real newline. Postiz then publishes
    the visible ``\\n``. Stored copy is normally clean (the dashboard renders it
    fine), so this is a belt-and-suspenders pass on the publish path; a real
    newline already present is left untouched. ``\\r\\n`` is handled before
    ``\\n`` so no stray ``\\r`` is left behind.
    """
    return s.replace("\\r\\n", "\n").replace("\\n", "\n").replace("\\t", "\t")


def _caption_from_post(post: Dict[str, Any]) -> str:
    """Build the caption from the approved post's STORED title + copy (GF-63).

    Mirrors the platform scheduling adapter (`toPostizPayload`): title and copy
    joined by a blank line. Publishing the stored copy — not the model's re-typed
    ``content`` argument — makes the real post byte-identical to what the user
    approved and removes the literal-``\\n`` corruption (and any copy drift) at
    the source.
    """
    parts = [
        _normalize_newlines(str(post.get("title") or "")).strip(),
        _normalize_newlines(str(post.get("copy") or "")).strip(),
    ]
    return "\n\n".join(p for p in parts if p).strip()


def _upload_image_cli(path: str) -> Optional[str]:
    """Run `postiz upload <path>` and return the uploaded URL/path, or None."""
    result = _run_cli(["upload", path, "--json"])
    if not result["ok"]:
        logger.warning("postiz upload failed for %s: %s", path, result["stderr"] or result["stdout"])
        return None
    parsed = _parse_json_stdout(result["stdout"])
    if isinstance(parsed, dict):
        return parsed.get("path") or parsed.get("url") or parsed.get("id")
    if isinstance(parsed, str):
        return parsed
    return None


def _handle_postiz_schedule_post(args: Dict[str, Any], **kw: Any) -> str:
    if not _check_postiz_available():
        return json.dumps({"success": False, "error": "postiz CLI or POSTIZ_API_KEY missing"})

    post_id = (args.get("post_id") or "").strip()
    approved = _load_approved_dashboard_post(post_id)
    if not approved.get("ok"):
        return json.dumps({"success": False, "error": approved.get("error")})

    # GF-63: publish the dashboard's STORED copy, never the model's re-typed
    # `content` argument. The arg is ignored on purpose so the real Postiz post is
    # byte-identical to the approved dashboard post (no literal "\n", no drift).
    content = _caption_from_post(approved["post"])
    integration_ids = args.get("integration_ids") or []
    scheduled_for = args.get("scheduled_for")
    image_paths = args.get("image_paths") or []

    if not content:
        return json.dumps({"success": False, "error": f"{post_id} has no title or copy to publish"})
    if not integration_ids:
        return json.dumps({"success": False, "error": "integration_ids is required"})

    if not scheduled_for:
        scheduled_for = (
            _dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(minutes=1)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

    uploaded_refs: List[str] = []
    for p in image_paths:
        ref = _upload_image_cli(p)
        if ref:
            uploaded_refs.append(ref)
        else:
            return json.dumps({"success": False, "error": f"upload failed for {p}"})

    # Build one `postiz posts:create` invocation per integration. The CLI
    # accepts a single -i flag; for multi-platform posts we either chain
    # commands or use the JSON file form. Chaining is simpler and the
    # CLI is fast enough that the latency is acceptable for ~3 platforms.
    results = []
    for iid in integration_ids:
        cmd = [
            "posts:create",
            "-c", content,
            "-s", scheduled_for,
            "-i", iid,
            "--json",
        ]
        if uploaded_refs:
            cmd.extend(["-m", ",".join(uploaded_refs)])

        result = _run_cli(cmd)
        results.append({
            "integration_id": iid,
            "ok": result["ok"],
            "output": _parse_json_stdout(result["stdout"]) or result["stdout"],
            "error": result["stderr"] if not result["ok"] else None,
        })

    all_ok = all(r["ok"] for r in results)
    return json.dumps({
        "success": all_ok,
        "post_id": post_id,
        "scheduled_for": scheduled_for,
        "results": results,
    })


# ---------------------------------------------------------------------------
# Plugin entry point
# ---------------------------------------------------------------------------

_TOOLS = (
    ("postiz_list_integrations", POSTIZ_LIST_INTEGRATIONS_SCHEMA, _handle_postiz_list_integrations, "📋"),
    ("postiz_list_posts",        POSTIZ_LIST_POSTS_SCHEMA,        _handle_postiz_list_posts,        "🗒"),
    ("postiz_schedule_post",     POSTIZ_SCHEDULE_POST_SCHEMA,     _handle_postiz_schedule_post,     "📤"),
)


def register(ctx) -> None:
    for name, schema, handler, emoji in _TOOLS:
        ctx.register_tool(
            name=name,
            toolset="postiz",
            schema=schema,
            handler=handler,
            check_fn=_check_postiz_available,
            emoji=emoji,
            # No hard env gate: the key may be fetched at runtime (GF-11) rather
            # than baked into the container. _check_postiz_available() is the real
            # gate and resolves the key from env OR the API before enabling tools.
            requires_env=[],
        )

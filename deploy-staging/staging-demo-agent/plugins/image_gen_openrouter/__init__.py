"""OpenRouter image/video generation backend for Hermes Agent.

Routes image generation requests to OpenRouter's image-capable models
(default: Nano Banana 2 / ``google/gemini-3.1-flash-image-preview``) via the OpenAI-compatible Chat
Completions endpoint with image content blocks. Saves the returned image
to ``$HERMES_HOME/cache/images/`` so the gateway can attach it to the
outgoing chat message.

Environment:
  OPENROUTER_API_KEY        required
  OPENROUTER_IMAGE_MODEL    optional, default Nano Banana 2
  OPENROUTER_VIDEO_MODEL    optional, default Seedance 2.0
  OPENROUTER_BASE_URL       optional, default "https://openrouter.ai/api/v1"
"""

from __future__ import annotations

import base64
import json
import logging
import mimetypes
import os
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx

from agent.image_gen_provider import (
    DEFAULT_ASPECT_RATIO,
    ImageGenProvider,
    error_response,
    resolve_aspect_ratio,
    save_b64_image,
    success_response,
)

logger = logging.getLogger(__name__)

# Per-request fidelity → model mapping. The agent picks "fast" or "high"
# (see the `image_generate` tool override below); each maps to a model that
# can be overridden per company via env without touching code.
DEFAULT_MODEL_FAST = "google/gemini-3.1-flash-image-preview"  # Nano Banana 2, ~seconds
DEFAULT_MODEL_HIGH = "openai/gpt-5.4-image-2"                 # premium, ~3 min
DEFAULT_MODEL = DEFAULT_MODEL_FAST
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_VIDEO_MODEL = "bytedance/seedance-2.0"
DEFAULT_VIDEO_DURATION = 5
DEFAULT_VIDEO_RESOLUTION = "720p"
DEFAULT_VIDEO_POLL_INTERVAL = 30.0
DEFAULT_VIDEO_MAX_POLLS = 60

# Channel-aware output sizes. Instagram feed images must be VERTICAL 4:5
# (1080x1350) per GF-33; LinkedIn stays horizontal. `portrait_4_5` is the
# explicit Instagram size; plain `portrait` remains the generic tall ratio.
_ASPECT_TO_SIZE = {
    "landscape": "1536x1024",
    "square": "1024x1024",
    "portrait": "1024x1536",
    "portrait_4_5": "1080x1350",  # Instagram feed (4:5)
    "4:5": "1080x1350",
    "instagram": "1080x1350",
}

# Map the friendly target-channel name to the aspect the model should render.
# Instagram → vertical 4:5; LinkedIn/X/Facebook → horizontal. Format follows
# the channel, never a global default (GF-33).
_CHANNEL_TO_ASPECT = {
    "instagram": "portrait_4_5",
    "ig": "portrait_4_5",
    "linkedin": "landscape",
    "x": "landscape",
    "twitter": "landscape",
    "facebook": "landscape",
    "fb": "landscape",
}


def _resolve_image_aspect(aspect_ratio: Any, channel: Any) -> str:
    """Pick the render aspect from an explicit channel first, then aspect_ratio.

    The target CHANNEL wins: Instagram is always vertical 4:5 (1080x1350),
    LinkedIn/X/Facebook horizontal. Only if no channel is given do we honor an
    explicit aspect_ratio. Falls back to the framework default otherwise.
    """
    ch = str(channel or "").strip().lower()
    if ch in _CHANNEL_TO_ASPECT:
        return _CHANNEL_TO_ASPECT[ch]
    ar = str(aspect_ratio or "").strip().lower()
    if ar in _ASPECT_TO_SIZE:
        return ar
    # Unknown/blank → defer to the framework's resolver for the legacy default.
    return resolve_aspect_ratio(aspect_ratio)

_ASPECT_TO_VIDEO_ASPECT = {
    "landscape": "16:9",
    "square": "1:1",
    "portrait": "9:16",
    "16:9": "16:9",
    "1:1": "1:1",
    "9:16": "9:16",
    "4:3": "4:3",
    "3:4": "3:4",
    "21:9": "21:9",
    "9:21": "9:21",
}


def _model() -> str:
    return os.environ.get("OPENROUTER_IMAGE_MODEL", DEFAULT_MODEL)


def _model_for_fidelity(fidelity: Optional[str]) -> Optional[str]:
    """Map a fidelity choice to a concrete model id, or None to use the default.

    "fast" → IMAGE_MODEL_FAST (default Nano Banana 2);
    "high" → IMAGE_MODEL_HIGH (default gpt-5.4-image-2);
    anything else (None/unknown) → None, so generate() falls back to _model().
    """
    if not fidelity:
        return None
    f = str(fidelity).strip().lower()
    if f == "fast":
        return os.environ.get("IMAGE_MODEL_FAST", DEFAULT_MODEL_FAST)
    if f == "high":
        return os.environ.get("IMAGE_MODEL_HIGH", DEFAULT_MODEL_HIGH)
    return None


def _base_url() -> str:
    return os.environ.get("OPENROUTER_BASE_URL", DEFAULT_BASE_URL).rstrip("/")


def _video_model() -> str:
    return os.environ.get("OPENROUTER_VIDEO_MODEL", DEFAULT_VIDEO_MODEL)


class OpenRouterImageGenProvider(ImageGenProvider):
    """Image generation via OpenRouter, defaulting to openai/gpt-5.4-image-2."""

    @property
    def name(self) -> str:
        return "openrouter"

    @property
    def display_name(self) -> str:
        return "OpenRouter (Image)"

    def is_available(self) -> bool:
        return bool(os.environ.get("OPENROUTER_API_KEY"))

    def list_models(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": "openrouter",
                "display": f"OpenRouter — {_model()}",
                "speed": "varies",
                "strengths": "Configurable via OPENROUTER_IMAGE_MODEL",
                "price": "varies",
            }
        ]

    def default_model(self) -> Optional[str]:
        return "openrouter"

    def get_setup_schema(self) -> Dict[str, Any]:
        return {
            "name": "OpenRouter",
            "badge": "paid",
            "tag": f"Default model: {_model()}",
            "env_vars": [
                {
                    "key": "OPENROUTER_API_KEY",
                    "prompt": "OpenRouter API key",
                    "url": "https://openrouter.ai/keys",
                },
                {
                    "key": "OPENROUTER_IMAGE_MODEL",
                    "prompt": "Image model (optional)",
                    "default": DEFAULT_MODEL,
                },
            ],
        }

    def generate(
        self,
        prompt: str,
        aspect_ratio: str = DEFAULT_ASPECT_RATIO,
        model: Optional[str] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        prompt = (prompt or "").strip()
        # Accept the channel-aware ratios (e.g. "portrait_4_5"/"4:5") directly;
        # only defer to the framework resolver for the legacy enum values.
        ar = str(aspect_ratio or "").strip().lower()
        aspect = ar if ar in _ASPECT_TO_SIZE else resolve_aspect_ratio(aspect_ratio)

        if not prompt:
            return error_response(
                error="Prompt is required and must be a non-empty string",
                error_type="invalid_argument",
                provider="openrouter",
                aspect_ratio=aspect,
            )

        api_key = os.environ.get("OPENROUTER_API_KEY")
        if not api_key:
            return error_response(
                error="OPENROUTER_API_KEY not set",
                error_type="auth_required",
                provider="openrouter",
                aspect_ratio=aspect,
            )

        # An explicit model (e.g. from the fidelity-aware tool override) wins;
        # otherwise fall back to the env-configured default.
        model = model or _model()
        size = _ASPECT_TO_SIZE.get(aspect, _ASPECT_TO_SIZE["square"])

        # OpenRouter routes OpenAI's gpt-image-2 family through a
        # chat-completions endpoint that accepts an image_generation
        # parameter. The exact request shape for gpt-5.4-image-2 is
        # documented at https://openrouter.ai/openai/gpt-5.4-image-2.
        # We send a multimodal request and pull the first image block
        # out of the assistant response.
        #
        # Reference images (image-to-image conditioning): the agent can pass
        # `reference_images` so the model sees the ACTUAL logo/product and
        # reproduces it faithfully, instead of us describing it in text (which
        # produced wrong, hallucinated logos). Each becomes an extra image_url
        # content block in the same user turn.
        requested_refs = [str(ref) for ref in (kwargs.get("reference_images") or [])]
        ref_errors: List[str] = []
        ref_blocks: List[Dict[str, Any]] = []
        for ref in requested_refs:
            try:
                data_uri = _reference_to_data_uri(ref)
            except Exception as exc:
                ref_errors.append(f"{ref}: {exc}")
                logger.warning("reference image %r failed to load: %s", ref, exc)
                continue
            ref_blocks.append({"type": "image_url", "image_url": {"url": data_uri}})
        if requested_refs and not ref_blocks:
            return error_response(
                error=(
                    "All requested reference images failed to load; refusing to "
                    "generate from description because this request requires an "
                    "exact logo/product/previous image. Reference errors: "
                    + "; ".join(ref_errors)
                ),
                error_type="reference_image_required",
                provider="openrouter",
                model=model,
                prompt=prompt,
                aspect_ratio=aspect,
            )

        # When reference images are attached the model otherwise tends to draw
        # the scene and ignore them (e.g. omit the logo). Append an explicit
        # directive so it composites the references faithfully and unaltered.
        text = prompt
        if ref_blocks:
            text = (
                prompt
                + "\n\nIMPORTANT: "
                + f"{len(ref_blocks)} reference image(s) are attached. Reproduce them "
                "EXACTLY and FAITHFULLY in the output — composite the provided brand "
                "logo / asset unaltered (do not redraw, restyle, recolor, or omit it). "
                "Place each reference cleanly exactly where the prompt instructs."
            )
        content_blocks: List[Dict[str, Any]] = [{"type": "text", "text": text}]
        content_blocks.extend(ref_blocks)

        payload = {
            "model": model,
            "modalities": ["image", "text"],
            "messages": [
                {
                    "role": "user",
                    "content": content_blocks,
                }
            ],
            "image_generation": {
                "size": size,
                "n": 1,
            },
        }
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/NousResearch/hermes-agent",
            "X-Title": "Hermes Agent",
        }

        try:
            with httpx.Client(timeout=180.0) as client:
                resp = client.post(
                    f"{_base_url()}/chat/completions",
                    json=payload,
                    headers=headers,
                )
                resp.raise_for_status()
                body = resp.json()
        except httpx.HTTPStatusError as exc:
            return error_response(
                error=f"OpenRouter returned {exc.response.status_code}: {exc.response.text[:300]}",
                error_type="api_error",
                provider="openrouter",
                model=model,
                prompt=prompt,
                aspect_ratio=aspect,
            )
        except Exception as exc:
            logger.debug("OpenRouter image gen failed", exc_info=True)
            return error_response(
                error=f"OpenRouter image generation failed: {exc}",
                error_type="api_error",
                provider="openrouter",
                model=model,
                prompt=prompt,
                aspect_ratio=aspect,
            )

        # The image arrives either as a base64 data URL in a content
        # block of type "image_url", or as a top-level "images" field
        # depending on the model. Handle both.
        b64: Optional[str] = None
        url: Optional[str] = None

        choices = body.get("choices") or []
        if choices:
            msg = choices[0].get("message", {})
            content = msg.get("content")
            if isinstance(content, list):
                for block in content:
                    btype = block.get("type")
                    if btype == "image_url":
                        u = (block.get("image_url") or {}).get("url", "")
                        if u.startswith("data:") and "base64," in u:
                            b64 = u.split("base64,", 1)[1]
                            break
                        if u:
                            url = u
                            break
                    if btype == "output_image":
                        b64 = block.get("image_base64") or block.get("data")
                        if b64:
                            break
            # OpenRouter also occasionally returns a top-level images list.
            if not b64 and not url:
                images = msg.get("images") or body.get("images") or []
                if images:
                    first = images[0]
                    if isinstance(first, dict):
                        u = (first.get("image_url") or {}).get("url") or first.get("url")
                        if u and u.startswith("data:") and "base64," in u:
                            b64 = u.split("base64,", 1)[1]
                        elif u:
                            url = u

        if not b64 and not url:
            return error_response(
                error=f"OpenRouter response contained no image. Body keys: {list(body.keys())}",
                error_type="empty_response",
                provider="openrouter",
                model=model,
                prompt=prompt,
                aspect_ratio=aspect,
            )

        if b64:
            try:
                saved_path = save_b64_image(b64, prefix=f"openrouter_{model.replace('/', '_')}")
            except Exception as exc:
                return error_response(
                    error=f"Could not save image to cache: {exc}",
                    error_type="io_error",
                    provider="openrouter",
                    model=model,
                    prompt=prompt,
                    aspect_ratio=aspect,
                )
            image_ref = str(saved_path)
        else:
            image_ref = url  # type: ignore[assignment]

        return success_response(
            image=image_ref,
            model=model,
            prompt=prompt,
            aspect_ratio=aspect,
            provider="openrouter",
            extra={"size": size, "reference_errors": ref_errors} if ref_errors else {"size": size},
        )


# ---------------------------------------------------------------------------
# Auto-link a generated image to an existing post.
#
# The system prompt *instructs* the agent to copy the image into the client
# assets folder and then PATCH /posts/<id> {image:url} after generating. In
# practice the agent frequently generates the image and never does the PATCH
# (especially when the conversation context is noisy), so the post keeps its old
# cover and the user sees "nothing happened". When the caller passes `post_id`
# we perform copy + PATCH + confirm deterministically in-process, so the result
# never depends on the model remembering the follow-up steps. With no `post_id`
# the behaviour is unchanged (stand-alone / Telegram image generation).
# ---------------------------------------------------------------------------


def _assets_dir() -> str:
    return os.environ.get("CLIENT_ASSETS_DIR", "/opt/marketing-planner/client/assets")


def _public_assets_base() -> str:
    return os.environ.get(
        "PUBLIC_ASSETS_BASE", "https://staging.marketing.gfinnov.com/api/v1"
    ).rstrip("/")


def _api_base() -> str:
    return os.environ.get("API_BASE", "").rstrip("/")


def _api_headers() -> Dict[str, str]:
    token = os.environ.get("API_TOKEN", "")
    return {"Authorization": f"Bearer {token}"} if token else {}


def _internal_api_url(url: str) -> str:
    """Route our own public dashboard API URLs through the container network."""
    api_base = _api_base()
    if not api_base or "/api/v1/" not in url:
        return url
    return f"{api_base}/{url.split('/api/v1/', 1)[1]}"


def _resolve_image_bytes(image_ref: str) -> bytes:
    """`image_ref` is a local cache file path, an http(s) URL, or a data: URI."""
    if image_ref.startswith("data:"):
        return base64.b64decode(image_ref.split(",", 1)[1])
    if image_ref.startswith("http://") or image_ref.startswith("https://"):
        resolved_url = _internal_api_url(image_ref)
        with httpx.Client(timeout=60.0) as client:
            r = client.get(resolved_url, headers=_api_headers())
            r.raise_for_status()
            return r.content
    with open(image_ref, "rb") as f:
        return f.read()


def _mime_from_bytes(data: bytes, fallback_ref: str) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"GIF87a") or data.startswith(b"GIF89a"):
        return "image/gif"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return mimetypes.guess_type(fallback_ref)[0] or "image/png"


def _reference_to_data_uri(ref: str) -> str:
    """Turn a reference-image pointer into an inline `data:` URI for the request.

    Accepts: a `data:` URI (passed through), an http(s) URL, an absolute local
    path, or a bare asset filename (resolved against the client assets dir, then
    falling back to the public assets URL). Lets the agent hand the model the
    REAL logo/product image instead of describing it (which produced wrong
    logos), without having to base64-encode it itself.
    """
    ref = ref.strip()
    if ref.startswith("data:"):
        return ref
    resolved = ref
    if not (ref.startswith("http://") or ref.startswith("https://") or os.path.isabs(ref)):
        candidate = os.path.join(_assets_dir(), ref)
        if os.path.exists(candidate):
            resolved = candidate
        else:
            slug = os.environ.get("CLIENT_SLUG", "")
            resolved = f"{_public_assets_base()}/clients/{slug}/assets/files/{ref}"
    data = _resolve_image_bytes(resolved)
    mime = _mime_from_bytes(data, resolved)
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _publish_reserve_image(image_ref: str) -> Dict[str, Any]:
    """Copy a freshly generated image into the PUBLIC client assets dir as a
    reserve asset (not linked to any post) and return its public URL.

    This is what lets the web "Ask Viktor" chat actually DISPLAY a generated
    image: the raw generator output is a local cache path (or a transient/data
    URL) the browser cannot load. Publishing gives every generation a stable
    https URL under our own assets domain that the chat can render inline.
    """
    slug = os.environ.get("CLIENT_SLUG", "")
    if not slug:
        return {"published": False, "error": "CLIENT_SLUG not set"}
    filename = f"gen_{int(time.time() * 1000)}.png"
    dest_dir = _assets_dir()
    dest_path = os.path.join(dest_dir, filename)
    try:
        data = _resolve_image_bytes(image_ref)
        os.makedirs(dest_dir, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(data)
    except Exception as exc:
        return {"published": False, "error": f"copy into assets failed: {exc}"}
    url = f"{_public_assets_base()}/clients/{slug}/assets/files/{filename}"
    try:
        _append_manifest(dest_dir, filename, url, "")  # empty post_id -> reserve
    except Exception:
        logger.debug("manifest append (reserve) failed", exc_info=True)
    return {"published": True, "url": url}


def _append_manifest(
    dest_dir: str,
    filename: str,
    url: str,
    post_id: str,
    *,
    kind: str = "image",
    source: str = "openrouter:image_generate(auto-link)",
    design_brief: str = "",
    tags: Optional[List[str]] = None,
) -> None:
    """Best-effort manifest entry so the asset shows up on the Assets tab."""
    manifest_path = os.path.join(dest_dir, "manifest.json")
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except Exception:
        manifest = {}
    items = manifest.get("items")
    if not isinstance(items, list):
        items = []
    used = {str(it.get("id", "")) for it in items if isinstance(it, dict)}
    n = 1
    while f"a{n:03d}" in used:
        n += 1
    entry: Dict[str, Any] = {
        "id": f"a{n:03d}",
        "filename": filename,
        "url": url,
        "kind": kind,
        "source": source,
        "usedInPosts": [post_id] if post_id else [],
        "owner": "Viktor (staging)",
        "finalApproved": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    if design_brief:
        entry["designBrief"] = design_brief
    if tags:
        entry["tags"] = tags
    items.append(entry)
    manifest["items"] = items
    tmp = manifest_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    os.replace(tmp, manifest_path)


def _fetch_post(post_id: str) -> Dict[str, Any]:
    slug = os.environ.get("CLIENT_SLUG", "")
    api_base = _api_base()
    if not (slug and api_base and post_id):
        return {}
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(
                f"{api_base}/clients/{slug}/posts/{post_id}",
                headers=_api_headers(),
            )
            r.raise_for_status()
            data = r.json() or {}
            return data if isinstance(data, dict) else {}
    except Exception:
        logger.debug("could not fetch post %r", post_id, exc_info=True)
        return {}


def _current_post_image(post_id: str) -> str:
    return str(_fetch_post(post_id).get("image") or "")


def _branding_logo_refs() -> List[str]:
    slug = os.environ.get("CLIENT_SLUG", "")
    api_base = _api_base()
    if not (slug and api_base):
        return []
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(
                f"{api_base}/clients/{slug}/brief",
                headers=_api_headers(),
            )
            r.raise_for_status()
            logos = (((r.json() or {}).get("data") or {}).get("branding") or {}).get("logos") or []
    except Exception:
        logger.debug("could not fetch branding logos", exc_info=True)
        return []
    refs: List[str] = []
    for item in logos:
        if isinstance(item, dict) and item.get("url"):
            refs.append(str(item["url"]))
        elif isinstance(item, str):
            refs.append(item)
    return refs


def _append_unique_ref(refs: List[str], ref: str) -> None:
    if ref and ref not in refs:
        refs.append(ref)


def _openrouter_url(path_or_url: str) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    base = _base_url()
    if path_or_url.startswith("/api/"):
        origin = base.split("/api/", 1)[0]
        return f"{origin}{path_or_url}"
    if path_or_url.startswith("/"):
        return f"{base}{path_or_url}"
    return f"{base}/{path_or_url}"


def _resolve_video_aspect_ratio(value: Any) -> str:
    raw = str(value or "landscape").strip().lower()
    return _ASPECT_TO_VIDEO_ASPECT.get(raw, "16:9")


def _resolve_video_duration(value: Any) -> int:
    try:
        duration = int(value)
    except Exception:
        duration = DEFAULT_VIDEO_DURATION
    return max(4, min(15, duration))


def _resolve_video_resolution(value: Any) -> str:
    raw = str(value or DEFAULT_VIDEO_RESOLUTION).strip()
    return raw if raw in {"480p", "720p"} else DEFAULT_VIDEO_RESOLUTION


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def _public_image_url(ref: str) -> str:
    """Resolve a user-provided image reference to a public HTTPS URL for videos.

    OpenRouter's video API fetches references itself, so it needs URLs rather
    than inline data. For bare asset filenames and paths under the client assets
    dir, return the dashboard's public asset URL.
    """
    ref = ref.strip()
    if not ref:
        raise ValueError("empty image reference")
    if ref.startswith("data:"):
        raise ValueError("data: image references are not supported for video; use a public URL or asset filename")
    if ref.startswith("http://") or ref.startswith("https://"):
        return ref

    assets_dir = os.path.abspath(_assets_dir())
    if os.path.isabs(ref):
        abs_ref = os.path.abspath(ref)
        if not abs_ref.startswith(assets_dir + os.sep):
            raise ValueError(f"local reference must be inside {assets_dir}")
        filename = os.path.basename(abs_ref)
    else:
        filename = os.path.basename(ref)
        candidate = os.path.join(assets_dir, filename)
        if not os.path.exists(candidate):
            raise ValueError(f"asset file not found: {filename}")

    slug = os.environ.get("CLIENT_SLUG", "")
    if not slug:
        raise ValueError("CLIENT_SLUG not set")
    return f"{_public_assets_base()}/clients/{slug}/assets/files/{filename}"


def _video_cache_dir() -> str:
    root = os.environ.get("HERMES_HOME") or os.path.expanduser("~/.hermes")
    path = os.path.join(root, "cache", "videos")
    os.makedirs(path, exist_ok=True)
    return path


def _save_video_bytes(data: bytes, *, model: str, job_id: str) -> str:
    safe_model = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in model)
    safe_job = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in job_id)[:48]
    filename = f"openrouter_{safe_model}_{safe_job}_{int(time.time() * 1000)}.mp4"
    path = os.path.join(_video_cache_dir(), filename)
    with open(path, "wb") as f:
        f.write(data)
    return path


def _download_video(client: httpx.Client, status: Dict[str, Any], api_key: str) -> bytes:
    urls = status.get("unsigned_urls") or []
    download_url = ""
    if urls and isinstance(urls[0], str):
        download_url = urls[0]
    if not download_url:
        job_id = status.get("id")
        if not job_id:
            raise ValueError("completed video job did not include an id")
        download_url = f"{_base_url()}/videos/{job_id}/content?index=0"

    headers = {"Authorization": f"Bearer {api_key}"} if "openrouter.ai/api/" in download_url else {}
    resp = client.get(download_url, headers=headers)
    resp.raise_for_status()
    return resp.content


def _publish_generated_video(video_path: str, prompt: str, model: str, post_id: str = "") -> Dict[str, Any]:
    slug = os.environ.get("CLIENT_SLUG", "")
    if not slug:
        return {"published": False, "error": "CLIENT_SLUG not set"}

    filename = f"video_{int(time.time() * 1000)}.mp4"
    dest_dir = _assets_dir()
    dest_path = os.path.join(dest_dir, filename)
    try:
        with open(video_path, "rb") as f:
            data = f.read()
        os.makedirs(dest_dir, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(data)
    except Exception as exc:
        return {"published": False, "error": f"copy into assets failed: {exc}"}

    url = f"{_public_assets_base()}/clients/{slug}/assets/files/{filename}"
    try:
        _append_manifest(
            dest_dir,
            filename,
            url,
            post_id,
            kind="video",
            source=f"openrouter:video_generate({model})",
            design_brief=prompt,
            tags=["video", "seedance-2.0"],
        )
    except Exception:
        logger.debug("manifest append (video) failed", exc_info=True)
    return {"published": True, "url": url, "path": dest_path}


def _handle_video_generate(args: Dict[str, Any], **_kw: Any) -> str:
    prompt = (args.get("prompt") or "").strip()
    if not prompt:
        return json.dumps({
            "success": False,
            "video": None,
            "error": "prompt is required for video generation",
            "error_type": "invalid_argument",
        })

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        return json.dumps({
            "success": False,
            "video": None,
            "error": "OPENROUTER_API_KEY not set",
            "error_type": "auth_required",
        })

    model = (args.get("model") or _video_model()).strip()
    duration = _resolve_video_duration(args.get("duration"))
    resolution = _resolve_video_resolution(args.get("resolution"))
    aspect_ratio = _resolve_video_aspect_ratio(args.get("aspect_ratio"))
    generate_audio = _as_bool(args.get("generate_audio"), False)
    post_id = (args.get("post_id") or "").strip()

    reference_errors: List[str] = []
    input_references: List[Dict[str, Any]] = []
    raw_refs = args.get("input_references") or args.get("reference_images") or []
    if isinstance(raw_refs, str):
        raw_refs = [raw_refs]
    for ref in raw_refs:
        try:
            url = _public_image_url(str(ref))
        except Exception as exc:
            reference_errors.append(f"{ref}: {exc}")
            continue
        input_references.append({"type": "image_url", "image_url": {"url": url}})

    frame_images: List[Dict[str, Any]] = []
    for key, frame_type in (("first_frame", "first_frame"), ("last_frame", "last_frame")):
        ref = (args.get(key) or "").strip()
        if not ref:
            continue
        try:
            url = _public_image_url(ref)
        except Exception as exc:
            reference_errors.append(f"{key}={ref}: {exc}")
            continue
        frame_images.append({
            "type": "image_url",
            "image_url": {"url": url},
            "frame_type": frame_type,
        })

    if (raw_refs or args.get("first_frame") or args.get("last_frame")) and reference_errors:
        return json.dumps({
            "success": False,
            "video": None,
            "error": "One or more video reference images could not be resolved: " + "; ".join(reference_errors),
            "error_type": "reference_image_error",
            "provider": "openrouter",
            "model": model,
        })

    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "generate_audio": generate_audio,
    }
    if input_references:
        payload["input_references"] = input_references
    if frame_images:
        payload["frame_images"] = frame_images

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/NousResearch/hermes-agent",
        "X-Title": "Hermes Agent",
    }

    try:
        with httpx.Client(timeout=120.0) as client:
            resp = client.post(f"{_base_url()}/videos", json=payload, headers=headers)
            resp.raise_for_status()
            status: Dict[str, Any] = resp.json()

            interval = float(os.environ.get("OPENROUTER_VIDEO_POLL_INTERVAL", DEFAULT_VIDEO_POLL_INTERVAL))
            max_polls = int(os.environ.get("OPENROUTER_VIDEO_MAX_POLLS", DEFAULT_VIDEO_MAX_POLLS))
            for _attempt in range(max_polls):
                if status.get("status") == "completed":
                    break
                if status.get("status") in {"failed", "cancelled", "expired"}:
                    return json.dumps({
                        "success": False,
                        "video": None,
                        "error": status.get("error") or f"Video generation {status.get('status')}",
                        "error_type": "api_error",
                        "provider": "openrouter",
                        "model": model,
                        "job": status,
                    })
                polling_url = status.get("polling_url")
                if not polling_url:
                    return json.dumps({
                        "success": False,
                        "video": None,
                        "error": "OpenRouter video job did not include polling_url",
                        "error_type": "api_error",
                        "provider": "openrouter",
                        "model": model,
                        "job": status,
                    })
                time.sleep(interval)
                poll = client.get(_openrouter_url(str(polling_url)), headers={"Authorization": f"Bearer {api_key}"})
                poll.raise_for_status()
                status = poll.json()

            if status.get("status") != "completed":
                return json.dumps({
                    "success": False,
                    "video": None,
                    "error": f"Video generation did not complete after {max_polls} polls",
                    "error_type": "timeout",
                    "provider": "openrouter",
                    "model": model,
                    "job": status,
                })

            video_bytes = _download_video(client, status, api_key)
    except httpx.HTTPStatusError as exc:
        return json.dumps({
            "success": False,
            "video": None,
            "error": f"OpenRouter returned {exc.response.status_code}: {exc.response.text[:300]}",
            "error_type": "api_error",
            "provider": "openrouter",
            "model": model,
        })
    except Exception as exc:
        logger.debug("OpenRouter video generation failed", exc_info=True)
        return json.dumps({
            "success": False,
            "video": None,
            "error": f"OpenRouter video generation failed: {exc}",
            "error_type": "api_error",
            "provider": "openrouter",
            "model": model,
        })

    job_id = str(status.get("id") or status.get("generation_id") or "job")
    try:
        cache_path = _save_video_bytes(video_bytes, model=model, job_id=job_id)
    except Exception as exc:
        return json.dumps({
            "success": False,
            "video": None,
            "error": f"Could not save video to cache: {exc}",
            "error_type": "io_error",
            "provider": "openrouter",
            "model": model,
            "job": status,
        })

    asset = _publish_generated_video(cache_path, prompt, model, post_id)
    public_url = asset.get("url") if asset.get("published") else ""
    result = {
        "success": bool(public_url),
        "video": public_url or cache_path,
        "path": cache_path,
        "media": f"MEDIA:{cache_path}",
        "asset": asset,
        "provider": "openrouter",
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
        "generate_audio": generate_audio,
        "job": {
            "id": status.get("id"),
            "status": status.get("status"),
            "generation_id": status.get("generation_id"),
            "usage": status.get("usage"),
        },
    }
    if public_url and post_id:
        result["post_link"] = _link_video_to_post(str(public_url), post_id, prompt)
    if not public_url:
        result["error"] = asset.get("error") or "video generated but could not publish public asset"
        result["error_type"] = "publish_error"
    return json.dumps(result)


def _link_image_to_post(image_ref: str, post_id: str) -> Dict[str, Any]:
    """Copy the generated image into the client assets dir and PATCH the post.

    Returns a small status dict; `linked` is True only when a follow-up GET
    confirms the post's `image` now equals our new asset URL.
    """
    slug = os.environ.get("CLIENT_SLUG", "")
    api_base = _api_base()
    token = os.environ.get("API_TOKEN", "")
    if not (slug and api_base and token):
        return {
            "linked": False,
            "error": "CLIENT_SLUG/API_BASE/API_TOKEN not set; cannot auto-link",
        }

    # Unique filename: served assets are immutable/cached by name, so reusing
    # "<post_id>_cover.png" would surface a stale image after a re-generation.
    filename = f"{post_id}_{int(time.time() * 1000)}.png"
    dest_dir = _assets_dir()
    dest_path = os.path.join(dest_dir, filename)
    try:
        data = _resolve_image_bytes(image_ref)
        os.makedirs(dest_dir, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(data)
    except Exception as exc:
        return {"linked": False, "error": f"copy into assets failed: {exc}"}

    url = f"{_public_assets_base()}/clients/{slug}/assets/files/{filename}"

    try:
        _append_manifest(dest_dir, filename, url, post_id)
    except Exception:
        logger.debug("manifest append failed", exc_info=True)

    headers = {**_api_headers(), "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=30.0) as client:
            patch = client.patch(
                f"{api_base}/clients/{slug}/posts/{post_id}",
                json={"image": url},
                headers=headers,
            )
            patch.raise_for_status()
            confirm = client.get(
                f"{api_base}/clients/{slug}/posts/{post_id}", headers=headers
            )
            confirm.raise_for_status()
            served = (confirm.json() or {}).get("image", "")
    except httpx.HTTPStatusError as exc:
        return {
            "linked": False,
            "url": url,
            "error": f"PATCH /posts/{post_id} -> {exc.response.status_code}: {exc.response.text[:200]}",
        }
    except Exception as exc:
        return {"linked": False, "url": url, "error": f"PATCH /posts/{post_id} failed: {exc}"}

    return {"linked": served == url, "url": url, "post_image": served, "post_id": post_id}


def _link_slide_to_post(
    image_ref: str, post_id: str, slide_index: int, caption: str = ""
) -> Dict[str, Any]:
    """Copy a generated image into assets and set it as carousel slide
    `slide_index` (1-based) of the post, deterministically.

    Mirrors `_link_image_to_post` (copy + manifest + confirm) but builds a
    carousel instead of just the cover: the post becomes `format:"carousel"`,
    the slide is appended at the requested 1-based index (re-using an index
    REPLACES that slide on re-generation), and the cover `image` is kept in
    sync with slides[0].image so thumbnails/calendar keep working. `linked` is
    True only when a follow-up GET confirms our slide URL is in the deck.

    This is the carousel analogue of the single-image path: each call commits a
    valid carousel in-process, so an interruption after slide k leaves a real
    k-slide carousel rather than a `format:carousel` post with empty slides[].
    """
    slug = os.environ.get("CLIENT_SLUG", "")
    api_base = _api_base()
    token = os.environ.get("API_TOKEN", "")
    if not (slug and api_base and token):
        return {
            "linked": False,
            "error": "CLIENT_SLUG/API_BASE/API_TOKEN not set; cannot auto-link",
        }
    if slide_index < 1:
        return {"linked": False, "error": "slide_index must be >= 1"}

    # Unique filename so the immutable/cached asset URL changes on re-generation.
    filename = f"{post_id}_slide{slide_index}_{int(time.time() * 1000)}.png"
    dest_dir = _assets_dir()
    dest_path = os.path.join(dest_dir, filename)
    try:
        data = _resolve_image_bytes(image_ref)
        os.makedirs(dest_dir, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(data)
    except Exception as exc:
        return {"linked": False, "error": f"copy into assets failed: {exc}"}

    url = f"{_public_assets_base()}/clients/{slug}/assets/files/{filename}"
    try:
        _append_manifest(dest_dir, filename, url, post_id)
    except Exception:
        logger.debug("manifest append failed", exc_info=True)

    # Read the existing deck so we APPEND/REPLACE instead of clobbering it.
    post = _fetch_post(post_id)
    raw_slides = post.get("slides")
    slides: List[Dict[str, Any]] = []
    if isinstance(raw_slides, list):
        for item in raw_slides:
            if isinstance(item, dict) and isinstance(item.get("image"), str) and item["image"]:
                clean: Dict[str, Any] = {"image": item["image"]}
                if isinstance(item.get("caption"), str) and item["caption"]:
                    clean["caption"] = item["caption"]
                slides.append(clean)

    entry: Dict[str, Any] = {"image": url}
    if caption:
        entry["caption"] = caption[:500]
    idx = slide_index - 1
    if idx < len(slides):
        slides[idx] = entry          # re-generation of an existing slide
    else:
        # Normal next-slide append. If the caller skips ahead, append at the end
        # rather than create empty gaps — the API's strict slide shape rejects
        # placeholder slides, and the agent is told to go in order.
        slides.append(entry)

    cover = slides[0]["image"] if slides else url
    body = {"slides": slides, "image": cover, "format": "carousel"}
    headers = {**_api_headers(), "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=30.0) as client:
            patch = client.patch(
                f"{api_base}/clients/{slug}/posts/{post_id}",
                json=body,
                headers=headers,
            )
            patch.raise_for_status()
            confirm = client.get(
                f"{api_base}/clients/{slug}/posts/{post_id}", headers=headers
            )
            confirm.raise_for_status()
            served_slides = (confirm.json() or {}).get("slides", [])
    except httpx.HTTPStatusError as exc:
        return {
            "linked": False,
            "url": url,
            "error": f"PATCH /posts/{post_id} slides -> {exc.response.status_code}: {exc.response.text[:200]}",
        }
    except Exception as exc:
        return {"linked": False, "url": url, "error": f"PATCH /posts/{post_id} slides failed: {exc}"}

    linked = isinstance(served_slides, list) and any(
        isinstance(s, dict) and s.get("image") == url for s in served_slides
    )
    return {
        "linked": linked,
        "url": url,
        "slide_index": slide_index,
        "slide_count": len(served_slides) if isinstance(served_slides, list) else 0,
        "post_id": post_id,
    }


def _link_video_to_post(video_url: str, post_id: str, prompt: str) -> Dict[str, Any]:
    """Append a generated MP4 to the post's mixed media array."""
    slug = os.environ.get("CLIENT_SLUG", "")
    api_base = _api_base()
    token = os.environ.get("API_TOKEN", "")
    if not (slug and api_base and token):
        return {
            "linked": False,
            "error": "CLIENT_SLUG/API_BASE/API_TOKEN not set; cannot auto-link",
        }
    if not video_url:
        return {"linked": False, "error": "video URL missing"}

    post = _fetch_post(post_id)
    raw_media = post.get("media")
    media: List[Dict[str, Any]] = []
    if isinstance(raw_media, list):
        for item in raw_media:
            if not isinstance(item, dict):
                continue
            item_type = item.get("type")
            item_url = item.get("url")
            if item_type not in {"image", "video"} or not isinstance(item_url, str) or not item_url:
                continue
            clean: Dict[str, Any] = {"type": item_type, "url": item_url}
            for key in ("thumbnail", "caption", "assetId"):
                if isinstance(item.get(key), str) and item.get(key):
                    clean[key] = item[key]
            media.append(clean)

    already_linked = any(item.get("type") == "video" and item.get("url") == video_url for item in media)
    if not already_linked:
        entry: Dict[str, Any] = {"type": "video", "url": video_url}
        if prompt:
            entry["caption"] = prompt[:500]
        media.append(entry)

    headers = {**_api_headers(), "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=30.0) as client:
            patch = client.patch(
                f"{api_base}/clients/{slug}/posts/{post_id}",
                json={"media": media},
                headers=headers,
            )
            patch.raise_for_status()
            confirm = client.get(
                f"{api_base}/clients/{slug}/posts/{post_id}", headers=headers
            )
            confirm.raise_for_status()
            served_media = (confirm.json() or {}).get("media", [])
    except httpx.HTTPStatusError as exc:
        return {
            "linked": False,
            "url": video_url,
            "error": f"PATCH /posts/{post_id} media -> {exc.response.status_code}: {exc.response.text[:200]}",
        }
    except Exception as exc:
        return {"linked": False, "url": video_url, "error": f"PATCH /posts/{post_id} media failed: {exc}"}

    linked = isinstance(served_media, list) and any(
        isinstance(item, dict) and item.get("type") == "video" and item.get("url") == video_url
        for item in served_media
    )
    return {"linked": linked, "url": video_url, "post_id": post_id, "already_linked": already_linked}


# ---------------------------------------------------------------------------
# Agent-facing tool: override the built-in `image_generate` so the agent can
# choose generation speed per request via a `fidelity` argument. The built-in
# schema only exposes prompt + aspect_ratio and the model is fixed per process;
# this override adds `fidelity` ("fast" | "high") and maps it to a model.
# ---------------------------------------------------------------------------

IMAGE_GENERATE_FIDELITY_SCHEMA = {
    "name": "image_generate",
    "description": (
        "Generate an image from a text prompt (optionally conditioned on one or "
        "more reference images) and return its file path/URL in the `image` field; "
        "display it with markdown ![description](url-or-path) and the gateway "
        "delivers it. The `fidelity` argument selects the model: 'fast' = Nano "
        "Banana 2 (a few seconds), 'high' = premium quality (~3 minutes). The "
        "default model is Nano Banana 2, but ask the user to choose fast vs high "
        "before generating and pass the selected fidelity explicitly. Pass "
        "`reference_images` when the result must contain "
        "the EXACT official logo or match a real product/photo — the model can't "
        "invent the real logo from a text description, so give it the actual file."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "The text prompt describing the desired image. Be detailed and descriptive.",
            },
            "channel": {
                "type": "string",
                "enum": ["instagram", "linkedin", "x", "facebook"],
                "description": (
                    "Target social channel for this image. The channel DECIDES the "
                    "format: 'instagram' => VERTICAL 4:5 (1080x1350); "
                    "'linkedin'/'x'/'facebook' => horizontal. Always pass this (or a "
                    "post_id whose channel is known) so the size matches the channel "
                    "— do NOT rely on a global default. Overrides aspect_ratio."
                ),
            },
            "aspect_ratio": {
                "type": "string",
                "enum": ["landscape", "square", "portrait", "portrait_4_5"],
                "description": (
                    "Manual override, used ONLY when no channel is given. "
                    "'landscape' 3:2 wide, 'portrait' tall 2:3, 'portrait_4_5' "
                    "Instagram vertical 4:5 (1080x1350), 'square' 1:1. Prefer "
                    "passing `channel` instead so format follows the channel."
                ),
                "default": DEFAULT_ASPECT_RATIO,
            },
            "fidelity": {
                "type": "string",
                "enum": ["fast", "high"],
                "description": "Ask the user first. 'fast' = Nano Banana 2 (~seconds); 'high' = premium model (~3 min).",
            },
            "post_id": {
                "type": "string",
                "description": (
                    "If this image is the cover for an EXISTING post, pass its id "
                    "(e.g. 'p003'). The tool then copies the image into the client "
                    "assets folder, links it to the post (PATCH image) and confirms — "
                    "you do NOT need to copy the file or PATCH the post yourself. "
                    "Omit for stand-alone / reserve images. For a CAROUSEL slide, "
                    "pass post_id together with `slide_index`."
                ),
            },
            "slide_index": {
                "type": "integer",
                "minimum": 1,
                "description": (
                    "CAROUSEL slides ONLY. The 1-based position of THIS image in "
                    "the post's carousel (slide 1 = cover). Pass it together with "
                    "`post_id` and the tool generates the slide AND appends it to "
                    "the post's slides[] in ONE call — it sets format:\"carousel\" "
                    "and keeps the cover = slide 1. Call once per slide, in order "
                    "(1, 2, 3, …); re-using an index REGENERATES that slide. Do NOT "
                    "copy files or PATCH slides[] yourself. Omit for a normal "
                    "single-image cover."
                ),
            },
            "caption": {
                "type": "string",
                "description": (
                    "Optional per-slide design note for a carousel slide (used only "
                    "with `slide_index`). NOT a second body — the post's single "
                    "caption stays in the post `copy`."
                ),
            },
            "reference_images": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Optional. Reference image(s) the model should CONDITION on "
                    "(image-to-image), instead of you describing them in words. Each "
                    "is a public URL, an absolute path, or an asset filename (e.g. "
                    "'logo_official.png'). USE THIS whenever the image must show the "
                    "EXACT official logo, a specific product, or match an existing "
                    "visual — describing a logo in text produces a WRONG logo, so pass "
                    "the real file here (find the logo via the brief's branding.logos "
                    "or the client assets folder). OMIT for purely text-described images."
                ),
            },
        },
        "required": ["prompt"],
    },
}

VIDEO_GENERATE_SCHEMA = {
    "name": "video_generate",
    "description": (
        "Generate a short MP4 video with OpenRouter's bytedance/seedance-2.0 "
        "video model. The tool submits the async OpenRouter video job, polls "
        "until completion, downloads the MP4, publishes it to the client's "
        "assets folder, appends the manifest entry as kind='video', and returns "
        "a public URL in the `video` field. Use `input_references` for visual "
        "style/product/identity guidance, or `first_frame`/`last_frame` when the "
        "video must start/end on exact existing image assets."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "prompt": {
                "type": "string",
                "description": "Detailed video prompt including subject, camera movement, lighting, motion, pacing, and brand style.",
            },
            "aspect_ratio": {
                "type": "string",
                "enum": ["landscape", "portrait", "square", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9", "9:21"],
                "description": "Output shape. Friendly values map to landscape=16:9, portrait=9:16, square=1:1.",
                "default": "landscape",
            },
            "duration": {
                "type": "integer",
                "minimum": 4,
                "maximum": 15,
                "description": "Clip duration in seconds. Seedance supports short clips; default is 5.",
                "default": DEFAULT_VIDEO_DURATION,
            },
            "resolution": {
                "type": "string",
                "enum": ["480p", "720p"],
                "description": "Output resolution. Use 720p unless the user asks otherwise.",
                "default": DEFAULT_VIDEO_RESOLUTION,
            },
            "generate_audio": {
                "type": "boolean",
                "description": "Whether to ask the video model for audio when supported. Default false for marketing draft clips.",
                "default": False,
            },
            "input_references": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Optional public image URLs, asset filenames, or paths under "
                    "the client assets folder that should guide subject, identity, "
                    "or style without forcing exact first/last frames."
                ),
            },
            "first_frame": {
                "type": "string",
                "description": "Optional public image URL or asset filename to anchor the exact first frame.",
            },
            "last_frame": {
                "type": "string",
                "description": "Optional public image URL or asset filename to anchor the exact last frame.",
            },
            "post_id": {
                "type": "string",
                "description": "Optional dashboard post id. When present, the generated MP4 is appended to that post's media[] as type='video'.",
            },
            "model": {
                "type": "string",
                "description": "Optional override. Default is bytedance/seedance-2.0 via OPENROUTER_VIDEO_MODEL.",
                "default": DEFAULT_VIDEO_MODEL,
            },
        },
        "required": ["prompt"],
    },
}


def _image_gen_available(*_args: Any, **_kw: Any) -> bool:
    return bool(os.environ.get("OPENROUTER_API_KEY"))


def _handle_image_generate(args: Dict[str, Any], **_kw: Any) -> str:
    """Tool handler: resolve fidelity → model, then run the OpenRouter provider."""
    prompt = (args.get("prompt") or "").strip()
    if not prompt:
        return json.dumps({
            "success": False,
            "image": None,
            "error": "prompt is required for image generation",
            "error_type": "invalid_argument",
        })
    model = _model_for_fidelity(args.get("fidelity"))
    post_id = (args.get("post_id") or "").strip()
    # GF-62: a carousel slide is generated AND linked into the post's slides[]
    # in one call when both post_id and slide_index (1-based) are given.
    try:
        slide_index = int(args.get("slide_index") or 0)
    except (TypeError, ValueError):
        slide_index = 0
    slide_caption = (args.get("caption") or "").strip()
    is_slide = bool(post_id) and slide_index >= 1
    # GF-33: format follows the TARGET CHANNEL, not a global default. Instagram
    # ⇒ vertical 4:5 (1080x1350); LinkedIn/X/Facebook ⇒ horizontal. Prefer an
    # explicit `channel` arg, fall back to the linked post's channel, then to
    # any explicit aspect_ratio the agent passed.
    channel = (args.get("channel") or "").strip().lower()
    if not channel and post_id:
        channel = str(_fetch_post(post_id).get("channel") or "").strip().lower()
    aspect_ratio = _resolve_image_aspect(
        args.get("aspect_ratio", DEFAULT_ASPECT_RATIO), channel
    )
    # Accept reference_images as a list, or a single string for convenience.
    refs = args.get("reference_images") or args.get("reference_image") or []
    if isinstance(refs, str):
        refs = [refs]
    refs = [str(ref) for ref in refs if str(ref).strip()]
    # Condition a cover re-generation on the post's current image, but NOT a
    # carousel slide — each slide is its own visual, so seeding slide 2+ with the
    # cover would make every slide look the same.
    current_image = _current_post_image(post_id) if (post_id and not is_slide) else ""
    if current_image:
        _append_unique_ref(refs, current_image)
    # GF-28: NEVER invent a logo/isotipo. If the prompt asks for a brand mark,
    # try to attach the REAL official logo from branding; if none is available
    # and the caller passed no reference image, refuse rather than fabricate one.
    prompt_lc = prompt.lower()
    wants_logo = any(
        kw in prompt_lc
        for kw in ("logo", "isotipo", "isotype", "logotipo", "brand mark", "brandmark", "wordmark")
    )
    if wants_logo:
        for logo_ref in _branding_logo_refs():
            _append_unique_ref(refs, logo_ref)
        if not refs:
            return json.dumps({
                "success": False,
                "image": None,
                "error": (
                    "This image asks for the brand logo/isotipo, but no official "
                    "logo file is available (none in branding.logos and none passed "
                    "via reference_images). I will NOT invent a fake logo. Provide "
                    "the official logo file (reference_images=[\"logo_official.png\"], "
                    "an asset filename, or a URL), or ask me to generate the image "
                    "WITHOUT a logo (e.g. leave clean space for it)."
                ),
                "error_type": "logo_reference_required",
            })
    logger.info(
        "image_generate: post_id=%r fidelity=%r reference_images=%r",
        post_id, args.get("fidelity"), refs,
    )
    result = OpenRouterImageGenProvider().generate(
        prompt=prompt,
        aspect_ratio=aspect_ratio,
        model=model,
        reference_images=refs,
    )
    media_path = ""
    if isinstance(result, dict) and result.get("image") and not result.get("error"):
        candidate = str(result["image"])
        if candidate.startswith("/") or candidate.startswith("~/"):
            media_path = candidate
    # Deterministically wire the freshly generated image to the post, so the
    # post's cover actually updates even if the agent would otherwise skip the
    # mandatory PATCH. Only when generation succeeded and a post id was given.
    if (
        post_id
        and isinstance(result, dict)
        and result.get("image")
        and not result.get("error")
    ):
        if is_slide:
            link = _link_slide_to_post(
                str(result["image"]), post_id, slide_index, slide_caption
            )
        else:
            link = _link_image_to_post(str(result["image"]), post_id)
        result["post_link"] = link
        # Show the public asset URL (not the local cache path) as the image ref
        # so the agent references the same URL the dashboard now serves.
        if link.get("linked") and link.get("url"):
            result["image"] = link["url"]
    elif (
        isinstance(result, dict)
        and result.get("image")
        and not result.get("error")
        and not str(result.get("image", "")).startswith(
            _public_assets_base()
        )
    ):
        # Stand-alone generation (no target post): publish to a public URL so
        # the web chat can actually DISPLAY the image. Without this the agent's
        # only reference is a local cache path / transient URL the browser can't
        # load, so generated images never appeared in the Ask Viktor chat.
        pub = _publish_reserve_image(str(result["image"]))
        result["asset"] = pub
        if pub.get("published") and pub.get("url"):
            result["image"] = pub["url"]
    if isinstance(result, dict) and media_path:
        # Hermes scans tool results for MEDIA:/absolute/path and appends unseen
        # entries to the final response, which makes Telegram send the generated
        # image as a native photo even when the model only writes a text reply.
        result["media"] = f"MEDIA:{media_path}"
    return json.dumps(result)


def register(ctx) -> None:
    ctx.register_image_gen_provider(OpenRouterImageGenProvider())
    # Replace the built-in image_generate tool with the fidelity-aware version.
    # Same name + toolset so availability on every platform is unchanged.
    ctx.register_tool(
        name="image_generate",
        toolset="image_gen",
        schema=IMAGE_GENERATE_FIDELITY_SCHEMA,
        handler=_handle_image_generate,
        check_fn=_image_gen_available,
        requires_env=["OPENROUTER_API_KEY"],
        is_async=False,
        description="Generate an image (ask first; fidelity: fast=Nano Banana 2, high=premium ~3min).",
        emoji="🎨",
        override=True,
    )
    ctx.register_tool(
        name="video_generate",
        toolset="image_gen",
        schema=VIDEO_GENERATE_SCHEMA,
        handler=_handle_video_generate,
        check_fn=_image_gen_available,
        requires_env=["OPENROUTER_API_KEY"],
        is_async=False,
        description="Generate a Seedance 2.0 MP4 via OpenRouter and publish it as a dashboard video asset.",
        emoji="video",
        override=True,
    )

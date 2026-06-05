"""OpenRouter image generation backend for Hermes Agent.

Routes image generation requests to OpenRouter's image-capable models
(default: Nano Banana 2 / ``google/gemini-3.1-flash-image-preview``) via the OpenAI-compatible Chat
Completions endpoint with image content blocks. Saves the returned image
to ``$HERMES_HOME/cache/images/`` so the gateway can attach it to the
outgoing chat message.

Environment:
  OPENROUTER_API_KEY        required
  OPENROUTER_IMAGE_MODEL    optional, default Nano Banana 2
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

_ASPECT_TO_SIZE = {
    "landscape": "1536x1024",
    "square": "1024x1024",
    "portrait": "1024x1536",
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
        aspect = resolve_aspect_ratio(aspect_ratio)

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


def _append_manifest(dest_dir: str, filename: str, url: str, post_id: str) -> None:
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
    items.append(
        {
            "id": f"a{n:03d}",
            "filename": filename,
            "url": url,
            "kind": "image",
            "source": "openrouter:image_generate(auto-link)",
            "usedInPosts": [post_id] if post_id else [],
            "owner": "Viktor (staging)",
            "finalApproved": False,
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }
    )
    manifest["items"] = items
    tmp = manifest_path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    os.replace(tmp, manifest_path)


def _current_post_image(post_id: str) -> str:
    slug = os.environ.get("CLIENT_SLUG", "")
    api_base = _api_base()
    if not (slug and api_base and post_id):
        return ""
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.get(
                f"{api_base}/clients/{slug}/posts/{post_id}",
                headers=_api_headers(),
            )
            r.raise_for_status()
            return str((r.json() or {}).get("image") or "")
    except Exception:
        logger.debug("could not fetch current image for post %r", post_id, exc_info=True)
        return ""


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
            "aspect_ratio": {
                "type": "string",
                "enum": ["landscape", "square", "portrait"],
                "description": "Aspect ratio: 'landscape' 16:9 wide, 'portrait' 16:9 tall, 'square' 1:1.",
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
                    "Omit for stand-alone / reserve images."
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
    aspect_ratio = args.get("aspect_ratio", DEFAULT_ASPECT_RATIO)
    model = _model_for_fidelity(args.get("fidelity"))
    post_id = (args.get("post_id") or "").strip()
    # Accept reference_images as a list, or a single string for convenience.
    refs = args.get("reference_images") or args.get("reference_image") or []
    if isinstance(refs, str):
        refs = [refs]
    refs = [str(ref) for ref in refs if str(ref).strip()]
    current_image = _current_post_image(post_id) if post_id else ""
    if current_image:
        _append_unique_ref(refs, current_image)
    if "logo" in prompt.lower():
        for logo_ref in _branding_logo_refs():
            _append_unique_ref(refs, logo_ref)
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

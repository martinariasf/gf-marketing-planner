---
name: marketing-planner-staging
description: Workflow for the Marketing Planner Staging Dashboard API (staging-demo).
tags: [marketing, api, staging, dashboard]
---

# Marketing Planner Staging Workflow

Enfoque central: **Producción de activos para LinkedIn y redes sociales utilizando la API de staging.**

## Branding & Colores (GF Innovative Solutions)
- **Primary Green:** `#22c55e`
- **Teal:** `#14b8a6`
- **Dark Text:** `#1a1a1a`
- **Typography:** `Inter` (Global)

## Generación de Imágenes y Logos
- **Modelo por defecto = Nano Banana 2 (`fidelity="fast"`).** Antes de generar
  cualquier imagen, pregunta una vez si la persona quiere rápido / Nano Banana 2
  o alta fidelidad (`fidelity="high"`). Para un cambio normal de imagen de un
  post, usa `image_generate(post_id=...)` (ver §3) con la fidelidad elegida y
  describe la escena/marca en el prompt. NO incluyas una imagen de referencia si
  no hace falta fidelidad exacta.
- **Logo / producto EXACTO = imagen de referencia.** El modelo inventa un logo
  INCORRECTO si solo se describe con palabras. Cuando el usuario quiere el logo
  oficial real (o un producto concreto), pásale el archivo real con el argumento
  `reference_images` de `image_generate` (nombre de asset, URL o ruta), p.ej.
  `reference_images=["logo_official.png"]`. Encuentra el logo en `branding.logos`
  del brief (`GET /brief`) o en la carpeta de assets. NO uses superposición Pillow.
- **Posicionamiento:** pide en el prompt dejar espacio limpio para el logo
  (normalmente esquina inferior derecha) y deja que el modelo lo coloque.

## Comunicación & UX
- **No duplicidad:** No envíes la imagen dos veces (previsualización + URL). Una sola vez es suficiente para confirmar el cambio.
- **Acción sobre descripción:** No pidas permiso para arreglar una imagen que no cumple con el branding; arréglala inmediatamente aplicando los parámetros corregidos.

## Generacion de Videos
- **Modelo:** `bytedance/seedance-2.0` via OpenRouter.
- **Herramienta unica:** crea videos SOLO con `video_generate`. Nunca uses
  terminal, curl, llamadas OpenRouter directas ni otro API de video.
- **Branding primero:** lee `GET /clients/staging-demo/brief` y mete colores,
  tipografia y tono en el prompt.
- **Defaults:** `duration=5`, `resolution="720p"`, `aspect_ratio="landscape"`,
  `generate_audio=false` si el usuario no especifica.
- **Referencias:** usa `input_references` para estilo/producto/personaje, o
  `first_frame` / `last_frame` cuando el video deba empezar o terminar en una
  imagen exacta del asset library.
- **Resultado:** la herramienta espera el job, guarda el MP4 en assets, crea un
  manifest item `kind:"video"` y devuelve la URL publica en `video`.

## Context & Auth
- **Client Slug:** `staging-demo`
- **Dashboard URL:** `https://staging.marketing.gfinnov.com`
- **API Base:** `http://mp-staging-api:8080/api/v1` (internal)
- **Auth:** Always include `Authorization: Bearer $API_TOKEN` header.

## Core Operations

### 1. Post Lifecycle & Approvals
**NEVER** edit post status in JSON files directly if you want it to appear in the Audit Log and Kanban board.
- **Postiz rule:** every Postiz scheduling/publishing action MUST come from a
  post that is already approved in the `marketing.gfinnov.com` dashboard. Never
  send a chat-only draft, free-form copy, or unapproved dashboard post directly
  to Postiz.
- **Action:** Use `POST /clients/staging-demo/approvals`
- **Payload:** `{"postId": "p001", "decision": "approved", "note": "Optional reason"}`
- **Decisions:** `approved`, `rejected`, `in_review`, `scheduled`.

### 2. Post Content Edits
For title, copy, or date changes:
- **Action:** `PATCH /clients/staging-demo/posts/:id`
- **Payload:** `{"title": "New Title", "copy": "New text...", "date": "2026-06-15"}`

### 3. Asset & Image Management (Critical)

**★ DEFAULT — changing/setting the cover image of an EXISTING post = ONE call.**
When the user asks to change, set, or replace the image of a post that already
exists (e.g. "change the image for p016", "make p001's picture yellow"), call
`image_generate` with the `post_id` argument:

```
image_generate(prompt="<detailed prompt from post copy + brand colors>",
               fidelity="<fast-or-high-selected-by-user>",
               post_id="p016")
```

The `image_gen_openrouter` plugin then does ALL the wiring deterministically:
copies the file into `/opt/marketing-planner/client/assets/`, appends the
manifest entry, `PATCH`es the post's `image`, and confirms the post serves the
new URL. The tool result includes `post_link.linked: true` and the public `image`
url.

In this case you **MUST NOT** copy the file, edit the manifest, run a Python/PIL
overlay, or PATCH the post yourself — passing `post_id` already did all of it.
Just confirm to the user (in their language) that the post image is updated,
citing the url. Only fall back to the manual steps below if the tool result shows
`post_link.linked: false` or an `error`.

Do **NOT** invoke the `branding-overlay` skill or any logo-compositing step for a
plain "change the image" request — describe the brand colours/style inside the
`image_generate` prompt instead. Only composite the official logo when the user
**explicitly** asks for the real logo/watermark on the image (see "Logo overlay"
below).

**Manual flow — RESERVE / stand-alone assets only** (no target post yet, or
building carousel slides). OMIT `post_id`, then:
1. **Generate:** Create image via `image_generate` (omit `post_id`).
2. **Deploy:** Copy file to `/opt/marketing-planner/client/assets/<name>.png`.
3. **Register:** Add entry to `/opt/marketing-planner/client/assets/manifest.json`.
   - **URL:** `https://staging.marketing.gfinnov.com/api/v1/clients/staging-demo/assets/files/<filename>`
   - Leave `usedInPosts` empty for a reserve asset.
4. *(Carousel only)* Link with one `PATCH /clients/staging-demo/posts/:id`
   carrying the `slides[]` array (cover = `slides[0].image`).

**Exact logo / product fidelity — pass a REFERENCE IMAGE (preferred).**
The image model invents a WRONG logo when it is only *described* in the prompt.
So when the user wants the real official logo (or a specific product/photo) on
the image, give the model the actual file via `image_generate`'s
`reference_images` argument — do NOT describe the logo in words, and do NOT do a
manual Pillow overlay:

```
image_generate(prompt="<scene>, leave clean space bottom-right for the brand logo",
               reference_images=["logo_official.png"],   # asset filename, URL, or path
               post_id="p016")                            # if it's a post cover
```

Find the logo via the brief's `branding.logos` array (`GET /brief`) or the
client assets folder (e.g. `logo_official.png`). You can pass several references
(e.g. logo + a product photo). Only include a reference when fidelity to a real
asset matters — for ordinary illustrations, omit it and just describe the scene.

**Delivery:** send the generated image to the user only once (MEDIA: path or
markdown) to avoid redundancy once the URL is confirmed.

### 4. Branding & Briefing
- **Read:** `GET /clients/staging-demo/brief`
- **Logo Access:** To find official logos, check the `branding.logos` array in the client brief. Use these URLs as visual references for image generation prompts.
- **Update Branding:** `PATCH /clients/staging-demo/branding`. This merges top-level fields (colors, typography, toneKeywords) without destroying the rest of the brief.
- **Permission Fallback:** If the API returns a `403 Forbidden` for the "agent" role on branding updates, apply changes directly to the `branding` section of the client brief file via `python3` or `patch`.
- **Branding Verification:** Before updating, use `curl` and `grep` on the client's official website (e.g., `gfinnov.com`) to extract CSS variables (`--green`, `--font-family`, etc.) and ensure hex codes match current production styles.

## Pitfalls
- **Python Manifest Syntax:** When updating `manifest.json` via `python3 -c`, ensure boolean values use Python casing (`True`/`False`) and not JSON casing (`true`/`false`) to avoid `NameError`.
- **Absolute URLs:** Dashboard images *must* use the full staging URL (e.g., `https://staging.marketing.gfinnov.com/api/v1/...`) in the `image` field, not relative paths.

## Environment Constants
- **Assets Directory:** `/opt/marketing-planner/client/assets/`
- **Manifest Path:** `/opt/marketing-planner/client/assets/manifest.json`

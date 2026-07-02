# Wiring carousel slides into a GF dashboard post

Marketing Platform API. Auth: `Authorization: Bearer $API_TOKEN`.
Base: `$API_BASE/clients/$CLIENT_SLUG`. Asset files are served at
`https://marketing.gfinnov.com/api/v1/clients/gf-internal/assets/files/<filename>`.

## API quirks observed
- **GET `/posts/{id}` returns null/None fields** for these draft posts — do NOT
  rely on it. To read a single post's real content, GET `/posts` (the list) and
  filter by id in Python. The list carries title/copy/cta/hashtags/image/slides.
- **PATCH `/posts/{id}` works** and returns the full updated post object (no
  `data` wrapper on PATCH; the list endpoint and others wrap under `data`).
- `image_generate(post_id=, slide_index=)` uploads the MODEL's render (with the
  fake logo) to that slide. So don't use its auto-wiring for logo'd slides —
  instead embed the real logo locally, copy to assets, append manifest, and PATCH
  the slides[] array yourself.

## Steps to wire finished slides
1. Copy each final composited PNG into `/opt/marketing-planner/client/assets/`.
2. Append a manifest entry per file in `assets/manifest.json` (`items[]`):
   id `a###` (max existing +1), filename, url, kind:"image", source, designBrief,
   usedInPosts:[postId], owner, finalApproved:false, createdAt (ISO UTC).
3. PATCH the post with the full slides array (cover first, then inner slides):
   ```
   curl -s -X PATCH -H "Authorization: Bearer $API_TOKEN" -H "Content-Type: application/json" \
     -d '{"format":"carousel","slides":[{"image":"<url>","caption":"..."}, ...]}' \
     "$API_BASE/clients/$CLIENT_SLUG/posts/<id>"
   ```
   Verify the response shows `format=carousel` and the expected slide count.

## Workflow note
- Covers (slide 1) generated in a PRIOR session may already carry the REAL logo
  (gemini sometimes gets the cover right). ALWAYS vision-check the existing cover
  before assuming it needs re-doing — reuse it as-is if the logo is correct, and
  only embed on the newly generated inner slides. Don't regenerate good covers.

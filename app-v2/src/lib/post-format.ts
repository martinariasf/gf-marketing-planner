// GF-69 — the canonical post-format contract, mirrored from the API's
// deploy-staging/api/src/schemas/post.ts (POST_FORMATS / isStoryFormat). Kept
// as a small standalone mirror rather than a shared import because the SPA and
// the API are separate packages/deploys; if the two ever drift, the API schema
// stays authoritative for what the server actually accepts.

export const POST_FORMATS = ['single image', 'carousel', 'story'] as const
export type PostFormat = (typeof POST_FORMATS)[number]

/** i18n key for a canonical post-format value's human label. */
export const POST_FORMAT_LABEL_KEY: Record<PostFormat, string> = {
  'single image': 'postFormat.single',
  carousel: 'postFormat.carousel',
  story: 'postFormat.story',
}

/** True only for a case-insensitive, trimmed "story" format — mirrors the
 *  API's isStoryFormat() so the picker/mockup and the server agree. */
export function isStoryFormat(format: string | undefined | null): boolean {
  return typeof format === 'string' && format.trim().toLowerCase() === 'story'
}

/** True when `format` is one of the three canonical POST_FORMATS values
 *  (case/whitespace as stored — this checks the exact wire value, not a
 *  normalized one, matching how the picker's <select> options are keyed). */
export function isCanonicalFormat(format: string | undefined | null): format is PostFormat {
  return (POST_FORMATS as readonly string[]).includes(format ?? '')
}

/**
 * i18n key for a canonical format, or the empty/missing case (which falls
 * back to "Single image" — mirrors the API's own structural default in
 * coalescePost). Returns undefined for a legacy/non-canonical value like
 * "reel": there is no key for arbitrary text, so callers should fall back to
 * showing the raw string instead of mislabeling it as "Single image".
 */
export function postFormatLabelKey(format: string | undefined | null): string | undefined {
  if (!format) return POST_FORMAT_LABEL_KEY['single image']
  return isCanonicalFormat(format) ? POST_FORMAT_LABEL_KEY[format] : undefined
}

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

/** i18n key for any format string, including unknown/legacy values (which
 *  fall back to the "Single image" label rather than throwing). */
export function postFormatLabelKey(format: string | undefined | null): string {
  const key = (POST_FORMATS as readonly string[]).includes(format ?? '')
    ? (format as PostFormat)
    : undefined
  return key ? POST_FORMAT_LABEL_KEY[key] : POST_FORMAT_LABEL_KEY['single image']
}

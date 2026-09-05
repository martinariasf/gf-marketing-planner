// Shared size limits that more than one module must agree on.
//
// A limit lives here only when it is enforced in one place and declared in
// another — the pairing that silently drifts. Limits used by a single module
// (MAX_UPLOAD_BYTES in routes/planningConfig.ts, DOC_TEXT_MAX_CHARS in
// routes/chatAttachments.ts) stay next to their use, where they read better.
//
// Deliberately dependency-free: a hot request path importing a limit must not
// pull in the schema-bootstrap module's import graph to get it.

/** Max length of `information_sources.summary`, in Unicode code points.
 *
 *  Declared on the PocketBase field by ensureCollections and pre-checked by the
 *  information-sources upload route (GF-142), so a document PB is certain to
 *  reject is refused with an actionable message instead of a round trip. */
export const SUMMARY_MAX_CHARS = 1_000_000

/** Count Unicode code points, which is what PocketBase's text `max` validator
 *  counts — NOT `String.length`, which counts UTF-16 code units and so reports
 *  2 for every astral-plane character (emoji, CJK Extension B). Comparing
 *  `String.length` against a PB rune limit rejects documents PB would accept.
 *
 *  Iterates rather than `[...text].length` to avoid allocating a multi-million
 *  element array for a document that is about to be refused anyway. */
export function countCodePoints(text: string): number {
  let count = 0
  for (const _ of text) count++
  return count
}

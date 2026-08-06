// Shared text-upload detection. Originally lived inline in
// routes/planningConfig.ts (the information-sources drag-drop upload); hoisted
// out for GF-68 so routes/chatAttachments.ts can classify uploaded documents
// with the exact same rule instead of drifting from a second copy.
//
// Only text-based files are accepted (transcripts, notes, captions, CSV,
// JSON, ...). Binary document formats (PDF/DOCX) would need a parser
// dependency and are rejected with a clear message rather than stored as
// unreadable bytes — see GF-68b.

export const TEXT_EXT_RE = /\.(txt|md|markdown|vtt|srt|csv|json|log|text)$/i

export function isTextUpload(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('text/')) return true
  if (type === 'application/json') return true
  return TEXT_EXT_RE.test(file.name || '')
}

// GF-68: chat image/document uploads. Stored in PocketBase — the API mounts
// clients/ read-only, so it can't write attachment bytes to disk (mirrors
// routes/inspiration.ts exactly).
//
//   POST /api/v1/clients/:slug/chat/attachments   multipart upload (dash/admin)
//
// v1 accepts image formats (png/jpeg/webp/gif) AND text-format documents
// only. PDF/DOCX are rejected with a 415 — GF-68b will add a real document
// parser. Images are served back publicly via assetFiles.ts's
// /chat/attachments/:id/file route (image only — documents never need a
// public URL because their extracted text is inlined into the agent's input
// directly, per Martin's decision).

import { OpenAPIHono } from '@hono/zod-openapi'
import { withPb } from '../pb.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { audit } from '../audit.js'
import { problem } from '../problem.js'
import { isTextUpload } from '../textUpload.js'

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
export const MAX_IMAGE_BYTES = 10_000_000
export const MAX_DOC_BYTES = 2_000_000
export const MAX_ATTACHMENTS_PER_REQUEST = 4
export const DOC_TEXT_MAX_CHARS = 40_000

interface ChatAttachmentRecord {
  id: string
  slug: string
  kind: 'image' | 'document'
  file?: string
  filename: string
  mimeType: string
  size: number
  text?: string
  messageId?: string
  actor?: string
  createdAt?: string
}

function publicUrl(slug: string, id: string): string {
  // Served by assetFiles.ts (public, no auth) — IMAGES ONLY, see that file.
  return `/api/v1/clients/${slug}/chat/attachments/${id}/file`
}

function truncateText(text: string): string {
  if (text.length <= DOC_TEXT_MAX_CHARS) return text
  const omitted = text.length - DOC_TEXT_MAX_CHARS
  return text.slice(0, DOC_TEXT_MAX_CHARS) + `\n\n[...truncated, ${omitted} characters omitted...]`
}

export const chatAttachments = new OpenAPIHono<AppEnv>()
chatAttachments.use('*', requireAuth)

chatAttachments.post(
  '/clients/:slug/chat/attachments',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    let form: FormData
    try {
      form = await c.req.formData()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Expected multipart/form-data' })
    }
    // Multiple files may arrive in one request (form.getAll) — cap enforced
    // here per-request; the chat relay (routes/chat.ts) enforces the same cap
    // again across a message's total attachment ids.
    const files = form.getAll('file').filter((f) => f instanceof File) as File[]
    if (files.length === 0) {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Missing "file" part' })
    }
    if (files.length > MAX_ATTACHMENTS_PER_REQUEST) {
      return problem(c, {
        title: 'Bad Request',
        status: 400,
        detail: `Max ${MAX_ATTACHMENTS_PER_REQUEST} attachments per message`,
      })
    }

    const principal = c.get('principal')
    const actor = principal.label ?? principal.token.slice(0, 12)
    const now = new Date().toISOString()
    const created: Array<{
      id: string
      kind: 'image' | 'document'
      filename: string
      mimeType: string
      size: number
      url?: string
      textLength?: number
    }> = []

    for (const file of files) {
      const isImage = IMAGE_MIME_TYPES.includes((file.type || '').toLowerCase())
      const isDoc = !isImage && isTextUpload(file)

      if (!isImage && !isDoc) {
        return problem(c, {
          title: 'Unsupported Media Type',
          status: 415,
          detail: `"${file.name || 'file'}" is not an accepted image format or a recognized text document. PDF/DOCX are not yet supported.`,
        })
      }

      if (isImage && file.size > MAX_IMAGE_BYTES) {
        return problem(c, { title: 'Payload Too Large', status: 413, detail: 'Max 10 MB per image' })
      }
      if (isDoc && file.size > MAX_DOC_BYTES) {
        return problem(c, { title: 'Payload Too Large', status: 413, detail: 'Max 2 MB per document' })
      }

      const bytes = new Uint8Array(await file.arrayBuffer())

      const pbForm = new FormData()
      pbForm.append('slug', slug)
      pbForm.append('kind', isImage ? 'image' : 'document')
      pbForm.append('filename', file.name || (isImage ? 'upload.png' : 'upload.txt'))
      pbForm.append('mimeType', file.type || 'application/octet-stream')
      pbForm.append('size', String(file.size))
      pbForm.append('actor', actor)
      pbForm.append('createdAt', now)

      let docText = ''
      if (isImage) {
        // Re-wrap the uploaded File as a fresh Blob — passing Hono's File
        // straight into the PB SDK's FormData proved unreliable under Node
        // (see routes/inspiration.ts for the same fix).
        const blob = new Blob([bytes], { type: file.type || 'application/octet-stream' })
        const safeName = file.name && /\.[a-z0-9]+$/i.test(file.name) ? file.name : 'upload.png'
        pbForm.append('file', blob, safeName)
      } else {
        docText = truncateText(new TextDecoder('utf-8').decode(bytes))
        pbForm.append('text', docText)
      }

      let rec: ChatAttachmentRecord
      try {
        rec = await withPb((pb) => pb.collection('chat_attachments').create<ChatAttachmentRecord>(pbForm))
      } catch (err) {
        const detail =
          err && typeof err === 'object' && 'response' in err
            ? JSON.stringify((err as { response?: { data?: unknown } }).response?.data ?? {})
            : err instanceof Error
              ? err.message
              : 'PocketBase rejected the file'
        console.error('[chatAttachments] create failed', detail)
        return problem(c, { title: 'Upload failed', status: 502, detail })
      }

      await audit(principal, {
        action: 'chat.attachment.add',
        slug,
        resourceId: rec.id,
        after: { filename: rec.filename, kind: rec.kind },
      })

      created.push({
        id: rec.id,
        kind: rec.kind,
        filename: rec.filename,
        mimeType: rec.mimeType,
        size: rec.size,
        ...(isImage ? { url: publicUrl(slug, rec.id) } : { textLength: docText.length }),
      })
    }

    return c.json({ items: created }, 201)
  },
)

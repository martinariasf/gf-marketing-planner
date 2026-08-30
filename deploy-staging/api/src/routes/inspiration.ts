// Per-client inspiration assets — drag-drop image library uploaded from the
// dashboard. Stored in PocketBase (the API mounts clients/ read-only, so it
// can't write image files to disk). Image bytes are served back publicly via
// the assetFiles router's /inspiration/:id/file route so <img> tags work
// without a bearer token.
//
//   GET    /clients/:slug/inspiration            list (scoped)
//   POST   /clients/:slug/inspiration            multipart upload (dash/admin)
//   DELETE /clients/:slug/inspiration/:id        remove (dash/admin)

import { OpenAPIHono } from '@hono/zod-openapi'
import { withPb } from '../pb.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { audit } from '../audit.js'
import { problem } from '../problem.js'

interface InspirationRecord {
  id: string
  slug: string
  note?: string
  file: string
  actor?: string
  createdAt?: string
}

function publicUrl(slug: string, id: string): string {
  // Served by assetFiles.ts (public, no auth) — see that file.
  return `/api/v1/clients/${slug}/inspiration/${id}/file`
}

const IMAGE_SIZE_LIMIT = 15_000_000
const VIDEO_SIZE_LIMIT = 100_000_000

// Videos are much bigger than images by nature, so they get a separate,
// larger cap. Which cap applies follows resolveKind() below: mime first,
// filename extension only when the browser sent a generic/empty mime.

// assetFiles.ts can only set a correct Content-Type for these three video
// types when serving the file back — anything else would get mis-served, so
// reject it up front rather than accept an unplayable upload.
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm', 'video/quicktime'])

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

// assetFiles.ts picks the Content-Type it serves from the stored filename's
// extension alone — it has no idea what these are actually servable as.
// Only these extensions map to a Content-Type it can serve; anything else
// (e.g. a video/mp4 upload named "clip.txt") must not be kept as-is or it
// will be served with the wrong Content-Type and won't play/render.
const SERVABLE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm', 'mov',
])

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov'])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'])

function extensionOf(filename: string): string {
  const match = filename ? /\.([a-z0-9]+)$/i.exec(filename) : null
  return match ? match[1]!.toLowerCase() : ''
}

// Resolves the upload's real kind, MIME first, extension only as a fallback
// when the MIME is missing/generic. Returns null when neither the MIME nor
// the extension identifies a type assetFiles.ts can actually serve back —
// callers must refuse the upload in that case rather than store the bytes.
function resolveKind(mime: string, filename: string): 'image' | 'video' | null {
  if (mime.startsWith('video/')) {
    // An explicit video/* MIME is authoritative even if disallowed — never
    // fall back to the extension for a mime the browser was explicit about.
    return ALLOWED_VIDEO_MIMES.has(mime) ? 'video' : null
  }
  // An explicit image/* MIME is authoritative too, even when we don't
  // recognize the specific subtype (bmp, avif, heic, ...). Other screens
  // upload through this endpoint with accept="image/*" and rely on
  // assetFiles.ts's fallback to PB's stored Content-Type for formats we
  // don't have an EXT_BY_MIME entry for — narrowing to only known image
  // mimes would 415 uploads that worked before this task.
  if (mime.startsWith('image/')) return 'image'
  // Generic/empty/unrecognized MIME — fall back to the filename extension.
  const ext = extensionOf(filename)
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  return null
}

export function sizeLimitFor(mime: string, filename: string): number {
  return resolveKind(mime, filename) === 'video' ? VIDEO_SIZE_LIMIT : IMAGE_SIZE_LIMIT
}

// filename is required (not optional) because, unlike the old mime-only
// check, refusing an upload now also depends on whether the extension can
// identify a servable type when the mime is generic/empty — see resolveKind.
export function isAcceptableUpload(mime: string, filename: string): boolean {
  return resolveKind(mime, filename) !== null
}

// PB (and assetFiles.ts, which reads the stored filename's extension to set
// Content-Type) need a real, servable extension consistent with the upload's
// resolved kind. Keep an existing extension only if it is both servable AND
// matches the resolved kind (e.g. don't keep ".mov" on a MIME-resolved
// image); otherwise derive the extension from the resolved kind/mime,
// falling back to today's .png default.
export function safeFilenameFor(mime: string, filename: string): string {
  const kind = resolveKind(mime, filename) ?? 'image' // route rejects null kinds before ever calling this
  const currentExt = extensionOf(filename)
  const currentExtKind = VIDEO_EXTENSIONS.has(currentExt) ? 'video' : IMAGE_EXTENSIONS.has(currentExt) ? 'image' : null
  if (currentExtKind === kind) return filename
  // Explicit image/* mime we don't recognize the specific subtype for (bmp,
  // avif, heic, ...): keep whatever extension the file already has, so PB
  // stores it and assetFiles.ts falls back to PB's own Content-Type header,
  // same as before this task. Only fall back to .png when there's no
  // extension at all to keep. This does NOT apply to a generic/unrecognized
  // mime like application/octet-stream that merely defaulted to 'image' —
  // that case keeps today's .png fallback.
  if (mime.startsWith('image/') && !(mime in EXT_BY_MIME) && currentExt) return filename
  const match = filename ? /\.([a-z0-9]+)$/i.exec(filename) : null
  const ext = EXT_BY_MIME[mime] ?? (kind === 'video' ? '.mp4' : '.png')
  const base = match ? filename.slice(0, -match[0].length) : filename || 'upload'
  return `${base}${ext}`
}

export const inspiration = new OpenAPIHono<AppEnv>()
inspiration.use('*', requireAuth)

inspiration.get('/clients/:slug/inspiration', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  let items: InspirationRecord[] = []
  try {
    // Sort on our own `createdAt` text field — PB v0.38 base collections have
    // no auto `created` system field, so sorting on `-created` throws.
    items = await withPb((pb) =>
      pb.collection('inspiration_assets').getFullList<InspirationRecord>({
        filter: `slug="${slug}"`,
        sort: '-createdAt',
      }),
    )
  } catch (err) {
    console.error('[inspiration] list failed', err instanceof Error ? err.message : err)
    items = []
  }
  return c.json({
    items: items.map((r) => ({
      id: r.id,
      note: r.note ?? '',
      filename: r.file,
      url: publicUrl(slug, r.id),
      createdAt: r.createdAt,
    })),
  })
})

inspiration.post(
  '/clients/:slug/inspiration',
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
    const file = form.get('file')
    if (!(file instanceof File)) {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Missing "file" part' })
    }
    const mime = file.type || 'application/octet-stream'
    if (!isAcceptableUpload(mime, file.name)) {
      return problem(c, {
        title: 'Unsupported Media Type',
        status: 415,
        detail:
          'Unsupported file type — images are accepted as image/*, and videos must be mp4, webm, or quicktime (mov)',
      })
    }
    const limit = sizeLimitFor(mime, file.name)
    if (file.size > limit) {
      const limitMb = Math.round(limit / 1_000_000)
      return problem(c, {
        title: 'Payload Too Large',
        status: 413,
        detail: `Max ${limitMb} MB per ${limit === VIDEO_SIZE_LIMIT ? 'video' : 'image'}`,
      })
    }
    const note = (form.get('note') as string | null) ?? ''
    const principal = c.get('principal')

    // Re-wrap the uploaded File as a fresh Blob. Passing Hono's File straight
    // into the PB SDK's FormData proved unreliable under Node (stream already
    // consumed / incompatible File impl); a Blob built from the bytes works.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const blob = new Blob([bytes], { type: mime })
    const safeName = safeFilenameFor(mime, file.name)

    const pbForm = new FormData()
    pbForm.append('slug', slug)
    pbForm.append('note', note)
    pbForm.append('actor', principal.label ?? principal.token.slice(0, 12))
    pbForm.append('createdAt', new Date().toISOString())
    pbForm.append('file', blob, safeName)

    let rec: InspirationRecord
    try {
      rec = await withPb((pb) => pb.collection('inspiration_assets').create<InspirationRecord>(pbForm))
    } catch (err) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? JSON.stringify((err as { response?: { data?: unknown } }).response?.data ?? {})
          : err instanceof Error
            ? err.message
            : 'PocketBase rejected the file'
      console.error('[inspiration] create failed', detail)
      return problem(c, { title: 'Upload failed', status: 502, detail })
    }
    await audit(principal, {
      action: 'inspiration.add',
      slug,
      resourceId: rec.id,
      after: { filename: rec.file, note },
    })
    return c.json(
      { id: rec.id, note, filename: rec.file, url: publicUrl(slug, rec.id) },
      201,
    )
  },
)

inspiration.delete(
  '/clients/:slug/inspiration/:id',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    const id = c.req.param('id')
    try {
      await withPb((pb) => pb.collection('inspiration_assets').delete(id))
    } catch {
      return problem(c, { title: 'Not Found', status: 404, detail: 'No such inspiration asset' })
    }
    await audit(c.get('principal'), { action: 'inspiration.remove', slug, resourceId: id })
    return c.json({ ok: true, id })
  },
)

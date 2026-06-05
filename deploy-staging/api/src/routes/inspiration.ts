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
    if (file.size > 15_000_000) {
      return problem(c, { title: 'Payload Too Large', status: 413, detail: 'Max 15 MB per image' })
    }
    const note = (form.get('note') as string | null) ?? ''
    const principal = c.get('principal')

    // Re-wrap the uploaded File as a fresh Blob. Passing Hono's File straight
    // into the PB SDK's FormData proved unreliable under Node (stream already
    // consumed / incompatible File impl); a Blob built from the bytes works.
    const bytes = new Uint8Array(await file.arrayBuffer())
    const blob = new Blob([bytes], { type: file.type || 'application/octet-stream' })
    const safeName = file.name && /\.[a-z0-9]+$/i.test(file.name) ? file.name : 'upload.png'

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

// Public, read-only media file serving for client assets.
//
// Hermes (the agent) generates an image/video, then copies the media file into its
// writable client mount at clients/<slug>/assets/<name>. This API container
// mounts the same clients/ dir read-only at /data/clients, so we can stream
// those bytes back out at a stable URL that the dashboard <img> tags and
// post.image fields can point at:
//
//   GET /api/v1/clients/:slug/assets/files/:name
//
// Deliberately UNAUTHENTICATED: <img src> can't attach a bearer token, and the
// existing manifest already references public image URLs (Unsplash). The outer
// Caddy basicauth still gates browser users; agents reach /api/v1/* directly.
// Filenames are strictly validated to prevent path traversal outside the
// client's own assets directory.

import { OpenAPIHono } from '@hono/zod-openapi'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { problem } from '../problem.js'
import { withPb } from '../pb.js'
import { pb } from '../pb.js'
import { env } from '../env.js'

const ROOT = process.env.DATA_ROOT ?? '/data'

// slug: lowercase letters, digits, hyphens. name: a single filename segment
// with a known media extension. No slashes, no dots-dots, no leading dot.
const SLUG_RE = /^[a-z0-9-]{1,100}$/
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}\.(png|jpe?g|webp|gif|svg|mp4|webm|mov)$/

const CONTENT_TYPE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
}

export const assetFiles = new OpenAPIHono()

assetFiles.get('/clients/:slug/assets/files/:name', async (c) => {
  const slug = c.req.param('slug')
  const name = c.req.param('name')
  if (!SLUG_RE.test(slug) || !NAME_RE.test(name) || name.includes('..')) {
    return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid slug or filename' })
  }
  const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase()
  const filePath = join(ROOT, 'clients', slug, 'assets', name)
  try {
    const bytes = await readFile(filePath)
    return c.body(bytes, 200, {
      'Content-Type': CONTENT_TYPE[ext] ?? 'application/octet-stream',
      // Generated assets are immutable once written (unique filenames), so
      // allow long caching. The dashboard busts via new filenames, not query.
      'Cache-Control': 'public, max-age=86400',
    })
  } catch {
    return problem(c, { title: 'Not Found', status: 404, detail: 'No such asset file' })
  }
})

// Public serving for dashboard-uploaded inspiration images (stored in PB).
// Streams the bytes so <img src="/api/v1/clients/:slug/inspiration/:id/file">
// works without a bearer token, mirroring the on-disk asset route above.
assetFiles.get('/clients/:slug/inspiration/:id/file', async (c) => {
  const slug = c.req.param('slug')
  const id = c.req.param('id')
  if (!SLUG_RE.test(slug) || !/^[a-z0-9]{1,40}$/i.test(id)) {
    return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid slug or id' })
  }
  try {
    const rec = await withPb((p) =>
      p.collection('inspiration_assets').getOne<{ id: string; slug: string; file: string }>(id),
    )
    if (rec.slug !== slug) {
      return problem(c, { title: 'Not Found', status: 404, detail: 'No such inspiration asset' })
    }
    // PB serves files at /api/files/<collection>/<id>/<filename>. The collection
    // is admin-only, so include the superuser token the pb client already holds.
    const fileUrl = `${env.pbUrl}/api/files/inspiration_assets/${rec.id}/${encodeURIComponent(rec.file)}`
    const res = await fetch(fileUrl, {
      headers: pb.authStore.token ? { Authorization: pb.authStore.token } : {},
    })
    if (!res.ok || !res.body) {
      return problem(c, { title: 'Not Found', status: 404, detail: 'File bytes unavailable' })
    }
    const ext = rec.file.slice(rec.file.lastIndexOf('.') + 1).toLowerCase()
    const bytes = new Uint8Array(await res.arrayBuffer())
    return c.body(bytes, 200, {
      'Content-Type': CONTENT_TYPE[ext] ?? res.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=86400',
    })
  } catch {
    return problem(c, { title: 'Not Found', status: 404, detail: 'No such inspiration asset' })
  }
})

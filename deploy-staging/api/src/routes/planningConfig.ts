import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { audit } from '../audit.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { withPb } from '../pb.js'
import { problem } from '../problem.js'

export type CalendarRange = {
  startMonth: string
  endMonth: string
}

function parseMonthKey(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const match = value.match(/^(\d{4})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null
  return new Date(Date.UTC(year, month - 1, 1))
}

function monthDiff(start: Date, end: Date): number {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth()
}

function validateCalendarRange(data: unknown): CalendarRange | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const start = parseMonthKey(raw.startMonth)
  const end = parseMonthKey(raw.endMonth)
  if (!start || !end) return null
  const diff = monthDiff(start, end)
  if (diff < 0 || diff > 5) return null
  return { startMonth: raw.startMonth as string, endMonth: raw.endMonth as string }
}

function principalLabel(c: Context<AppEnv>): string {
  const principal = c.get('principal')
  return principal.label ?? principal.token.slice(0, 12)
}

export const planningConfig = new OpenAPIHono<AppEnv>()
planningConfig.use('*', requireAuth)

planningConfig.get('/clients/:slug/config/calendar-range', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  try {
    const rec = await withPb((pb) =>
      pb.collection('org_configs').getFirstListItem<{ calendarRange?: CalendarRange }>(`slug="${slug}"`),
    )
    return c.json({ data: rec.calendarRange ?? null })
  } catch {
    return c.json({ data: null })
  }
})

planningConfig.put(
  '/clients/:slug/config/calendar-range',
  requireScope(),
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    let body: { data?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const calendarRange = validateCalendarRange(body.data)
    if (!calendarRange) {
      return problem(c, {
        title: 'Unprocessable Entity',
        status: 422,
        detail: 'Calendar range must include startMonth/endMonth as YYYY-MM and span at most 6 months.',
      })
    }
    const actor = principalLabel(c)
    const updatedAt = new Date().toISOString()
    const result = await withPb(async (pb) => {
      const coll = pb.collection('org_configs')
      try {
        const existing = await coll.getFirstListItem<{ id: string; calendarRange?: CalendarRange }>(
          `slug="${slug}"`,
        )
        const updated = await coll.update<{ calendarRange?: CalendarRange }>(
          existing.id,
          { calendarRange, updatedAt, actor },
        )
        return { before: existing.calendarRange ?? null, after: updated.calendarRange ?? calendarRange }
      } catch {
        const created = await coll.create<{ calendarRange?: CalendarRange }>({
          slug,
          calendarRange,
          updatedAt,
          actor,
        })
        return { before: null, after: created.calendarRange ?? calendarRange }
      }
    })
    await audit(c.get('principal'), {
      action: 'calendar_range.update',
      slug,
      before: result.before,
      after: result.after,
    })
    return c.json({ data: result.after })
  },
)

planningConfig.get('/clients/:slug/information-sources', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const approvedOnly = c.req.query('approved') === 'true'
  const items = await withPb((pb) =>
    pb.collection('information_sources').getFullList({
      filter: approvedOnly ? `slug="${slug}" && approved=true` : `slug="${slug}"`,
      sort: '-updatedAt',
    }),
  )
  return c.json({ items })
})

planningConfig.post(
  '/clients/:slug/information-sources',
  requireScope(),
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    let body: Record<string, unknown>
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : null
    if (!title) {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Information Source needs a title.' })
    }
    const now = new Date().toISOString()
    const actor = principalLabel(c)
    const item = await withPb((pb) =>
      pb.collection('information_sources').create({
        slug,
        title,
        url: typeof body.url === 'string' ? body.url : '',
        sourceType: typeof body.sourceType === 'string' ? body.sourceType : 'website',
        summary: typeof body.summary === 'string' ? body.summary : '',
        prompt:
          typeof body.prompt === 'string'
            ? body.prompt
            : 'Use this approved source as factual context for post generation. Show source references.',
        approved: Boolean(body.approved),
        approvedAt: body.approved ? now : '',
        lastImportedAt: now,
        tags: Array.isArray(body.tags) ? body.tags : [],
        actor,
        createdAt: now,
        updatedAt: now,
      }),
    )
    await audit(c.get('principal'), {
      action: 'information_source.create',
      slug,
      resourceId: item.id,
      after: item,
    })
    return c.json(item, 201)
  },
)

// Drag-and-drop file upload (GF-12). A dropped transcript/notes file becomes a
// normal information_sources record: its text is extracted into `summary`, so it
// is callable by the agent through the same /information-sources?approved=true
// path as a manually-added source. No new collection or file storage needed.
//
// Only text-based files are accepted (transcripts, notes, captions, CSV, JSON).
// Binary formats (PDF/DOCX) would need a parser dependency and are rejected with
// a clear message rather than stored as unreadable bytes.
const TEXT_EXT_RE = /\.(txt|md|markdown|vtt|srt|csv|json|log|text)$/i
const MAX_UPLOAD_BYTES = 15_000_000

function isTextUpload(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('text/')) return true
  if (type === 'application/json') return true
  return TEXT_EXT_RE.test(file.name || '')
}

planningConfig.post(
  '/clients/:slug/information-sources/upload',
  requireScope(),
  requireRole('dash', 'admin', 'agent'),
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
    if (file.size > MAX_UPLOAD_BYTES) {
      return problem(c, { title: 'Payload Too Large', status: 413, detail: 'Max 15 MB per file' })
    }
    if (!isTextUpload(file)) {
      return problem(c, {
        title: 'Unsupported Media Type',
        status: 415,
        detail: 'Only text-based files (.txt, .md, .vtt, .srt, .csv, .json) are supported. Convert PDFs/Word docs to text first.',
      })
    }

    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: false }).decode(await file.arrayBuffer()).trim()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Could not read file as UTF-8 text.' })
    }
    if (!text) {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'File is empty.' })
    }

    const now = new Date().toISOString()
    const actor = principalLabel(c)
    const title = (typeof form.get('title') === 'string' && (form.get('title') as string).trim())
      || file.name
      || 'Uploaded source'
    const item = await withPb((pb) =>
      pb.collection('information_sources').create({
        slug,
        title,
        url: '',
        sourceType: 'reference',
        summary: text,
        prompt: 'Use this uploaded source as factual context for post generation. Show source references.',
        approved: false,
        approvedAt: '',
        lastImportedAt: now,
        tags: ['upload'],
        actor,
        createdAt: now,
        updatedAt: now,
      }),
    )
    await audit(c.get('principal'), {
      action: 'information_source.upload',
      slug,
      resourceId: item.id,
      after: { title, bytes: file.size, filename: file.name },
    })
    return c.json(item, 201)
  },
)

planningConfig.patch(
  '/clients/:slug/information-sources/:id',
  requireScope(),
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    const id = c.req.param('id')
    let body: Record<string, unknown>
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const before = await withPb((pb) => pb.collection('information_sources').getOne(id))
    if (before.slug !== slug) return problem(c, { title: 'Not Found', status: 404, detail: 'No such source' })
    const patch = { ...body, updatedAt: new Date().toISOString(), actor: principalLabel(c) }
    const after = await withPb((pb) => pb.collection('information_sources').update(id, patch))
    await audit(c.get('principal'), {
      action: 'information_source.patch',
      slug,
      resourceId: id,
      before,
      after,
    })
    return c.json(after)
  },
)

planningConfig.post(
  '/clients/:slug/information-sources/:id/approve',
  requireScope(),
  requireRole('dash', 'admin', 'agent'),
  async (c) => {
    const slug = c.req.param('slug')
    const id = c.req.param('id')
    const before = await withPb((pb) => pb.collection('information_sources').getOne(id))
    if (before.slug !== slug) return problem(c, { title: 'Not Found', status: 404, detail: 'No such source' })
    const now = new Date().toISOString()
    const after = await withPb((pb) =>
      pb.collection('information_sources').update(id, {
        approved: true,
        approvedAt: now,
        updatedAt: now,
        actor: principalLabel(c),
      }),
    )
    await audit(c.get('principal'), {
      action: 'information_source.approve',
      slug,
      resourceId: id,
      before,
      after,
    })
    return c.json(after)
  },
)

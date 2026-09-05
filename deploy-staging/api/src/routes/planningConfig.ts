import { OpenAPIHono } from '@hono/zod-openapi'
import type { Context } from 'hono'
import { audit } from '../audit.js'
import { requireAuth, requireRole, requireScope, type AppEnv } from '../auth.js'
import { withPb } from '../pb.js'
import { problem } from '../problem.js'
import {
  loadOrgSettings,
  DEFAULTS as ORG_SETTINGS_DEFAULTS,
  isValidIanaTimezone,
  type OrgSettings,
} from '../orgSettings.js'
import { isTextUpload } from '../textUpload.js'
import { SUMMARY_MAX_CHARS, countCodePoints } from '../limits.js'
import { clientExists } from '../tenancy.js'
import { getClientUsage, type ClientUsage } from '../usage.js'
import { resolveOpenRouterClient } from '../env.js'

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

// GF-104 — 5-minute in-process usage cache, keyed by slug, shared by the
// /usage route below. The OpenRouter key hash / guardrail id now live in a
// server-side env map (see env.ts's OPENROUTER_CLIENTS_JSON), not in
// client-editable org_configs.settings, so there is no settings PUT path
// that can change them at runtime — nothing needs to invalidate this cache
// early; it simply expires after USAGE_CACHE_TTL_MS.
type UsageCacheEntry = { at: number; body: Record<string, unknown> }
const USAGE_CACHE_TTL_MS = 5 * 60 * 1000
const usageCache = new Map<string, UsageCacheEntry>()

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

// GF-92 (B) — per-client dashboard configuration toggles.
planningConfig.get('/clients/:slug/config/settings', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const settings = await loadOrgSettings(slug)
  return c.json({ data: settings })
})

type OrgSettingsInput = {
  showAiGeneratedLabel: boolean
  autoScheduleOnApprove: boolean
  timezone?: string
}

// GF-37 follow-up, Layer-5 review round 1 finding 1 — `timezone` is OPTIONAL
// on write, unlike the two existing booleans. Requiring it broke backward
// compatibility for exactly the case the default-UTC design exists to
// protect: any existing caller (a cached pre-deploy SPA tab, a script, an
// integration) still sending the old two-key payload got a hard 422 instead
// of the save it used to get. When `timezone` IS present it must still be a
// valid IANA name; when absent, the PUT handler below carries the client's
// CURRENT timezone forward rather than silently resetting it to UTC every
// time some other toggle is saved.
function validateOrgSettings(data: unknown): OrgSettingsInput | null {
  if (!data || typeof data !== 'object') return null
  const raw = data as Record<string, unknown>
  const keys = Object.keys(raw)
  const allowed = new Set(['showAiGeneratedLabel', 'autoScheduleOnApprove', 'timezone'])
  if (keys.some((k) => !allowed.has(k))) return null
  if (typeof raw.showAiGeneratedLabel !== 'boolean') return null
  if (typeof raw.autoScheduleOnApprove !== 'boolean') return null
  if ('timezone' in raw && !isValidIanaTimezone(raw.timezone)) return null
  return {
    showAiGeneratedLabel: raw.showAiGeneratedLabel,
    autoScheduleOnApprove: raw.autoScheduleOnApprove,
    ...('timezone' in raw ? { timezone: raw.timezone as string } : {}),
  }
}

planningConfig.put(
  '/clients/:slug/config/settings',
  requireScope(),
  requireRole('dash', 'admin'),
  async (c) => {
    const slug = c.req.param('slug')
    let body: { data?: unknown }
    try {
      body = await c.req.json()
    } catch {
      return problem(c, { title: 'Bad Request', status: 400, detail: 'Invalid JSON body' })
    }
    const input = validateOrgSettings(body.data)
    if (!input) {
      return problem(c, {
        title: 'Unprocessable Entity',
        status: 422,
        detail: `Settings must include showAiGeneratedLabel and autoScheduleOnApprove as booleans; timezone is optional but, when present, must be a valid IANA time zone name (defaults: ${JSON.stringify(ORG_SETTINGS_DEFAULTS)}).`,
      })
    }
    // Carry the current timezone forward when the caller's payload omits it
    // (see validateOrgSettings above) rather than defaulting to 'UTC' and
    // silently overwriting a value the client already configured.
    const current = await loadOrgSettings(slug)
    const settings: OrgSettings = { ...current, ...input }
    const actor = principalLabel(c)
    const updatedAt = new Date().toISOString()
    const result = await withPb(async (pb) => {
      const coll = pb.collection('org_configs')
      try {
        const existing = await coll.getFirstListItem<{ id: string; settings?: unknown }>(`slug="${slug}"`)
        const updated = await coll.update<{ settings?: OrgSettings }>(existing.id, { settings, updatedAt, actor })
        return { before: existing.settings ?? null, after: updated.settings ?? settings }
      } catch {
        const created = await coll.create<{ settings?: OrgSettings }>({ slug, settings, updatedAt, actor })
        return { before: null, after: created.settings ?? settings }
      }
    })
    await audit(c.get('principal'), {
      action: 'org_settings.update',
      slug,
      before: result.before,
      after: result.after,
    })
    return c.json({ data: result.after })
  },
)

// GF-104 TASK-002 — GET /clients/:slug/usage.
//
// A plain 5-minute in-process cache keyed by slug (declared above): the
// OpenRouter reads behind getClientUsage() are network calls a human opening
// the Configuration page repeatedly (or a flaky connection retrying) has no
// reason to keep re-triggering. A Map + timestamp is intentionally the
// whole cache — no dependency, no eviction policy, no per-instance
// coordination needed for a handful of clients.
//
// GF-104 rework: the key hash / guardrail id are no longer read from
// client-editable org_configs.settings — they come from the server-side
// OPENROUTER_CLIENTS_JSON env map (see env.ts, resolveOpenRouterClient()),
// which Martin configures directly. Clients never see or set these values.
planningConfig.get('/clients/:slug/usage', requireScope(), async (c) => {
  const slug = c.req.param('slug')

  const cached = usageCache.get(slug)
  if (cached && Date.now() - cached.at < USAGE_CACHE_TTL_MS) {
    return c.json(cached.body)
  }

  const client = resolveOpenRouterClient(slug)
  if (!client) {
    // Not an error: the card hides itself on `configured: false`. Not
    // cached — a client can get configured at any time and the very next
    // load should pick that up immediately, not wait out a stale cache.
    return c.json({ configured: false })
  }

  let usage: ClientUsage
  try {
    usage = await getClientUsage(client.keyHash, client.guardrailId)
  } catch (err) {
    // OpenRouter being down, slow, or returning garbage must never turn
    // into a 500 on the Configuration page — a third party's outage is not
    // this dashboard's outage. Log for our own visibility, tell the caller
    // "configured, but we couldn't read it right now".
    console.warn(`[usage] getClientUsage failed for slug "${slug}":`, err)
    return c.json({ configured: true, unavailable: true })
  }

  const body = { configured: true, ...usage }
  usageCache.set(slug, { at: Date.now(), body })
  return c.json(body)
})

// GF-116 — the agent-facing read. An uploaded document's full text is in each
// item's `summary`, so this one GET is how Viktor sees what a human put in the
// Assets tab. `?approved=true` is the agent's filter: `approved` is the only
// lever a human has to stop the AI using a draft or a misfiled document, so
// unapproved sources stay invisible to it. Uploads auto-approve on arrival
// (GF-110), so that gate costs the normal path nothing.
planningConfig.get('/clients/:slug/information-sources', requireScope(), async (c) => {
  const slug = c.req.param('slug')
  const approvedOnly = c.req.query('approved') === 'true'
  const items = await withPb((pb) =>
    pb.collection('information_sources').getFullList({
      filter: approvedOnly ? `slug="${slug}" && approved=true` : `slug="${slug}"`,
      sort: '-updatedAt',
    }),
  )
  // GF-116 — an empty list has two very different causes: this client really has
  // no source material, or the caller is asking under a slug no client owns (the
  // wrong workspace). Both used to look identical, which is how an agent came to
  // report "the document does not exist". Name the second case. Deliberately NOT
  // a 404: a slug can be legitimately live without a `clients` row, and failing
  // the read closed would break the very path this fixes.
  if (items.length === 0 && (await clientExists(slug)) === false) {
    return c.json({
      items,
      slug,
      warning:
        `Slug "${slug}" matches no client registered on this server. This list is ` +
        `empty because the workspace is wrong, not because it holds no source ` +
        `material — check this slug against the one the document was uploaded under.`,
    })
  }
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
const MAX_UPLOAD_BYTES = 15_000_000

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
    // GF-142 — reject an over-cap document here rather than letting PocketBase
    // do it. PB's message ("summary must be no more than 1,000,000 characters")
    // is technically right and practically useless: the document that triggered
    // it reads as a few pages, because 94% of its characters were images the
    // Markdown export inlined as base64 text. Naming both sizes and the cause is
    // the difference between "it broke" and "remove the images or split it".
    // Count code points, not `text.length`: PocketBase's validator counts runes,
    // so UTF-16 units would refuse an emoji-heavy document PB would have taken.
    const charCount = countCodePoints(text)
    if (charCount > SUMMARY_MAX_CHARS) {
      return problem(c, {
        title: 'Payload Too Large',
        status: 413,
        detail:
          `This document is ${charCount.toLocaleString('en-US')} characters; the limit is ` +
          `${SUMMARY_MAX_CHARS.toLocaleString('en-US')}. Images embedded in a Markdown export ` +
          'are stored as text and count toward that, so a file that looks like a few pages can ' +
          'be far over the limit. Remove the embedded images, or split the document into parts.',
      })
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
        // GF-110 — approved on arrival. The agent-facing read filters
        // `approved=true`, so an upload that landed unapproved was invisible to
        // Viktor until someone clicked approve; dropping a file in the Assets
        // tab is already the deliberate act, and the second click was pure
        // friction. The JSON create route still honours the caller's flag.
        approved: true,
        approvedAt: now,
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
      after: { title, bytes: file.size, filename: file.name, autoApproved: true },
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

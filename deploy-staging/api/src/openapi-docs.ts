// OpenAPI documentation for the agent-operable surface of the API.
//
// WHY THIS FILE EXISTS: almost every route is a plain Hono handler (not
// `.openapi()`), so the Scalar UI at /api/v1/docs and /api/v1/openapi.json were
// nearly empty — an external agent had nothing machine-readable to operate the
// dashboard from. This module DOCUMENTS those routes without re-implementing
// them: it calls `registry.registerPath(...)` (exactly what `app.openapi()` does
// internally, minus the handler), so the actual request handling stays in the
// existing route files and behaviour is unchanged. Keep this in sync with the
// route files and deploy-staging/api/README.md.

import { createRoute, z, type OpenAPIHono } from '@hono/zod-openapi'
import { CHANNELS, POST_STATUSES } from './schemas/post.js'
import {
  postCreateSchema,
  postPatchSchema,
  suggestionPatchSchema,
  approvalCreateSchema,
} from './schemas/post.js'

// ── Shared pieces ────────────────────────────────────────────────────────────

const slugParam = z.object({
  slug: z
    .string()
    .openapi({ param: { name: 'slug', in: 'path' }, example: 'staging-demo' }),
})

const slugIdParam = z.object({
  slug: z
    .string()
    .openapi({ param: { name: 'slug', in: 'path' }, example: 'staging-demo' }),
  id: z.string().openapi({ param: { name: 'id', in: 'path' }, example: 'p001' }),
})

const bearer = [{ bearerAuth: [] }]

const Problem = z
  .object({
    type: z.string().openapi({ example: 'about:blank' }),
    title: z.string().openapi({ example: 'Forbidden' }),
    status: z.number().openapi({ example: 403 }),
    detail: z.string().openapi({ example: 'Role "agent" cannot access this endpoint' }),
    errors: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .optional()
      .openapi({ description: 'Present on 422 — names each failing field so you can fix and retry.' }),
  })
  .openapi('Problem')

const json = <T extends z.ZodTypeAny>(schema: T) => ({ 'application/json': { schema } })

// Common error responses, reused across authed write routes.
const errs = {
  401: { description: 'Missing / unknown / revoked token', content: json(Problem) },
  403: {
    description:
      'Token scoped to a different client, or role not permitted (e.g. agent writing user-owned data other than branding)',
    content: json(Problem),
  },
  404: { description: 'No such resource', content: json(Problem) },
  422: {
    description: 'Validation failed — `detail` + `errors[]` name the bad field(s)',
    content: json(Problem),
  },
}

// ── Response/body schemas (agent-facing) ─────────────────────────────────────

const Branding = z
  .object({
    colors: z
      .array(z.object({ name: z.string(), hex: z.string() }))
      .optional()
      .openapi({ example: [{ name: 'Primary', hex: '#1e40af' }] }),
    typography: z
      .object({ headingFont: z.string(), bodyFont: z.string() })
      .partial()
      .optional(),
    logos: z
      .array(z.object({ variant: z.string(), url: z.string() }))
      .optional(),
    toneKeywords: z.array(z.string()).optional().openapi({ example: ['precise', 'warm'] }),
  })
  .openapi('Branding', {
    description:
      'Brand identity. A PATCH replaces the ENTIRE colors/logos array (shallow top-level merge, no per-element merge) — GET the brief first to change one element.',
  })

const Post = z
  .object({
    id: z.string(),
    date: z.string().openapi({ example: '2026-06-20' }),
    title: z.string(),
    channel: z.enum(CHANNELS).optional(),
    status: z.enum(POST_STATUSES).optional(),
    copy: z.string().optional(),
    cta: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    image: z.string().optional().openapi({
      description:
        'Public asset URL. Use the /clients/{slug}/assets/files/{name} form, never a bare filename.',
    }),
    slides: z
      .array(z.object({ image: z.string(), caption: z.string().optional() }))
      .optional()
      .openapi({ description: 'Carousel only (2–10). Cover = slides[0].image.' }),
    media: z
      .array(
        z.object({
          type: z.enum(['image', 'video']),
          url: z.string(),
          thumbnail: z.string().optional(),
          caption: z.string().optional(),
          assetId: z.string().optional(),
        }),
      )
      .optional()
      .openapi({ description: 'Mixed post media. Use type="video" for generated MP4 clips attached to the post.' }),
    pillar: z.string().optional(),
    format: z.string().optional(),
    campaign: z.string().optional(),
    approval: z.object({ status: z.string().optional() }).passthrough().optional(),
    publishing: z.object({}).passthrough().optional(),
  })
  .passthrough()
  .openapi('Post')

const DataDoc = z.object({ data: z.unknown() }).openapi('DataDoc', {
  description: 'Opaque document envelope. `data` is the full brief/plan/goals/learnings JSON.',
})

const ItemList = (item: z.ZodTypeAny, name: string) =>
  z.object({ items: z.array(item) }).openapi(name)

const InformationSource = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string().openapi({ example: 'Q3 product launch press release' }),
    url: z.string().optional().openapi({ example: 'https://example.com/news' }),
    sourceType: z
      .enum(['website', 'note', 'news', 'reference', 'other'])
      .optional()
      .openapi({ example: 'website' }),
    summary: z
      .string()
      .optional()
      .openapi({ description: 'The factual text the agent uses as grounding for post generation.' }),
    prompt: z
      .string()
      .optional()
      .openapi({ description: 'How the agent should use this source. Defaults to a sensible instruction.' }),
    approved: z.boolean().optional().openapi({ description: 'Only approved sources are fed to the agent by default.' }),
    approvedAt: z.string().optional(),
    lastImportedAt: z.string().optional(),
    tags: z.array(z.string()).optional(),
    actor: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .passthrough()
  .openapi('InformationSource', {
    description:
      'A piece of "source material for post generation": a website, note, news item, or uploaded transcript the agent uses as factual grounding. Create with POST /information-sources (JSON) or POST /information-sources/upload (text file).',
  })

const InformationSourceCreate = z
  .object({
    title: z.string().openapi({ example: 'Q3 product launch press release' }),
    url: z.string().optional().openapi({ example: 'https://example.com/news' }),
    sourceType: z.enum(['website', 'note', 'news', 'reference', 'other']).optional().openapi({ example: 'news' }),
    summary: z
      .string()
      .optional()
      .openapi({ description: 'Factual content to ground generation. For a website paste the relevant extracted text here.' }),
    prompt: z.string().optional().openapi({ description: 'Optional instruction for how the agent should use this source.' }),
    approved: z.boolean().optional().openapi({ description: 'Set true to make the source immediately available to the agent.' }),
    tags: z.array(z.string()).optional(),
  })
  .openapi('InformationSourceCreate', { description: 'Only `title` is required. Role `agent` is allowed.' })

const AgentJob = z
  .object({
    id: z.string(),
    slug: z.string(),
    thread: z.string().optional(),
    source: z.enum(['dashboard_chat', 'telegram', 'n8n', 'make', 'claude', 'custom']),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'timed_out', 'recovered']),
    provider: z.string().optional(),
    providerRunId: z.string().optional(),
    userMessageId: z.string().optional(),
    assistantMessageId: z.string().optional(),
    created: z.string().optional(),
    updated: z.string().optional(),
    completedAt: z.string().optional(),
  })
  .passthrough()
  .openapi('AgentJob')

// ── Registration ─────────────────────────────────────────────────────────────

export function registerApiDocs(app: OpenAPIHono): void {
  const reg = (config: Parameters<typeof createRoute>[0]) =>
    app.openAPIRegistry.registerPath(createRoute(config))

  // Bundle read.
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}',
    tags: ['clients'],
    summary: 'Hydrate a whole client (summary + all docs)',
    description: 'One-shot read: summary + brief/plan/goals/learnings/suggestions/performance/manifest.',
    security: bearer,
    request: { params: slugParam },
    responses: { 200: { description: 'Client bundle', content: json(z.object({}).passthrough()) }, 401: errs[401], 403: errs[403] },
  })

  // ── Strategy (user-owned) reads + writes ───────────────────────────────────
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/agent-jobs',
    tags: ['agent jobs'],
    summary: 'List durable platform jobs',
    description:
      'Returns recent platform-owned jobs for a client/thread. Dashboard chat uses this to distinguish truly running work from completed/recovered/failed jobs.',
    security: bearer,
    request: {
      params: slugParam,
      query: z.object({
        thread: z.string().optional().openapi({ example: 'dash-staging-demo' }),
        limit: z.coerce.number().optional().openapi({ example: 20 }),
      }),
    },
    responses: {
      200: { description: 'Recent jobs', content: json(ItemList(AgentJob, 'AgentJobList')) },
      401: errs[401],
      403: errs[403],
    },
  })

  for (const res of ['brief', 'plan', 'goals', 'learnings'] as const) {
    reg({
      method: 'get',
      path: `/api/v1/clients/{slug}/${res}`,
      tags: ['strategy (user-owned)'],
      summary: `Read ${res}`,
      description: res === 'brief' ? 'Includes `data.branding`.' : undefined,
      security: bearer,
      request: { params: slugParam },
      responses: { 200: { description: res, content: json(DataDoc) }, 401: errs[401], 403: errs[403] },
    })
    reg({
      method: 'put',
      path: `/api/v1/clients/{slug}/${res}`,
      tags: ['strategy (user-owned)'],
      summary: `Replace ${res} (dash/admin only)`,
      description: 'Role `agent` is **forbidden (403)** here — strategy docs are human-owned. Agents read only.',
      security: bearer,
      request: { params: slugParam, body: { required: true, content: json(DataDoc) } },
      responses: { 200: { description: 'Updated', content: json(DataDoc) }, 400: { description: 'Bad body', content: json(Problem) }, 401: errs[401], 403: errs[403] },
    })
  }

  // Branding — the one user-owned field the agent role MAY write.
  reg({
    method: 'patch',
    path: '/api/v1/clients/{slug}/branding',
    tags: ['strategy (user-owned)'],
    summary: 'Update branding (agent allowed)',
    description:
      'Shallow-merge brand fields into brief.branding. Writable by role **agent** (the one user-owned exception), dash, admin.',
    security: bearer,
    request: { params: slugParam, body: { required: true, content: json(Branding) } },
    responses: { 200: { description: 'Merged branding', content: json(z.object({ data: Branding })) }, 400: { description: 'Bad body', content: json(Problem) }, 401: errs[401], 403: errs[403] },
  })

  reg({
    method: 'post',
    path: '/api/v1/clients/{slug}/learnings/entries',
    tags: ['strategy (user-owned)'],
    summary: 'Append one learning (dash/admin only)',
    description: 'Role `agent` is forbidden (403).',
    security: bearer,
    request: { params: slugParam, body: { required: true, content: json(z.object({ id: z.string().optional() }).passthrough()) } },
    responses: { 201: { description: 'Appended', content: json(DataDoc) }, 401: errs[401], 403: errs[403] },
  })

  // ── Posts (Viktor-owned: agent read+write) ─────────────────────────────────
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/posts',
    tags: ['posts'],
    summary: 'List posts',
    security: bearer,
    request: {
      params: slugParam,
      query: z.object({
        status: z.enum(POST_STATUSES).optional().openapi({ param: { name: 'status', in: 'query' } }),
        pillar: z.string().optional().openapi({ param: { name: 'pillar', in: 'query' } }),
        includeDeleted: z.enum(['true', 'false']).optional().openapi({ param: { name: 'includeDeleted', in: 'query' } }),
      }),
    },
    responses: { 200: { description: 'Posts', content: json(ItemList(Post, 'PostList')) }, 401: errs[401], 403: errs[403] },
  })
  reg({
    method: 'post',
    path: '/api/v1/clients/{slug}/posts',
    tags: ['posts'],
    summary: 'Create a post',
    description: 'Strictly validated — unknown/typo keys 422. `date` + `title` required.',
    security: bearer,
    request: { params: slugParam, body: { required: true, content: json(postCreateSchema.openapi('PostCreate')) } },
    responses: { 201: { description: 'Created', content: json(Post) }, 401: errs[401], 403: errs[403], 422: errs[422] },
  })
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/posts/{id}',
    tags: ['posts'],
    summary: 'Read one post',
    security: bearer,
    request: { params: slugIdParam },
    responses: { 200: { description: 'Post', content: json(Post) }, 401: errs[401], 403: errs[403], 404: errs[404] },
  })
  reg({
    method: 'patch',
    path: '/api/v1/clients/{slug}/posts/{id}',
    tags: ['posts'],
    summary: 'Edit a post',
    description: 'Any subset of post fields; each present field must be the right type (422 otherwise).',
    security: bearer,
    request: { params: slugIdParam, body: { required: true, content: json(postPatchSchema.openapi('PostPatch')) } },
    responses: { 200: { description: 'Updated', content: json(Post) }, 401: errs[401], 403: errs[403], 422: errs[422] },
  })
  reg({
    method: 'delete',
    path: '/api/v1/clients/{slug}/posts/{id}',
    tags: ['posts'],
    summary: 'Soft-delete a post',
    description: 'Sets status to `deleted`; recover with a PATCH to another status.',
    security: bearer,
    request: { params: slugIdParam },
    responses: { 200: { description: 'Deleted', content: json(z.object({ ok: z.boolean(), id: z.string() })) }, 401: errs[401], 403: errs[403], 404: errs[404] },
  })

  // ── Suggestions ────────────────────────────────────────────────────────────
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/suggestions',
    tags: ['suggestions'],
    summary: 'List suggestions (priority-sorted)',
    security: bearer,
    request: { params: slugParam },
    responses: { 200: { description: 'Suggestions', content: json(ItemList(z.object({}).passthrough(), 'SuggestionList')) }, 401: errs[401], 403: errs[403] },
  })
  reg({
    method: 'patch',
    path: '/api/v1/clients/{slug}/suggestions/{id}',
    tags: ['suggestions'],
    summary: 'Update a suggestion',
    security: bearer,
    request: { params: slugIdParam, body: { required: true, content: json(suggestionPatchSchema.openapi('SuggestionPatch')) } },
    responses: { 200: { description: 'Updated', content: json(z.object({}).passthrough()) }, 401: errs[401], 403: errs[403], 422: errs[422] },
  })

  // ── Approvals ──────────────────────────────────────────────────────────────
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/approvals',
    tags: ['approvals'],
    summary: 'Approval activity feed',
    security: bearer,
    request: { params: slugParam },
    responses: { 200: { description: 'Approvals', content: json(ItemList(z.object({}).passthrough(), 'ApprovalList')) }, 401: errs[401], 403: errs[403] },
  })
  reg({
    method: 'post',
    path: '/api/v1/clients/{slug}/approvals',
    tags: ['approvals'],
    summary: 'Record an approval decision',
    security: bearer,
    request: { params: slugParam, body: { required: true, content: json(approvalCreateSchema.openapi('ApprovalCreate')) } },
    responses: { 201: { description: 'Recorded', content: json(z.object({}).passthrough()) }, 401: errs[401], 403: errs[403], 422: errs[422] },
  })

  // ── Performance + assets ─────────────────────────────────────────────────────
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/performance',
    tags: ['assets'],
    summary: 'Read performance JSON',
    security: bearer,
    request: { params: slugParam },
    responses: { 200: { description: 'Performance', content: json(z.object({}).passthrough()) }, 401: errs[401], 403: errs[403] },
  })
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/assets/manifest',
    tags: ['assets'],
    summary: 'Read the asset manifest',
    security: bearer,
    request: { params: slugParam },
    responses: { 200: { description: 'Manifest', content: json(ItemList(z.object({}).passthrough(), 'AssetManifest')) }, 401: errs[401], 403: errs[403] },
  })
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/assets/files/{name}',
    tags: ['assets'],
    summary: 'Stream a generated media asset (public, no auth)',
    description: 'Unauthenticated so image/video tags work. Use this URL form in post.image / branding logos / video manifest items.',
    request: {
      params: z.object({
        slug: z.string().openapi({ param: { name: 'slug', in: 'path' }, example: 'staging-demo' }),
        name: z.string().openapi({ param: { name: 'name', in: 'path' }, example: 'launch-cover.png' }),
      }),
    },
    responses: {
      200: { description: 'Media bytes', content: { 'image/png': { schema: z.string().openapi({ format: 'binary' }) }, 'video/mp4': { schema: z.string().openapi({ format: 'binary' }) } } },
      400: { description: 'Invalid slug/filename', content: json(Problem) },
      404: { description: 'No such asset', content: json(Problem) },
    },
  })

  // ── Source material / information sources (agent read+write) ────────────────
  // "Source material for post generation" in the dashboard. Agents post the
  // facts/links/transcripts they want the planner grounded on here.
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/information-sources',
    tags: ['source material'],
    summary: 'List source material (information sources)',
    description: 'Pass `?approved=true` to get only the sources currently fed to the agent.',
    security: bearer,
    request: {
      params: slugParam,
      query: z.object({
        approved: z.enum(['true', 'false']).optional().openapi({ param: { name: 'approved', in: 'query' } }),
      }),
    },
    responses: {
      200: { description: 'Sources', content: json(ItemList(InformationSource, 'InformationSourceList')) },
      401: errs[401],
      403: errs[403],
    },
  })
  reg({
    method: 'post',
    path: '/api/v1/clients/{slug}/information-sources',
    tags: ['source material'],
    summary: 'Add source material (agent allowed)',
    description:
      'Create a source from JSON. Role **agent** is allowed. Only `title` is required; set `approved: true` to make it usable immediately. To upload a transcript/notes FILE instead, use POST /information-sources/upload.',
    security: bearer,
    request: { params: slugParam, body: { required: true, content: json(InformationSourceCreate) } },
    responses: {
      201: { description: 'Created', content: json(InformationSource) },
      400: { description: 'Missing title / bad body', content: json(Problem) },
      401: errs[401],
      403: errs[403],
    },
  })
  reg({
    method: 'post',
    path: '/api/v1/clients/{slug}/information-sources/upload',
    tags: ['source material'],
    summary: 'Upload a transcript/notes file as source material (agent allowed)',
    description:
      'multipart/form-data with a `file` part. Only text-based files (.txt, .md, .vtt, .srt, .csv, .json) up to 15 MB — the text is extracted into `summary`. Created un-approved; approve it afterwards.',
    security: bearer,
    request: {
      params: slugParam,
      body: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: z.object({
              file: z.string().openapi({ format: 'binary' }),
              title: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Created', content: json(InformationSource) },
      400: { description: 'Missing/empty file', content: json(Problem) },
      401: errs[401],
      403: errs[403],
      413: { description: 'File over 15 MB', content: json(Problem) },
      415: { description: 'Not a text file', content: json(Problem) },
    },
  })
  reg({
    method: 'patch',
    path: '/api/v1/clients/{slug}/information-sources/{id}',
    tags: ['source material'],
    summary: 'Edit a source (agent allowed)',
    security: bearer,
    request: { params: slugIdParam, body: { required: true, content: json(InformationSourceCreate.partial()) } },
    responses: {
      200: { description: 'Updated', content: json(InformationSource) },
      401: errs[401],
      403: errs[403],
      404: errs[404],
    },
  })
  reg({
    method: 'post',
    path: '/api/v1/clients/{slug}/information-sources/{id}/approve',
    tags: ['source material'],
    summary: 'Approve a source so the agent uses it (agent allowed)',
    security: bearer,
    request: { params: slugIdParam },
    responses: {
      200: { description: 'Approved', content: json(InformationSource) },
      401: errs[401],
      403: errs[403],
      404: errs[404],
    },
  })

  // ── Planning config: calendar range (agent read+write) ─────────────────────
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/config/calendar-range',
    tags: ['config'],
    summary: 'Read the active content calendar range',
    security: bearer,
    request: { params: slugParam },
    responses: {
      200: {
        description: 'Range or null',
        content: json(
          z.object({
            data: z
              .object({ startMonth: z.string().openapi({ example: '2026-06' }), endMonth: z.string().openapi({ example: '2026-09' }) })
              .nullable(),
          }),
        ),
      },
      401: errs[401],
      403: errs[403],
    },
  })
  reg({
    method: 'put',
    path: '/api/v1/clients/{slug}/config/calendar-range',
    tags: ['config'],
    summary: 'Set the content calendar range (agent allowed)',
    description: 'startMonth/endMonth as YYYY-MM, spanning at most 6 months.',
    security: bearer,
    request: {
      params: slugParam,
      body: {
        required: true,
        content: json(
          z.object({
            data: z.object({
              startMonth: z.string().openapi({ example: '2026-06' }),
              endMonth: z.string().openapi({ example: '2026-09' }),
            }),
          }),
        ),
      },
    },
    responses: {
      200: { description: 'Updated', content: json(z.object({ data: z.object({ startMonth: z.string(), endMonth: z.string() }) })) },
      401: errs[401],
      403: errs[403],
      422: errs[422],
    },
  })

  // ── Inspiration image library (dashboard-owned: dash/admin write) ──────────
  reg({
    method: 'get',
    path: '/api/v1/clients/{slug}/inspiration',
    tags: ['assets'],
    summary: 'List inspiration images',
    security: bearer,
    request: { params: slugParam },
    responses: {
      200: { description: 'Inspiration items', content: json(ItemList(z.object({}).passthrough(), 'InspirationList')) },
      401: errs[401],
      403: errs[403],
    },
  })
}

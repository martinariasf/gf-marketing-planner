// Idempotent collection bootstrap.
//
// The JS migration shipped in pb-migrations/ uses PB v0.20 SDK shape and is
// silently no-op on PB v0.38, so we ensure the Phase 1+ collections exist
// directly via the JS SDK at API boot. Safe to run on every start — checks
// existence by name first.

import { withPb } from './pb.js'

// GF-110 — the length option is NOT interchangeable across PB field types:
// `text` is bounded by `max` (characters), while `json`/`editor`/`file` use
// `maxSize` (bytes). PocketBase drops an unknown option silently, so a `text`
// field declared with `maxSize` kept `max: 0` and inherited PB's 5000-character
// DEFAULT — six fields were capped at 5000 for months while claiming megabytes.
// The union below makes that spelling a compile error instead of a runtime
// surprise: `text` has no `maxSize`, and the byte-sized types have no `max`.
interface FieldSpecBase {
  name: string
  required?: boolean
  onCreate?: boolean
  onUpdate?: boolean
}

/** Character-bounded. `max: 0`/omitted means PB's 5000 default — always set it. */
interface TextFieldSpec extends FieldSpecBase {
  type: 'text'
  max?: number
  min?: number
  maxSize?: never
}

/** Byte-bounded field types. */
interface SizedFieldSpec extends FieldSpecBase {
  type: 'json' | 'editor'
  maxSize?: number
  max?: never
}

interface SelectFieldSpec extends FieldSpecBase {
  type: 'select'
  values?: string[]
  maxSelect?: number
}

interface FileFieldSpec extends FieldSpecBase {
  type: 'file'
  maxSize?: number
  maxSelect?: number
  mimeTypes?: string[]
}

/** Field types with no length/size option (bool, date, url, autodate, ...). */
interface PlainFieldSpec extends FieldSpecBase {
  type: 'bool' | 'date' | 'url' | 'autodate' | 'number' | 'email'
}

type FieldSpec =
  | TextFieldSpec
  | SizedFieldSpec
  | SelectFieldSpec
  | FileFieldSpec
  | PlainFieldSpec

interface CollectionSpec {
  name: string
  fields: FieldSpec[]
  indexes?: string[]
  listRule?: string | null
  viewRule?: string | null
  createRule?: string | null
  updateRule?: string | null
  deleteRule?: string | null
}

// GF-142 — the `summary` cap, exported so the information-sources upload route
// can reject an over-cap document itself with an actionable message instead of
// letting PocketBase's bare validation sentence reach the dashboard. Declared
// here because this is where the live schema is reconciled; a second literal in
// the route would drift the day this one is raised.
export const SUMMARY_MAX_CHARS = 1_000_000

const collections: CollectionSpec[] = [
  {
    name: 'api_tokens',
    fields: [
      { name: 'token', type: 'text', required: true, max: 128 },
      // GF-144 — `viewer` is a read-only token role (see auth.ts). NOTE: this
      // array only takes effect when the collection is CREATED. ensureCollections
      // reconciles missing fields and text `max` raises, never an existing
      // select's `values`, so on live staging the `role` field must be widened
      // once by hand in the PB admin UI.
      { name: 'role', type: 'select', required: true, values: ['agent', 'dash', 'admin', 'viewer'] },
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'label', type: 'text' },
      { name: 'revoked', type: 'bool' },
      { name: 'lastUsedAt', type: 'date' },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_api_tokens_token` ON `api_tokens` (`token`)'],
  },
  {
    name: 'audit',
    fields: [
      { name: 'actor', type: 'text', required: true, max: 100 },
      { name: 'role', type: 'text', max: 20 },
      { name: 'action', type: 'text', required: true, max: 80 },
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'resource', type: 'text', max: 80 },
      { name: 'before', type: 'json', maxSize: 5_000_000 },
      { name: 'after', type: 'json', maxSize: 5_000_000 },
      { name: 'note', type: 'text', max: 500 },
      { name: 'ts', type: 'text', max: 40 },
    ],
    indexes: ['CREATE INDEX `idx_audit_slug` ON `audit` (`slug`)'],
  },
  {
    name: 'chat_messages',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'thread', type: 'text', max: 100 },
      { name: 'role', type: 'select', required: true, values: ['user', 'assistant', 'tool'] },
      { name: 'content', type: 'text', max: 5_000_000 },
      { name: 'toolEvent', type: 'json', maxSize: 1_000_000 },
      // GF-68: structured attachment metadata (id/kind/filename/url/etc per
      // attachment) carried on the message row. `content` stays the user's
      // raw typed text only — attachments are never inlined into it.
      { name: 'attachments', type: 'json', maxSize: 100_000 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    ],
    indexes: [
      'CREATE INDEX `idx_chat_slug` ON `chat_messages` (`slug`)',
      'CREATE INDEX `idx_chat_thread_created` ON `chat_messages` (`slug`,`thread`,`created`)',
    ],
    listRule: '@request.query.slug != "" && slug = @request.query.slug',
    viewRule: '@request.query.slug != "" && slug = @request.query.slug',
  },
  // Phase 4 overlays — Viktor-owned data still lives on disk; the dashboard's
  // staging-only writes go into these collections and read endpoints merge
  // disk + overlay before returning.
  {
    name: 'agent_jobs',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'thread', type: 'text', max: 100 },
      { name: 'source', type: 'select', required: true, values: ['dashboard_chat', 'telegram', 'n8n', 'make', 'claude', 'custom'] },
      { name: 'status', type: 'select', required: true, values: ['queued', 'running', 'completed', 'failed', 'timed_out', 'recovered'] },
      { name: 'input', type: 'json', maxSize: 5_000_000 },
      { name: 'result', type: 'json', maxSize: 5_000_000 },
      { name: 'error', type: 'json', maxSize: 1_000_000 },
      { name: 'provider', type: 'text', max: 80 },
      { name: 'providerRunId', type: 'text', max: 160 },
      { name: 'userMessageId', type: 'text', max: 100 },
      { name: 'assistantMessageId', type: 'text', max: 100 },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      { name: 'completedAt', type: 'text', max: 40 },
    ],
    indexes: [
      'CREATE INDEX `idx_agent_jobs_thread_created` ON `agent_jobs` (`slug`,`thread`,`created`)',
      'CREATE INDEX `idx_agent_jobs_status_updated` ON `agent_jobs` (`status`,`updated`)',
    ],
  },
  {
    name: 'posts_patches',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'postId', type: 'text', required: true, max: 100 },
      { name: 'patch', type: 'json', maxSize: 1_000_000 },
      { name: 'ts', type: 'text', max: 40 },
      { name: 'actor', type: 'text', max: 100 },
    ],
    indexes: [
      'CREATE INDEX `idx_posts_patches_slug_post` ON `posts_patches` (`slug`, `postId`)',
    ],
  },
  {
    name: 'suggestion_states',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'suggestionId', type: 'text', required: true, max: 100 },
      { name: 'status', type: 'select', values: ['open', 'accepted', 'dismissed'] },
      { name: 'priority', type: 'number' },
      { name: 'reason', type: 'text', max: 500 },
      { name: 'ts', type: 'text', max: 40 },
      { name: 'actor', type: 'text', max: 100 },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_suggestion_states_slug_id` ON `suggestion_states` (`slug`, `suggestionId`)',
    ],
  },
  {
    // Per-client inspiration assets uploaded from the dashboard (drag-drop).
    // Stored in PB because the API mounts clients/ read-only and can't write
    // image files to disk. Served back via /clients/:slug/inspiration/:id/file.
    name: 'inspiration_assets',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'note', type: 'text', max: 500 },
      {
        name: 'file',
        type: 'file',
        required: true,
        maxSelect: 1,
        maxSize: 15_000_000,
        mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      },
      { name: 'actor', type: 'text', max: 100 },
      { name: 'createdAt', type: 'text', max: 40 },
    ],
    indexes: ['CREATE INDEX `idx_inspiration_slug` ON `inspiration_assets` (`slug`)'],
  },
  {
    // GF-68: chat image/document uploads. Stored in PB for the same reason as
    // inspiration_assets (clients/ is mounted read-only). Images keep a real
    // `file` so they can be served back publicly (assetFiles.ts); documents
    // store only their extracted `text` — they are never served as files
    // (Martin's decision: doc text is inlined into the agent input directly,
    // so it never needs a public URL). `messageId` is backfilled by
    // routes/chat.ts once the chat_messages row it belongs to is created.
    name: 'chat_attachments',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'kind', type: 'select', required: true, values: ['image', 'document'] },
      {
        name: 'file',
        type: 'file',
        maxSelect: 1,
        maxSize: 10_000_000,
        mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
      },
      { name: 'filename', type: 'text', max: 300 },
      { name: 'mimeType', type: 'text', max: 120 },
      { name: 'size', type: 'number' },
      { name: 'text', type: 'text', max: 200_000 },
      { name: 'messageId', type: 'text', max: 100 },
      { name: 'actor', type: 'text', max: 100 },
      { name: 'createdAt', type: 'text', max: 40 },
    ],
    indexes: [
      'CREATE INDEX `idx_chat_attachments_slug` ON `chat_attachments` (`slug`)',
      'CREATE INDEX `idx_chat_attachments_message` ON `chat_attachments` (`messageId`)',
    ],
  },
  {
    // Soft-delete overlay for Viktor-owned manifest assets. The dashboard can
    // hide pictures from the Assets section without mutating assets/manifest.json
    // or deleting image files from the agent-owned client assets directory.
    name: 'asset_states',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'assetId', type: 'text', required: true, max: 160 },
      { name: 'status', type: 'select', required: true, values: ['active', 'deleted'] },
      { name: 'ts', type: 'text', max: 40 },
      { name: 'actor', type: 'text', max: 100 },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_asset_states_slug_asset` ON `asset_states` (`slug`, `assetId`)',
    ],
  },
  {
    // Dashboard- and chat-created posts. Viktor's disk JSON is the authoritative
    // source for posts he wrote; this collection holds posts originated from
    // the staging dashboard/chat. Reads merge both. `data` is the full post JSON.
    name: 'posts_created',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'postId', type: 'text', required: true, max: 100 },
      { name: 'data', type: 'json', maxSize: 5_000_000 },
      { name: 'ts', type: 'text', max: 40 },
      { name: 'actor', type: 'text', max: 100 },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_posts_created_slug_post` ON `posts_created` (`slug`, `postId`)',
    ],
  },
  {
    name: 'approvals_v2',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'postId', type: 'text', required: true, max: 100 },
      {
        name: 'decision',
        type: 'select',
        required: true,
        values: ['in_review', 'approved', 'scheduled', 'rejected'],
      },
      { name: 'note', type: 'text', max: 500 },
      { name: 'actor', type: 'text', max: 100 },
      { name: 'ts', type: 'text', max: 40 },
    ],
    indexes: ['CREATE INDEX `idx_approvals_v2_slug_post` ON `approvals_v2` (`slug`, `postId`)'],
  },
  {
    name: 'org_configs',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'calendarRange', type: 'json', maxSize: 100_000 },
      // GF-92 (B) — per-client dashboard toggles (showAiGeneratedLabel,
      // autoScheduleOnApprove). Additive: existing rows with no `settings`
      // value simply read back as undefined, and callers fall back to
      // DEFAULTS (see routes/planningConfig.ts / orgSettings.ts).
      { name: 'settings', type: 'json', maxSize: 100_000 },
      { name: 'updatedAt', type: 'text', max: 40 },
      { name: 'actor', type: 'text', max: 100 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_org_configs_slug` ON `org_configs` (`slug`)'],
  },
  {
    // GF-11: integration credentials (e.g. Postiz API key). Deliberately a
    // SEPARATE collection from org_configs because org_configs is agent-readable
    // (no role gate on its GET). Secrets here are stored as an encrypted envelope
    // (see secrets.ts) and are NEVER returned to the dashboard — only the masked
    // last4 is. The plaintext is decrypted server-side solely for the agent
    // runtime fetch path. Default deny on all PB rules so only the admin API
    // (withPb superuser) can touch it.
    name: 'integration_secrets',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'postizApiKeyEnc', type: 'text', max: 5_000 },
      { name: 'postizLast4', type: 'text', max: 8 },
      { name: 'updatedAt', type: 'text', max: 40 },
      { name: 'actor', type: 'text', max: 100 },
      // GF-80's Drive service-account email is NOT stored here — it is deploy
      // config (DRIVE_SHARE_EMAILS_JSON) shown read-only, not dashboard-entered.
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_integration_secrets_slug` ON `integration_secrets` (`slug`)'],
  },
  {
    // GF-113 — server-side cache of provider analytics (Postiz today, GF-21's
    // Meta adapter later). CACHE, NOT SOURCE OF TRUTH: it may be dropped and
    // rebuilt by any sync, so nothing may be stored here that cannot be re-fetched.
    //
    // It exists because the Postiz public API is rate limited and returns NO
    // rate-limit headers at all (measured in the TASK-001 probe), so we cannot
    // self-regulate at runtime. Calling Postiz on page load would burn an
    // unmeasurable quota; the tab therefore reads this row and only this row.
    //
    // Default deny on every PB rule — the payload is per-client business data and
    // only the admin API (withPb superuser) touches it.
    name: 'analytics_cache',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'provider', type: 'text', max: 80 },
      { name: 'status', type: 'select', values: ['ok', 'no_key', 'no_channels', 'stale', 'error'] },
      // TRAP (platform gotcha): PocketBase does NOT auto-populate a `created`
      // field in this deployment, so the sync worker writes this ISO string
      // itself. The tab's "last updated" stamp is read straight from it — if it
      // were left to PB it would silently be empty and the stamp would lie.
      { name: 'syncedAt', type: 'text', max: 40 },
      { name: 'error', type: 'text', max: 2_000 },
      { name: 'channels', type: 'json', maxSize: 5_000_000 },
      // NOTE: `series` is written as `[]` today. TASK-002 settled the contract
      // with series nested PER CHANNEL (inside `channels[].series`), because every
      // metric Postiz returns belongs to exactly one connected channel. This
      // top-level column is kept because TASK-004 specifies it and it is the
      // natural home for an account-level rollup that belongs to no single
      // channel — but nothing writes or reads it yet, and the SPA does not
      // receive it. Do not start populating it without updating the contract.
      { name: 'series', type: 'json', maxSize: 5_000_000 },
      { name: 'posts', type: 'json', maxSize: 5_000_000 },
      { name: 'unlinked', type: 'number' },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_analytics_cache_slug` ON `analytics_cache` (`slug`)'],
  },
  {
    name: 'information_sources',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'title', type: 'text', required: true, max: 300 },
      { name: 'url', type: 'url' },
      { name: 'sourceType', type: 'select', values: ['website', 'note', 'news', 'reference', 'other'] },
      { name: 'summary', type: 'text', max: SUMMARY_MAX_CHARS },
      { name: 'prompt', type: 'text', max: SUMMARY_MAX_CHARS },
      { name: 'approved', type: 'bool' },
      { name: 'approvedAt', type: 'text', max: 40 },
      { name: 'lastImportedAt', type: 'text', max: 40 },
      { name: 'tags', type: 'json', maxSize: 100_000 },
      { name: 'actor', type: 'text', max: 100 },
      { name: 'createdAt', type: 'text', max: 40 },
      { name: 'updatedAt', type: 'text', max: 40 },
    ],
    indexes: ['CREATE INDEX `idx_information_sources_slug` ON `information_sources` (`slug`)'],
  },
  // ── GF-4 Collaboration layer ────────────────────────────────────────────────
  // Protected external review links for the Content Creation calendar range.
  // A reviewer opens /review/<publicId> with a code, sees only the sanitized
  // posts in [rangeStart,rangeEnd], and can comment / submit a review decision.
  // The access code is stored hashed (sha256(publicId+":"+code)); never plaintext.
  {
    name: 'review_links',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'publicId', type: 'text', required: true, max: 64 },
      { name: 'title', type: 'text', max: 200 },
      { name: 'rangeStart', type: 'text', required: true, max: 7 },
      { name: 'rangeEnd', type: 'text', required: true, max: 7 },
      // GF-42 — optional subset of month keys (YYYY-MM) the sharer chose to
      // expose. Empty/absent = all months in [rangeStart, rangeEnd].
      { name: 'months', type: 'json', maxSize: 5_000 },
      { name: 'codeHash', type: 'text', required: true, max: 128 },
      // GF-105 — which kind of review this link is for. Not required: an
      // absent/empty value means 'content', so every pre-GF-105 link keeps its
      // behaviour and no data migration is needed.
      { name: 'view', type: 'select', values: ['content', 'strategy'] },
      { name: 'status', type: 'select', required: true, values: ['active', 'revoked'] },
      { name: 'expiresAt', type: 'text', max: 40 },
      { name: 'createdBy', type: 'text', max: 100 },
      { name: 'createdAt', type: 'text', max: 40 },
      { name: 'revokedAt', type: 'text', max: 40 },
    ],
    indexes: [
      'CREATE UNIQUE INDEX `idx_review_links_public` ON `review_links` (`publicId`)',
      'CREATE INDEX `idx_review_links_slug` ON `review_links` (`slug`)',
    ],
  },
  // External-reviewer comments + dashboard moderation replies. Kept distinct from
  // chat_messages (Viktor transcripts) and approvals_v2 (internal decisions).
  {
    name: 'review_comments',
    fields: [
      { name: 'linkId', type: 'text', required: true, max: 50 },
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'postId', type: 'text', max: 100 },
      { name: 'reviewerName', type: 'text', max: 120 },
      { name: 'body', type: 'text', required: true, max: 20_000 },
      { name: 'status', type: 'select', values: ['open', 'resolved'] },
      { name: 'source', type: 'select', required: true, values: ['reviewer', 'dashboard'] },
      { name: 'parentId', type: 'text', max: 50 },
      { name: 'createdAt', type: 'text', max: 40 },
    ],
    indexes: [
      'CREATE INDEX `idx_review_comments_link` ON `review_comments` (`linkId`,`createdAt`)',
      'CREATE INDEX `idx_review_comments_slug` ON `review_comments` (`slug`)',
    ],
  },
  // Dashboard-visible activity feed: one row per external review action so the
  // dashboard can show unread counts and link back to the reviewed post.
  {
    name: 'review_events',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'linkId', type: 'text', required: true, max: 50 },
      { name: 'postId', type: 'text', max: 100 },
      {
        name: 'kind',
        type: 'select',
        required: true,
        values: ['comment', 'approved', 'changes_requested'],
      },
      { name: 'reviewerName', type: 'text', max: 120 },
      { name: 'preview', type: 'text', max: 300 },
      { name: 'read', type: 'bool' },
      { name: 'createdAt', type: 'text', max: 40 },
    ],
    indexes: [
      'CREATE INDEX `idx_review_events_slug_read` ON `review_events` (`slug`,`read`,`createdAt`)',
      'CREATE INDEX `idx_review_events_link` ON `review_events` (`linkId`)',
    ],
  },
]

/** PocketBase's implicit cap on a `text` field left at `max: 0`. */
export const PB_DEFAULT_TEXT_MAX = 5000

/** One live PB field, as returned by collections.getFullList(). */
export type LiveField = { name?: string; type?: string; max?: number } & Record<string, unknown>

/** A live field with its `max` raised, plus a label for the log line. */
export interface TextMaxRaise {
  /** The live field object with `max` replaced — PB requires the original
   *  field `id` and every other option to survive the patch untouched. */
  field: LiveField
  name: string
  from: number
  to: number
}

/** GF-110 — raise `max` on live `text` fields that sit below what the spec
 *  declares. Only ever RAISES: a live field already at or above the declared
 *  max is left alone, so this can never shrink a limit under existing rows.
 *  `max: 0` counts as PB's 5000 default, which is the whole reason this exists.
 *
 *  Pure and PB-free so it unit-tests: hand it the spec fields and the live
 *  fields, get back the subset to patch. Returns [] when nothing needs raising,
 *  which is what keeps the boot pass idempotent across restarts. */
export function textMaxRaises(specFields: FieldSpec[], liveFields: LiveField[]): TextMaxRaise[] {
  const declared = new Map<string, number>()
  for (const f of specFields) {
    if (f.type === 'text' && typeof f.max === 'number' && f.max > 0) declared.set(f.name, f.max)
  }
  const raises: TextMaxRaise[] = []
  for (const live of liveFields) {
    if (live.type !== 'text' || typeof live.name !== 'string') continue
    const want = declared.get(live.name)
    if (want === undefined) continue
    // A live `max` of 0 (or absent) is not "unlimited" — PB enforces its
    // default. Compare against the cap that is actually in force.
    const rawMax = typeof live.max === 'number' ? live.max : 0
    const effective = rawMax > 0 ? rawMax : PB_DEFAULT_TEXT_MAX
    if (effective >= want) continue
    raises.push({ field: { ...live, max: want }, name: live.name, from: effective, to: want })
  }
  return raises
}

/** The exact `fields` array sent to PB in the collection patch: every live
 *  field in its original order, with raised ones swapped in place, then the
 *  newly-declared fields appended.
 *
 *  Split out from ensureCollections so the wiring is testable, not just the
 *  raise decision: getting this array wrong is how a schema patch silently
 *  drops or duplicates a column. */
export function patchFields(
  currentFields: LiveField[],
  raises: TextMaxRaise[],
  missingFields: FieldSpec[],
): unknown[] {
  const raisedById = new Map(raises.map((r) => [r.field.id, r.field]))
  return [
    ...currentFields.map((f) => raisedById.get(f.id) ?? f),
    ...missingFields,
  ]
}

export async function ensureCollections(): Promise<void> {
  await withPb(async (pb) => {
    const existing = await pb.collections.getFullList()
    const existingByName = new Map(existing.map((c) => [c.name, c]))
    for (const spec of collections) {
      const current = existingByName.get(spec.name)
      if (current) {
        const currentFields = Array.isArray(current.fields) ? current.fields : []
        const currentFieldNames = new Set(currentFields.map((f: { name?: string }) => f.name))
        const missingFields = spec.fields.filter((field) => !currentFieldNames.has(field.name))
        // Rule drift is only reconciled for chat_messages (its rules are managed
        // here); other collections just gain any newly-declared fields.
        const needsRules =
          spec.name === 'chat_messages' &&
          (current.listRule !== spec.listRule ||
            current.viewRule !== spec.viewRule ||
            current.createRule !== (spec.createRule ?? null) ||
            current.updateRule !== (spec.updateRule ?? null) ||
            current.deleteRule !== (spec.deleteRule ?? null))

        // GF-110 — a field that already exists was previously never revisited,
        // so correcting the spec alone would not have moved a single live cap.
        const raises = textMaxRaises(spec.fields, currentFields as LiveField[])

        if (missingFields.length > 0 || needsRules || raises.length > 0) {
          try {
            const patch: Record<string, unknown> = {
              ...current,
              fields: patchFields(currentFields as LiveField[], raises, missingFields),
              indexes: spec.indexes ?? current.indexes ?? [],
            }
            if (spec.name === 'chat_messages') {
              patch.listRule = spec.listRule ?? null
              patch.viewRule = spec.viewRule ?? null
              patch.createRule = spec.createRule ?? null
              patch.updateRule = spec.updateRule ?? null
              patch.deleteRule = spec.deleteRule ?? null
            }
            await pb.collections.update(current.id, patch)
            console.log(
              `[ensureCollections] updated ${spec.name}` +
                (missingFields.length ? ` (+${missingFields.map((f) => f.name).join(',')})` : '') +
                (raises.length
                  ? ` (max raised: ${raises.map((r) => `${r.name} ${r.from}->${r.to}`).join(', ')})`
                  : ''),
            )
          } catch (err) {
            console.warn(`[ensureCollections] failed updating ${spec.name}`, err)
          }
        }
        continue
      }
      try {
        await pb.collections.create({
          name: spec.name,
          type: 'base',
          listRule: spec.listRule ?? null,
          viewRule: spec.viewRule ?? null,
          createRule: spec.createRule ?? null,
          updateRule: spec.updateRule ?? null,
          deleteRule: spec.deleteRule ?? null,
          fields: spec.fields,
          indexes: spec.indexes ?? [],
        })
        console.log(`[ensureCollections] created ${spec.name}`)
      } catch (err) {
        // Index syntax can vary across PB minors — retry without indexes so
        // missing collections still get created. Indexes can be added by hand
        // later via /_/.
        console.warn(`[ensureCollections] retrying ${spec.name} without indexes`, err)
        await pb.collections.create({
          name: spec.name,
          type: 'base',
          listRule: spec.listRule ?? null,
          viewRule: spec.viewRule ?? null,
          createRule: spec.createRule ?? null,
          updateRule: spec.updateRule ?? null,
          deleteRule: spec.deleteRule ?? null,
          fields: spec.fields,
          indexes: [],
        })
        console.log(`[ensureCollections] created ${spec.name} (no indexes)`)
      }
    }
  })
}

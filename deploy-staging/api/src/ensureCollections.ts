// Idempotent collection bootstrap.
//
// The JS migration shipped in pb-migrations/ uses PB v0.20 SDK shape and is
// silently no-op on PB v0.38, so we ensure the Phase 1+ collections exist
// directly via the JS SDK at API boot. Safe to run on every start — checks
// existence by name first.

import { withPb } from './pb.js'

interface FieldSpec {
  name: string
  type: string
  required?: boolean
  max?: number
  min?: number
  values?: string[]
  maxSize?: number
  onCreate?: boolean
  onUpdate?: boolean
  // file-field options
  maxSelect?: number
  mimeTypes?: string[]
}

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

const collections: CollectionSpec[] = [
  {
    name: 'api_tokens',
    fields: [
      { name: 'token', type: 'text', required: true, max: 128 },
      { name: 'role', type: 'select', required: true, values: ['agent', 'dash', 'admin'] },
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
      { name: 'content', type: 'text', maxSize: 5_000_000 },
      { name: 'toolEvent', type: 'json', maxSize: 1_000_000 },
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
      { name: 'postizApiKeyEnc', type: 'text', maxSize: 5_000 },
      { name: 'postizLast4', type: 'text', max: 8 },
      { name: 'updatedAt', type: 'text', max: 40 },
      { name: 'actor', type: 'text', max: 100 },
    ],
    indexes: ['CREATE UNIQUE INDEX `idx_integration_secrets_slug` ON `integration_secrets` (`slug`)'],
  },
  {
    name: 'information_sources',
    fields: [
      { name: 'slug', type: 'text', required: true, max: 100 },
      { name: 'title', type: 'text', required: true, max: 300 },
      { name: 'url', type: 'url' },
      { name: 'sourceType', type: 'select', values: ['website', 'note', 'news', 'reference', 'other'] },
      { name: 'summary', type: 'text', maxSize: 1_000_000 },
      { name: 'prompt', type: 'text', maxSize: 1_000_000 },
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
      { name: 'codeHash', type: 'text', required: true, max: 128 },
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
      { name: 'body', type: 'text', required: true, maxSize: 20_000 },
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

export async function ensureCollections(): Promise<void> {
  await withPb(async (pb) => {
    const existing = await pb.collections.getFullList()
    const existingByName = new Map(existing.map((c) => [c.name, c]))
    for (const spec of collections) {
      const current = existingByName.get(spec.name)
      if (current) {
        if (spec.name === 'chat_messages') {
          const currentFields = Array.isArray(current.fields) ? current.fields : []
          const currentFieldNames = new Set(currentFields.map((f: { name?: string }) => f.name))
          const needsField = spec.fields.some((field) => !currentFieldNames.has(field.name))
          const needsRules =
            current.listRule !== spec.listRule ||
            current.viewRule !== spec.viewRule ||
            current.createRule !== (spec.createRule ?? null) ||
            current.updateRule !== (spec.updateRule ?? null) ||
            current.deleteRule !== (spec.deleteRule ?? null)

          if (needsField || needsRules) {
            try {
              await pb.collections.update(current.id, {
                ...current,
                listRule: spec.listRule ?? null,
                viewRule: spec.viewRule ?? null,
                createRule: spec.createRule ?? null,
                updateRule: spec.updateRule ?? null,
                deleteRule: spec.deleteRule ?? null,
                fields: [
                  ...currentFields,
                  ...spec.fields.filter((field) => !currentFieldNames.has(field.name)),
                ],
                indexes: spec.indexes ?? current.indexes ?? [],
              })
              console.log('[ensureCollections] updated chat_messages')
            } catch (err) {
              console.warn('[ensureCollections] failed updating chat_messages', err)
            }
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

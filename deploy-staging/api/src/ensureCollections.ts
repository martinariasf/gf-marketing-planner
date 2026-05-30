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
}

interface CollectionSpec {
  name: string
  fields: FieldSpec[]
  indexes?: string[]
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
    ],
    indexes: ['CREATE INDEX `idx_chat_slug` ON `chat_messages` (`slug`)'],
  },
]

export async function ensureCollections(): Promise<void> {
  await withPb(async (pb) => {
    const existing = await pb.collections.getFullList()
    const existingNames = new Set(existing.map((c) => c.name))
    for (const spec of collections) {
      if (existingNames.has(spec.name)) continue
      try {
        await pb.collections.create({
          name: spec.name,
          type: 'base',
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
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
          listRule: null,
          viewRule: null,
          createRule: null,
          updateRule: null,
          deleteRule: null,
          fields: spec.fields,
          indexes: [],
        })
        console.log(`[ensureCollections] created ${spec.name} (no indexes)`)
      }
    }
  })
}

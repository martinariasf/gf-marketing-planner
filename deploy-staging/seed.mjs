#!/usr/bin/env node
/**
 * Seed script — reads clients/∗/∗.json from the repo and upserts into PocketBase.
 *
 * Usage:
 *   PB_URL=http://localhost:8090 PB_EMAIL=admin@gfinnov.com PB_PASSWORD=... node seed.mjs
 *
 * If records already exist they are updated (upsert by slug). Safe to run
 * multiple times.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CLIENTS_DIR = resolve(__dirname, '..', 'clients')

const PB_URL = process.env.PB_URL || 'http://localhost:8090'
const PB_EMAIL = process.env.PB_EMAIL || 'admin@gfinnov.com'
const PB_PASSWORD = process.env.PB_PASSWORD

if (!PB_PASSWORD) {
  console.error('PB_PASSWORD env var is required')
  process.exit(1)
}

// ── PocketBase REST helpers ──────────────────────────────────────────────────

let authToken = ''

async function authenticate() {
  const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  })
  if (!res.ok) {
    // PocketBase v0.23+ uses /api/superusers instead of /api/admins
    const res2 = await fetch(`${PB_URL}/api/superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
    })
    if (!res2.ok) {
      throw new Error(`Auth failed: ${res2.status} ${await res2.text()}`)
    }
    const data = await res2.json()
    authToken = data.token
    return
  }
  const data = await res.json()
  authToken = data.token
}

async function pbFetch(path, opts = {}) {
  const res = await fetch(`${PB_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authToken,
      ...(opts.headers || {}),
    },
  })
  return res
}

async function upsert(collection, slug, body) {
  // Try to find existing record by slug
  const search = await pbFetch(
    `/api/collections/${collection}/records?filter=(slug='${slug}')`,
  )
  const searchData = await search.json()

  if (searchData.items && searchData.items.length > 0) {
    // Update
    const id = searchData.items[0].id
    const res = await pbFetch(
      `/api/collections/${collection}/records/${id}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    )
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`PATCH ${collection}/${id} failed: ${res.status} ${err}`)
    }
    console.log(`  ✓ ${collection}/${slug} updated`)
  } else {
    // Create
    const res = await pbFetch(`/api/collections/${collection}/records`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`POST ${collection} failed: ${res.status} ${err}`)
    }
    console.log(`  ✓ ${collection}/${slug} created`)
  }
}

// ── Read client data ─────────────────────────────────────────────────────────

function readJson(path) {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding PocketBase at ${PB_URL}`)
  await authenticate()
  console.log('Authenticated.')

  const index = readJson(resolve(CLIENTS_DIR, 'index.json'))
  if (!index?.clients?.length) {
    console.error('No clients found in clients/index.json')
    process.exit(1)
  }

  for (const entry of index.clients) {
    const slug = entry.slug
    console.log(`\nClient: ${slug}`)

    // Upsert client index entry
    await upsert('clients', slug, {
      slug,
      name: entry.name,
      industry: entry.industry || '',
      logoInitials: entry.logoInitials || '',
      quarter: entry.quarter || '',
      headline: entry.headline || '',
      status: entry.status || 'active',
    })

    // Upsert document collections (user-owned only)
    const docFiles = [
      { collection: 'briefs', file: 'brief.json' },
      { collection: 'plans', file: 'plan.json' },
      { collection: 'goals', file: 'goals.json' },
      { collection: 'learnings', file: 'learnings.json' },
    ]

    for (const { collection, file } of docFiles) {
      const data = readJson(resolve(CLIENTS_DIR, slug, file))
      if (data) {
        await upsert(collection, slug, { slug, data })
      } else {
        console.log(`  ⊘ ${collection}/${slug} — file not found, skipped`)
      }
    }
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

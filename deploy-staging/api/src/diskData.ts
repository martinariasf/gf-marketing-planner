// Read Viktor-owned static JSON from the bind-mounted /data tree.
//
// Phase 2 keeps Viktor-owned data (posts, suggestions, performance,
// approvals.log, assets) as files on disk — the agent still writes them by
// editing JSON. The API surfaces them read-only so the dashboard can stop
// hitting /data/<slug>/* directly. Phase 3+ migrates writes into PB.
//
// Layout under DATA_ROOT (default /data, configurable via DATA_ROOT env):
//   clients/<slug>/brief.json | plan.json | goals.json | learnings.json
//   clients/<slug>/posts/index.json + posts/p001.json...
//   clients/<slug>/suggestions.json
//   clients/<slug>/performance.json
//   clients/<slug>/approvals.log    (text — one line per decision)
//   clients/<slug>/assets/manifest.json
//   index.json                       (slug catalog)

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.env.DATA_ROOT ?? '/data'

async function readJson<T>(...path: string[]): Promise<T | null> {
  try {
    const raw = await readFile(join(ROOT, ...path), 'utf8')
    return JSON.parse(raw) as T
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return null
    throw err
  }
}

async function readText(...path: string[]): Promise<string | null> {
  try {
    return await readFile(join(ROOT, ...path), 'utf8')
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return null
    throw err
  }
}

export const disk = {
  brief: (slug: string) => readJson<unknown>('clients', slug, 'brief.json'),
  plan: (slug: string) => readJson<unknown>('clients', slug, 'plan.json'),
  goals: (slug: string) => readJson<unknown>('clients', slug, 'goals.json'),
  learnings: (slug: string) => readJson<unknown>('clients', slug, 'learnings.json'),
  suggestions: (slug: string) => readJson<unknown>('clients', slug, 'suggestions.json'),
  performance: (slug: string) => readJson<unknown>('clients', slug, 'performance.json'),
  assetsManifest: (slug: string) =>
    readJson<unknown>('clients', slug, 'assets', 'manifest.json'),
  postsIndex: (slug: string) =>
    readJson<{ posts: string[] }>('clients', slug, 'posts', 'index.json'),
  post: (slug: string, id: string) => readJson<unknown>('clients', slug, 'posts', `${id}.json`),
  approvalsLog: (slug: string) => readText('clients', slug, 'approvals.log'),
  clientIndex: () => readJson<{ clients: unknown[] }>('index.json'),
  listPostFiles: async (slug: string): Promise<string[]> => {
    try {
      const files = await readdir(join(ROOT, 'clients', slug, 'posts'))
      return files.filter((f) => f.startsWith('p') && f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
    } catch {
      return []
    }
  },
}

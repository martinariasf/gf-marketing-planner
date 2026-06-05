// Phase 7 — in-memory token-bucket rate limiter.
//
// Keyed by either bearer token (preferred) or client IP. Two tiers:
//
//   - default: 120 requests / minute / key  (covers GET-heavy dashboard polling)
//   - chat:     10 requests / minute / key  (each /chat/stream burns OpenRouter
//                                            tokens — we want a hard ceiling)
//
// In-memory is fine for a single-instance staging api. If we ever horizontally
// scale, swap to PB or Redis.

import type { Context, MiddlewareHandler } from 'hono'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

interface Limits {
  windowMs: number
  max: number
}

function keyFor(c: Context, prefix: string): string {
  const auth = c.req.header('Authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/)
  const token = m?.[1]?.trim()
  if (token) return `${prefix}:tok:${token.slice(0, 32)}`
  const ip =
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    c.req.header('X-Real-IP') ??
    'unknown'
  return `${prefix}:ip:${ip}`
}

function check(key: string, limits: Limits): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + limits.windowMs }
    buckets.set(key, fresh)
    return { ok: true, remaining: limits.max - 1, resetAt: fresh.resetAt }
  }
  b.count += 1
  if (b.count > limits.max) {
    return { ok: false, remaining: 0, resetAt: b.resetAt }
  }
  return { ok: true, remaining: limits.max - b.count, resetAt: b.resetAt }
}

function applyHeaders(c: Context, limits: Limits, state: ReturnType<typeof check>) {
  c.header('X-RateLimit-Limit', String(limits.max))
  c.header('X-RateLimit-Remaining', String(Math.max(0, state.remaining)))
  c.header('X-RateLimit-Reset', String(Math.floor(state.resetAt / 1000)))
}

export const rateLimit = (
  limits: Limits = { windowMs: 60_000, max: 120 },
  prefix = 'def',
): MiddlewareHandler => {
  return async (c, next) => {
    const key = keyFor(c, prefix)
    const state = check(key, limits)
    applyHeaders(c, limits, state)
    if (!state.ok) {
      return c.json(
        {
          type: 'about:blank',
          title: 'Too Many Requests',
          status: 429,
          detail: `Rate limit ${limits.max}/${limits.windowMs / 1000}s exceeded`,
        },
        429,
      )
    }
    await next()
  }
}

// Periodic GC so the map doesn't grow forever on long uptimes.
setInterval(() => {
  const now = Date.now()
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k)
}, 60_000).unref()

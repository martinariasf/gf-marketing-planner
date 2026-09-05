// GF-104 TASK-001 — OpenRouter usage client and model-to-category map.
//
// Reduces three OpenRouter reads (key spend, guardrail allowance, per-model
// activity) into a client-safe shape: `{ percentUsed, categories, hasLimit }`,
// every value a fraction 0..1. This is a hard contract, not a UI choice — no
// raw USD amount (`usage_monthly`, `limit_usd`, per-row `usage`) may ever
// leave this module, because if the numbers never leave the server, a future
// UI change cannot leak GF's cost base. See usage.test.ts for the assertion
// that enforces this on the returned JSON.
//
// IMPORTANT — this module deliberately mixes two different time windows, and
// that is intentional, not a bug to "fix" back:
//   - `percentUsed` is spend THIS CALENDAR MONTH against the monthly
//     guardrail (key.usage_monthly / guardrail.limit_usd).
//   - `categories` is the pure share-of-activity split over the LAST 30 DAYS
//     (the full window the /activity endpoint returns), and always sums to 1
//     when there is any activity in that window (0s when there is none).
// TASK-001 originally scaled `categories` by `percentUsed` so the pie and bar
// agreed, on the assumption both covered the same calendar month. Real data
// showed that filtering categories to the calendar month makes the split
// useless early in a month (e.g. day 5: one model has rows this month, so the
// chart shows ~100%/0%/0%/0% even though the client used every category
// heavily in the prior 30 days). Martin's call after seeing this: widen
// categories to a rolling 30-day window and stop scaling them by
// percentUsed — scaling a 30-day share by a calendar-month fraction produces
// a number that means nothing. The "unused" portion of the allowance is now
// conveyed only by the bar (1 - percentUsed); `categories` no longer implies
// any unused remainder.
//
// The reduction is split from the network calls so tests run against recorded
// fixtures with zero network access:
//   - `fetchOpenRouterKey/Guardrail/Activity` do the HTTP calls against the
//     real base URL (https://openrouter.ai/api/v1, Bearer management key).
//   - `computeUsage` is pure — given already-parsed key/guardrail/activity
//     data (and an injectable `now`), it returns the client-safe shape. This
//     is what usage.test.ts exercises directly against the fixtures.
//   - `getClientUsage` wires the two together; this is what route handlers
//     (TASK-002) should call.

import { env } from './env.js'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

export type UsageCategory = 'writing' | 'image' | 'video' | 'audio'

export interface ClientUsage {
  percentUsed: number
  categories: Record<UsageCategory, number>
  hasLimit: boolean
  percentUsedDaily: number
  hasDailyLimit: boolean
}

export interface OpenRouterKeyData {
  usage_monthly: number
  // GF-104 daily-usage extension — every client key already carries a daily
  // cap (unlike the monthly figure, which needs a separately-configured
  // guardrail), so these ride along on the same key read. Optional so every
  // pre-existing test fixture/object literal that only sets `usage_monthly`
  // keeps compiling; a key genuinely missing `limit_reset: 'daily'` just
  // means `hasDailyLimit` comes out false, same as no guardrail today.
  usage_daily?: number
  limit?: number
  limit_reset?: string | null
}

export interface OpenRouterGuardrailData {
  limit_usd: number
  reset_interval: string
}

export interface OpenRouterActivityRow {
  date: string
  model: string
  usage: number
}

const CATEGORIES: UsageCategory[] = ['writing', 'image', 'video', 'audio']

// Substring table, checked in order, first match wins. Deliberately kept to
// substrings of the model id (not the full id) so a version bump — kimi-k3.1,
// claude-opus-5, seedance-2.1, a future gemini flash-image release — keeps
// mapping correctly without a code change. Covers the four models seen live
// against the OpenRouter account on 2026-09-04.
const CATEGORY_RULES: Array<{ match: string; category: UsageCategory }> = [
  { match: 'kimi-k3', category: 'writing' },
  { match: 'claude-opus', category: 'writing' },
  { match: 'flash-image', category: 'image' },
  { match: 'seedance', category: 'video' },
]

// Models we've already warned about once this process, so a busy month of the
// same unmapped model doesn't spam the log — but the FIRST sighting of a given
// model id always logs, so a genuinely new model is visible in logs instead of
// silently melting into "writing".
const warnedUnmappedModels = new Set<string>()

// Same warn-once-per-process Set pattern as `warnedUnmappedModels` above,
// applied to activity rows whose date string doesn't parse at all — a
// separate Set because dates and model ids are different key spaces, but
// the identical dedupe mechanism (no second logging approach introduced).
const warnedUnparseableDates = new Set<string>()

// Same warn-once-per-process Set pattern again, this time for a client whose
// key claims limit_reset=daily but carries a non-numeric usage_daily/limit.
// Layer-5 review (round 2) finding 4 — degrading only the daily bar (instead
// of throwing, which the route turns into losing the whole card) means the
// same malformed key would otherwise log on every single request if it
// weren't deduped. Keyed by the offending values themselves (stringified),
// same as `warnedUnparseableDates` is keyed by the offending date string.
const warnedNonNumericDaily = new Set<string>()

function categoryFor(model: string): UsageCategory {
  for (const rule of CATEGORY_RULES) {
    if (model.includes(rule.match)) return rule.category
  }
  if (!warnedUnmappedModels.has(model)) {
    warnedUnmappedModels.add(model)
    console.warn(`[usage] unmapped OpenRouter model "${model}" — counted as writing`)
  }
  return 'writing'
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

// Activity rows use "YYYY-MM-DD HH:MM:SS" (space, not "T") in UTC, matching
// what OpenRouter returns. Replacing the space with "T" and appending "Z"
// makes it a valid ISO-8601 UTC string Date can parse unambiguously — the
// same UTC interpretation the old calendar-month check got for free from
// `now.toISOString()`. A date-only row ("YYYY-MM-DD", no time component)
// gets a midnight-UTC time appended instead, rather than falling through to
// the space-replace path (which is a no-op on a string with no space,
// leaving `Z` appended directly and still valid, but explicit is clearer
// than relying on that coincidence). Anything else that still fails to
// parse is logged once per process — same warn-once Set pattern as unmapped
// models — and the row is excluded rather than silently corrupting the sum
// with a NaN.
function isWithinLast30Days(dateStr: string, now: Date): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T00:00:00Z` : `${dateStr.replace(' ', 'T')}Z`
  const rowTime = new Date(iso).getTime()
  if (Number.isNaN(rowTime)) {
    if (!warnedUnparseableDates.has(dateStr)) {
      warnedUnparseableDates.add(dateStr)
      console.warn(`[usage] unparseable activity date "${dateStr}" — row excluded`)
    }
    return false
  }
  return rowTime <= now.getTime() && rowTime > now.getTime() - THIRTY_DAYS_MS
}

/**
 * Pure reduction: given already-fetched OpenRouter data, produce the
 * client-safe usage shape. No I/O and no implicit `Date.now()` unless `now`
 * is omitted, so tests can pin a `now` and run entirely against fixtures.
 */
export function computeUsage(
  key: OpenRouterKeyData,
  guardrail: OpenRouterGuardrailData,
  activity: OpenRouterActivityRow[],
  now: Date = new Date(),
): ClientUsage {
  // Point 2 of the plan: a non-monthly guardrail (daily/weekly) cannot be
  // turned into a percentage of THIS month without producing a wrong number,
  // so it's reported as "no limit" rather than computed.
  const hasLimit = guardrail.reset_interval === 'monthly'

  // Sum the last 30 days' activity per category. The raw USD subtotal only
  // exists long enough to compute a *share* — it is never returned.
  const totalsByCategory: Record<UsageCategory, number> = { writing: 0, image: 0, video: 0, audio: 0 }
  let totalUsage = 0
  for (const row of activity) {
    if (!isWithinLast30Days(row.date, now)) continue
    const cat = categoryFor(row.model)
    // A refund/credit row can carry a negative `usage`, which would produce
    // a negative category share and pollute the denominator. Clamp at 0 —
    // a refund reduces spend, not this client's activity mix.
    const amount = Math.max(0, row.usage)
    totalsByCategory[cat] += amount
    totalUsage += amount
  }

  // Pure shares of the 30-day window — sum to 1 when there's any activity,
  // all 0 when there's none (guarded against dividing by zero). No scaling by
  // percentUsed: that would mix a 30-day figure with a calendar-month one.
  const categories = { ...totalsByCategory }
  if (totalUsage > 0) {
    for (const cat of CATEGORIES) categories[cat] = categories[cat] / totalUsage
  }

  if (!hasLimit) {
    // No monthly guardrail to measure against, so percentUsed stays 0 rather
    // than being computed from a mismatched denominator. The daily figure is
    // independent of the monthly guardrail (it comes off the key itself), so
    // it's still computed here rather than also zeroed out.
    const { percentUsedDaily, hasDailyLimit } = computeDailyUsage(key)
    return { percentUsed: 0, categories, hasLimit: false, percentUsedDaily, hasDailyLimit }
  }

  // Layer-5 review finding 4 — OpenRouter returning a string or null for
  // either field would otherwise turn percentUsed into NaN, which
  // JSON-serializes as null and renders client-side as a silent 0% bar
  // with hasLimit still true. Throwing here routes it through the route
  // handler's existing catch into the honest "unavailable" state instead.
  if (!Number.isFinite(key.usage_monthly) || !Number.isFinite(guardrail.limit_usd)) {
    throw new Error('OpenRouter returned a non-numeric usage_monthly or limit_usd')
  }

  const percentUsed =
    guardrail.limit_usd > 0 ? Math.min(1, Math.max(0, key.usage_monthly / guardrail.limit_usd)) : 0

  const { percentUsedDaily, hasDailyLimit } = computeDailyUsage(key)

  return { percentUsed, categories, hasLimit: true, percentUsedDaily, hasDailyLimit }
}

// GF-104 daily-usage extension. Mirrors the monthly flow above: first decide
// whether the reset interval even matches (no finiteness check yet — that
// mirrors `hasLimit` above, which is interval-only), then, only in the case
// where we're actually about to compute something, apply the same
// Number.isFinite guard the monthly path uses. Every client key already
// carries its own daily cap, so this needs no guardrail lookup — that's what
// makes it work even for a client with no guardrail configured at all.
//
// Layer-5 review (round 2) finding 4 — unlike the monthly path (which stays a
// hard throw: that's the core contract, and the route's catch losing the
// whole card on a monthly failure is intentional), a malformed DAILY field
// must NOT take down the monthly bar and pie with it. So this degrades in
// place — hasDailyLimit: false, percentUsedDaily: 0 — and logs once per
// process via the same warn-once Set pattern used above, instead of
// throwing.
function computeDailyUsage(key: OpenRouterKeyData): { percentUsedDaily: number; hasDailyLimit: boolean } {
  if (key.limit_reset !== 'daily') {
    return { percentUsedDaily: 0, hasDailyLimit: false }
  }

  if (!Number.isFinite(key.usage_daily) || !Number.isFinite(key.limit)) {
    const warnKey = `${String(key.usage_daily)}|${String(key.limit)}`
    if (!warnedNonNumericDaily.has(warnKey)) {
      warnedNonNumericDaily.add(warnKey)
      console.warn(
        `[usage] non-numeric usage_daily or limit with limit_reset=daily (usage_daily=${String(key.usage_daily)}, limit=${String(key.limit)}) — daily bar degraded to no-limit`,
      )
    }
    return { percentUsedDaily: 0, hasDailyLimit: false }
  }

  const hasDailyLimit = (key.limit as number) > 0
  const percentUsedDaily = hasDailyLimit
    ? Math.min(1, Math.max(0, (key.usage_daily as number) / (key.limit as number)))
    : 0

  return { percentUsedDaily, hasDailyLimit }
}

async function orGet<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${OPENROUTER_BASE}${path}`, {
      headers: { Authorization: `Bearer ${env.openrouterMgmtKey}` },
      // Layer-5 review finding 3 — without a timeout a hung connection hangs
      // the request indefinitely; the 5-minute cache only helps after a
      // success has already happened once. AbortSignal.timeout rejects the
      // fetch, which the catch below turns into a thrown Error same as any
      // other network failure, so the route's existing catch still routes
      // it to { configured: true, unavailable: true }.
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    throw new Error(`Could not reach OpenRouter (${path}).`, { cause: err })
  }
  if (!res.ok) {
    throw new Error(`OpenRouter ${path} returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

/** Wires the three OpenRouter reads to `computeUsage`. This is what route
 *  handlers (TASK-002) should call — never `computeUsage` directly, since
 *  that has no way to reach the network. */
export async function getClientUsage(keyHash: string, guardrailId: string): Promise<ClientUsage> {
  const [keyRes, guardrailRes, activityRes] = await Promise.all([
    orGet<{ data: OpenRouterKeyData }>(`/keys/${encodeURIComponent(keyHash)}`),
    orGet<{ data: OpenRouterGuardrailData }>(`/guardrails/${encodeURIComponent(guardrailId)}`),
    orGet<{ data: OpenRouterActivityRow[] }>(`/activity?api_key_hash=${encodeURIComponent(keyHash)}`),
  ])
  return computeUsage(keyRes.data, guardrailRes.data, activityRes.data)
}

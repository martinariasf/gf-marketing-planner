// GF-113 / TASK-011 — where a goal's "actual" number comes from.
//
// WHAT THIS REPLACED: `performance.vsGoals[g.id]`, a block of pre-computed
// progress objects that lived in the hand-authored `performance.json`. Somebody
// typed those numbers. The Goals tab then rendered them as measured progress,
// complete with an "ahead / on-track / behind" pace badge.
//
// It was also broken in a way nobody noticed: `performance.tsx` indexed `vsGoals`
// with a METRIC key ("reach") while the object is keyed by GOAL id
// ("g_workshop_signups"), so every KPI card's target and pace silently resolved
// to `undefined`. The new path does not repeat that join.
//
// THE RULE HERE: a goal gets a real number only when we can point at the metric
// that produced it. Everything else returns `null`, which the UI renders as
// "not measured yet" — NOT as 0. A zero on a progress bar is a claim that the
// client achieved nothing, which is a very different statement from "we cannot
// see this".

import type { ClientAnalytics } from '@/types'

/**
 * The window every Postiz metric we hold is measured over. Must match
 * `WINDOW_DAYS` in the API's analyticsSync.ts.
 *
 * THIS IS WHY GOAL PROGRESS BARS ARE NOT DRAWN FROM THESE NUMBERS. Goals are
 * quarterly; our measurements cover 30 days. A client exactly on track for the
 * quarter would fill a progress bar to about a third, which reads as "badly
 * behind" — a real number presented so as to mislead, which is no better than a
 * fabricated one. The card shows the measured value WITH its window, and no bar.
 */
export const ANALYTICS_WINDOW_DAYS = 30

/**
 * The mapping is a HAND-WRITTEN TABLE on purpose.
 *
 * The obvious alternative — matching a goal's label against a metric name — is
 * what produces silent nonsense: a goal called "Reach more founders" would start
 * reporting Instagram Reach as its progress, and nobody would ever check. An
 * explicit table is reviewable: you can read it and say "yes, that goal really is
 * that metric", and an unmapped goal fails visibly rather than wrongly.
 *
 * Keyed by the goal's `kpiRef` (or its `id` as a fallback), valued with the
 * PROVIDER'S OWN metric label as it arrives from the API.
 */
export const GOAL_METRIC_MAP: Record<string, string> = {
  g_reach: 'Reach',
  g_impressions: 'Impressions',
  g_followers: 'Followers',
  g_views: 'Views',
}

/**
 * The measured actual for one goal, or `null` when we cannot measure it.
 *
 * Summed ACROSS channels: a "reach" goal is an account-level target, and the
 * client does not think of it as per-platform. Only `ok`/`stale` payloads are
 * used — an errored sync must not be read as "zero progress".
 */
export function actualForGoal(
  goal: { id: string; kpiRef?: string },
  analytics: ClientAnalytics,
): number | null {
  if (analytics.status !== 'ok' && analytics.status !== 'stale') return null

  const label = GOAL_METRIC_MAP[goal.kpiRef ?? ''] ?? GOAL_METRIC_MAP[goal.id]
  if (!label) return null

  let total = 0
  let found = false
  for (const ch of analytics.channels) {
    for (const s of ch.series) {
      if (s.label !== label || s.points.length === 0) continue
      found = true
      // A snapshot is already a window total; a series has to be summed.
      total += s.kind === 'snapshot' ? s.points[0]!.total : s.points.reduce((a, p) => a + p.total, 0)
    }
  }
  // Mapped but absent from every channel means the platform did not report it —
  // still unknown, still not zero.
  return found ? total : null
}

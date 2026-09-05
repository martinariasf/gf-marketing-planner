// GF-104 TASK-004 — usage card at the top of the Configuration page.
//
// Reads GET /clients/:slug/usage (see api-client.ts's apiLoadClientUsage /
// deploy-staging/api/src/usage.ts for the contract) and renders it as:
//   - a horizontal bar for `percentUsedDaily` (share of TODAY's key-level
//     daily cap used),
//   - a horizontal bar for `percentUsed` (share of THIS CALENDAR MONTH's
//     guardrail allowance used), and
//   - a recharts pie for `categories` (share of the LAST 30 DAYS of activity).
//
// These are DELIBERATELY three different time windows — see usage.ts's own
// comment for why the month/30-day split exists — so the labels below must
// never claim the same period, and the pie must never render an "unused"
// slice: the API's `categories` already sums to 1 across only the non-zero
// categories that saw activity, with no "free" remainder baked in. The
// unused portion of an allowance is conveyed by its own bar alone.
//
// Hard product rule, not a UI preference: no EUR/USD figure, and no model or
// provider name (no "kimi-k3", no "seedance"), may ever render here — the
// server contract already strips raw usage amounts, and this component must
// not reintroduce them via labels.
//
// Extracted into its own file rather than inlined into configuration.tsx
// (which was a focused 134-line page before this) per the GF-104 plan.

import { useEffect, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts'
import { Gauge } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { BRAND } from '@/lib/brand'
import { apiLoadClientUsage, type ClientUsageResponse, type UsageCategory } from '@/lib/api-client'
import { useT } from '@/lib/i18n'

const CATEGORY_ORDER: UsageCategory[] = ['writing', 'image', 'video', 'audio']

// Distinct BRAND swatches, never a hardcoded hex — matches the "colours come
// from BRAND" rule the plan calls out (as calendar.tsx's ContentMixChart and
// performance.tsx's SeriesChart both already do).
const CATEGORY_COLOR: Record<UsageCategory, string> = {
  writing: BRAND.blue,
  image: BRAND.green,
  video: BRAND.blueLight,
  audio: BRAND.greenDark,
}

export default function UsageCard({ slug }: { slug: string }) {
  const t = useT()
  const [usage, setUsage] = useState<ClientUsageResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    apiLoadClientUsage(slug)
      .then((r) => {
        if (!cancelled) setUsage(r)
      })
      .catch(() => {
        // A network hiccup or an auth edge case reaching THIS call must not
        // break the Configuration page — fold it into the same "unavailable"
        // state the server itself uses for an OpenRouter outage.
        if (!cancelled) setUsage({ configured: true, unavailable: true })
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  // Nothing fetched yet, or the client has no OpenRouter key/guardrail
  // linked: no card, no empty frame — the whole point of `configured: false`
  // is that this section doesn't exist for that client.
  if (!usage || usage.configured === false) return null

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand-blue shrink-0" />
          <h2 className="text-sm font-semibold text-brand-blue">{t('usage.heading')}</h2>
        </div>

        {usage.unavailable ? (
          <p className="text-sm text-ink-muted">{t('usage.unavailable')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="space-y-4">
              {usage.hasDailyLimit || usage.hasLimit ? (
                <div className="space-y-3">
                  {usage.hasDailyLimit && (
                    <UsageBar
                      label={t('usage.bar.daily.label')}
                      percent={usage.percentUsedDaily}
                    />
                  )}
                  {usage.hasLimit && <UsageBar label={t('usage.bar.label')} percent={usage.percentUsed} />}
                </div>
              ) : (
                <p className="text-xs text-ink-muted">{t('usage.noLimit')}</p>
              )}
            </div>

            <UsagePie categories={usage.categories} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// Shared bar shell for both the daily and monthly figures — same markup,
// different label/value, so the two windows can never visually drift apart.
function UsageBar({ label, percent }: { label: string; percent: number }) {
  const pct = Math.min(100, Math.max(0, percent * 100))
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className="text-sm font-medium text-ink tabular-nums">{Math.round(pct)}%</p>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full rounded-full bg-paper-muted overflow-hidden"
      >
        <div className="h-full rounded-full bg-brand-blue transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function UsagePie({ categories }: { categories: Record<UsageCategory, number> }) {
  const t = useT()
  const labelFor = (c: UsageCategory) => t(`usage.category.${c}`)

  // Zero-usage categories render neither a slice nor a legend entry — e.g.
  // "audio" stays invisible until a text-to-speech model is actually used.
  const slices = CATEGORY_ORDER.map((c) => ({
    name: labelFor(c),
    value: categories[c] ?? 0,
    color: CATEGORY_COLOR[c],
  })).filter((d) => d.value > 0)

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-ink-muted">{t('usage.pie.label')}</p>
      {slices.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('usage.pie.empty')}</p>
      ) : (
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                innerRadius={40}
                outerRadius={72}
                paddingAngle={2}
              >
                {slices.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <RechartsTooltip formatter={(v) => `${Math.round(Number(v) * 100)}%`} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

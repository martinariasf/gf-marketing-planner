import { useOutletContext } from 'react-router'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { KpiCard } from '@/components/kpi-card'
import { fmtCompact, fmtDate } from '@/lib/format'
import { BRAND, PACE_COLORS } from '@/lib/brand'
import { Clock } from 'lucide-react'
import type { ClientBundle } from '@/lib/client-data'

interface ChartTooltipPayload {
  dataKey: string
  value: number
  color: string
}
interface MonthlyTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayload[]
  label?: string
}
function MonthlyTooltip({ active, payload, label }: MonthlyTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border-subtle bg-paper px-3 py-2 shadow-md text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {fmtCompact(p.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

export default function GoalsView() {
  const { goals, performance } = useOutletContext<ClientBundle>()

  const monthlyReachData = goals.monthly.map((m) => {
    const reachGoal = m.goals.find((g) => g.ref === 'g_reach')
    const reachActual = performance?.aggregates.monthly[m.month]?.reach ?? 0
    return {
      month: m.month,
      target: reachGoal?.target ?? 0,
      actual: reachActual,
    }
  })

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            Goals vs Actuals
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">
            How are we tracking?
          </h1>
        </div>
        {performance?.lastSyncedAt && (
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Clock className="h-3.5 w-3.5" />
            Last sync: {fmtDate(performance.lastSyncedAt)}
            <span className="ml-1 text-ink-muted/70">({performance.source})</span>
          </div>
        )}
      </div>

      {!performance && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-4 text-sm text-amber-700">
            No <code>performance.json</code> yet. Viktor populates this after the
            first Postiz sync. Targets shown below; actuals will appear once data
            arrives.
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Quarterly KPIs</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.quarterly.map((g) => {
            const progress = performance?.vsGoals[g.id]
            return (
              <KpiCard
                key={g.id}
                label={g.label}
                current={progress?.current ?? 0}
                target={g.target}
                unit={g.unit}
                pace={progress?.pace}
                deltaPct={progress?.deltaPct}
                compact={g.target > 1000}
              />
            )
          })}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Monthly reach: target vs actual</h2>
        <Card>
          <CardContent className="p-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyReachData} barGap={4}>
                  <XAxis
                    dataKey="month"
                    stroke={BRAND.inkMuted}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={BRAND.inkMuted}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => fmtCompact(v)}
                  />
                  <Tooltip content={<MonthlyTooltip />} cursor={{ fill: BRAND.paperMuted }} />
                  <Bar dataKey="target" radius={[6, 6, 0, 0]} fill={BRAND.blue + '40'} />
                  <Bar dataKey="actual" radius={[6, 6, 0, 0]}>
                    {monthlyReachData.map((entry) => {
                      const pct = entry.target === 0 ? 0 : entry.actual / entry.target
                      const color =
                        entry.actual === 0
                          ? '#d4d4d8'
                          : pct >= 1
                            ? PACE_COLORS.ahead
                            : pct >= 0.9
                              ? PACE_COLORS['on-track']
                              : PACE_COLORS.behind
                      return <Cell key={entry.month} fill={color} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BRAND.blue + '40' }} />
                Target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PACE_COLORS.ahead }} />
                On / ahead of pace
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PACE_COLORS.behind }} />
                Behind
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Weekly focus</h2>
        <p className="text-sm text-ink-muted">
          One rotating priority each week. Viktor reads this when planning the
          next batch of content.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {goals.weekly.map((w) => (
            <Card key={w.week}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  Week {w.week}
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-normal">
                    {w.kpi}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{w.focus}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {performance?.weeklySummary && (
        <>
          <Separator />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">
              Week {performance.weeklySummary.week} summary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-brand-green-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-brand-green-600">Wins</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-2">
                    {performance.weeklySummary.wins.map((x, i) => (
                      <li key={i}>&middot; {x}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-rose-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-rose-700">Losses</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-2">
                    {performance.weeklySummary.losses.map((x, i) => (
                      <li key={i}>&middot; {x}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-brand-blue-200/60 bg-brand-blue-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-brand-blue">Next test</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{performance.weeklySummary.nextTest}</p>
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

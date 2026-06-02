import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion } from 'framer-motion'
import {
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Area,
  AreaChart,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pillar } from '@/components/pillar'
import { Trophy, Clock, Bookmark, Eye, MessageSquare, Heart, Share2, MousePointer, Mail } from 'lucide-react'
import { fmtCompact, fmtDate } from '@/lib/format'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'
import type { Post, PostMetrics } from '@/types'

type MetricKey = keyof PostMetrics

const METRIC_META: Record<MetricKey, { labelKey: string; Icon: typeof Eye }> = {
  reach:         { labelKey: 'performance.colReach',   Icon: Eye },
  impressions:   { labelKey: 'performance.colReach',   Icon: Eye },
  saves:         { labelKey: 'performance.colSaves',   Icon: Bookmark },
  shares:        { labelKey: 'performance.colShares',  Icon: Share2 },
  comments:      { labelKey: 'performance.colComments',Icon: MessageSquare },
  likes:         { labelKey: 'performance.colReach',   Icon: Heart },
  profileVisits: { labelKey: 'performance.colProfile', Icon: Eye },
  clicks:        { labelKey: 'performance.colClicks',  Icon: MousePointer },
  dms:           { labelKey: 'performance.colDms',     Icon: Mail },
}

const TOP_METRIC_PRESETS: Array<{ key: MetricKey; labelKey: string; subtitleKey: string }> = [
  { key: 'saves', labelKey: 'performance.bestEducational', subtitleKey: 'performance.topSaves' },
  { key: 'dms',   labelKey: 'performance.bestIntent',      subtitleKey: 'performance.qualifiedDms' },
  { key: 'reach', labelKey: 'performance.furthestDist',    subtitleKey: 'performance.topReach' },
]

interface ChartTooltipPayload {
  dataKey: string
  value: number
  color: string
}
interface ChartTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayload[]
  label?: string | number
}

function ReachTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border-subtle bg-paper px-3 py-2 shadow-md text-xs">
      <p className="font-semibold mb-1">W{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {fmtCompact(p.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

export default function PerformanceView() {
  const t = useT()
  const { performance, posts, plan } = useOutletContext<ClientBundle>()
  const [sortBy, setSortBy] = useState<MetricKey>('reach')

  const pillarColor = useMemo(() => {
    const m: Record<string, string> = {}
    plan.pillars.forEach((p) => (m[p.name] = p.color))
    return m
  }, [plan.pillars])

  const postById = useMemo(() => {
    const m: Record<string, Post> = {}
    posts.forEach((p) => (m[p.id] = p))
    return m
  }, [posts])

  if (!performance) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-ink-muted">
          <Eye className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {t('performance.empty')}
          </p>
        </CardContent>
      </Card>
    )
  }

  const measuredPostIds = Object.keys(performance.posts)
  const measuredPosts = measuredPostIds
    .map((id) => ({ post: postById[id], metrics: performance.posts[id] }))
    .filter((x): x is { post: Post; metrics: PostMetrics } => !!x.post)

  const sorted = [...measuredPosts].sort(
    (a, b) => b.metrics[sortBy] - a.metrics[sortBy],
  )

  const weeklyData = Object.entries(performance.aggregates.weekly)
    .map(([w, v]) => ({ week: Number(w), reach: v.reach, topPost: v.topPost }))
    .sort((a, b) => a.week - b.week)

  const totals = measuredPosts.reduce(
    (acc, { metrics }) => {
      for (const k of Object.keys(METRIC_META) as MetricKey[]) {
        acc[k] = (acc[k] ?? 0) + metrics[k]
      }
      return acc
    },
    {} as Record<MetricKey, number>,
  )

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            {t('performance.eyebrow')}
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">
            {t('performance.heading')}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-muted">
          <Clock className="h-3.5 w-3.5" />
          {fmtDate(performance.lastSyncedAt)} &middot; {t('performance.from')} {performance.source}
        </div>
      </div>

      {/* Top performers */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('performance.topPerformers')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TOP_METRIC_PRESETS.map(({ key, labelKey, subtitleKey }) => {
            const label = t(labelKey)
            const subtitle = t(subtitleKey)
            const top = [...measuredPosts].sort(
              (a, b) => b.metrics[key] - a.metrics[key],
            )[0]
            if (!top) return null
            const Icon = METRIC_META[key].Icon
            return (
              <Card key={key} className="overflow-hidden">
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                        {subtitle}
                      </p>
                      <p className="text-sm font-semibold">{label}</p>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-brand-blue text-white flex items-center justify-center">
                      <Trophy className="h-4 w-4" />
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center gap-3">
                    {top.post.image && (
                      <img
                        src={top.post.image}
                        alt=""
                        loading="lazy"
                        className="h-12 w-12 rounded object-cover shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" title={top.post.title}>
                        {top.post.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {top.post.id}
                        </Badge>
                        <span className="text-[11px] text-ink-muted">
                          {top.post.channel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <Icon className="h-4 w-4 text-brand-blue" />
                    <span className="text-2xl font-bold text-brand-blue">
                      {fmtCompact(top.metrics[key])}
                    </span>
                    <span className="text-xs text-ink-muted">
                      {t(METRIC_META[key].labelKey).toLowerCase()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <Separator />

      {/* Weekly reach trend */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('performance.weeklyReach')}</h2>
        <Card>
          <CardContent className="p-5">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyData}>
                  <defs>
                    <linearGradient id="reachGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={BRAND.blue} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={BRAND.blue} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={BRAND.borderSubtle} vertical={false} />
                  <XAxis
                    dataKey="week"
                    stroke={BRAND.inkMuted}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => `W${v}`}
                  />
                  <YAxis
                    stroke={BRAND.inkMuted}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => fmtCompact(v)}
                  />
                  <Tooltip content={<ReachTooltip />} cursor={{ stroke: BRAND.inkMuted }} />
                  <Area
                    type="monotone"
                    dataKey="reach"
                    stroke={BRAND.blue}
                    strokeWidth={2}
                    fill="url(#reachGradient)"
                  />
                  <Line
                    type="monotone"
                    dataKey="reach"
                    stroke={BRAND.blue}
                    strokeWidth={2}
                    dot={{ r: 4, fill: BRAND.blue }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-ink-muted mt-2">
              {t('performance.totalReach')} <span className="font-semibold text-ink">{fmtCompact(performance.aggregates.quarterly.reach)}</span> &middot;
              {' '}{t('performance.followerDelta')} <span className="font-semibold text-ink">+{performance.aggregates.quarterly.followerDelta}%</span>
            </p>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Per-post metrics table */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">{t('performance.perPostMetrics')}</h2>
            <p className="text-sm text-ink-muted">
              {t('performance.perPostHint')}
            </p>
          </div>
          <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as MetricKey)}>
            <TabsList>
              <TabsTrigger value="reach">{t('performance.colReach')}</TabsTrigger>
              <TabsTrigger value="saves">{t('performance.colSaves')}</TabsTrigger>
              <TabsTrigger value="dms">{t('performance.colDms')}</TabsTrigger>
              <TabsTrigger value="clicks">{t('performance.colClicks')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper-muted text-[10px] uppercase tracking-wider text-ink-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">{t('performance.colPost')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('performance.colReach')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('performance.colSaves')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('performance.colShares')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('performance.colComments')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('performance.colProfile')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('performance.colClicks')}</th>
                    <th className="px-3 py-3 text-right font-medium">{t('performance.colDms')}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ post, metrics }, i) => (
                    <motion.tr
                      key={post.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.18, delay: i * 0.02 }}
                      className="border-t border-border-subtle hover:bg-paper-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {post.image && (
                            <img
                              src={post.image}
                              alt=""
                              loading="lazy"
                              className="h-9 w-9 rounded object-cover shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[260px]" title={post.title}>
                              {post.title}
                            </p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant="outline" className="font-mono text-[10px]">
                                {post.id}
                              </Badge>
                              <Pillar
                                name={post.pillar}
                                color={pillarColor[post.pillar]}
                                className="!text-[10px]"
                              />
                              <span className="text-[10px] text-ink-muted">
                                {post.channel}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <MetricCell value={metrics.reach}         highlight={sortBy === 'reach'} />
                      <MetricCell value={metrics.saves}         highlight={sortBy === 'saves'} />
                      <MetricCell value={metrics.shares} />
                      <MetricCell value={metrics.comments} />
                      <MetricCell value={metrics.profileVisits} />
                      <MetricCell value={metrics.clicks}        highlight={sortBy === 'clicks'} />
                      <MetricCell value={metrics.dms}           highlight={sortBy === 'dms'} />
                    </motion.tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border-subtle bg-paper-muted/30 text-[11px] uppercase tracking-wider text-ink-muted">
                  <tr>
                    <td className="px-4 py-2 font-semibold">{t('performance.total', { n: sorted.length })}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCompact(totals.reach)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCompact(totals.saves)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCompact(totals.shares)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCompact(totals.comments)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCompact(totals.profileVisits)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCompact(totals.clicks)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtCompact(totals.dms)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

    </div>
  )
}

function MetricCell({ value, highlight = false }: { value: number; highlight?: boolean }) {
  return (
    <td
      className={cn(
        'px-3 py-3 text-right font-mono',
        highlight ? 'text-brand-blue font-bold' : 'text-ink',
      )}
    >
      {fmtCompact(value)}
    </td>
  )
}


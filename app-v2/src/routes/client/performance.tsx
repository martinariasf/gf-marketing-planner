import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useOutletContext } from 'react-router'
import { postSeqMap } from '@/lib/post-status'
import { motion } from 'framer-motion'
import {
  Line,
  LineChart,
  Legend,
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
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { KpiCard } from '@/components/kpi-card'
import { Pillar } from '@/components/pillar'
import { Trophy, Clock, Bookmark, Eye, MessageSquare, Heart, Share2, MousePointer, Mail, SlidersHorizontal, BarChart3, LineChart as LineChartIcon } from 'lucide-react'
import { fmtCompact, fmtDate } from '@/lib/format'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'
import type { Post, PostMetrics } from '@/types'

// GV2 — period filter
type PeriodKey = 'all' | 'last4w' | 'thisMonth' | 'thisQuarter'

const PERIOD_KEYS: PeriodKey[] = ['all', 'last4w', 'thisMonth', 'thisQuarter']

function periodBounds(key: PeriodKey): { from: Date; to: Date } | null {
  if (key === 'all') return null
  const now = new Date()
  if (key === 'last4w') {
    const from = new Date(now)
    from.setDate(from.getDate() - 28)
    return { from, to: now }
  }
  if (key === 'thisMonth') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from, to: now }
  }
  if (key === 'thisQuarter') {
    const q = Math.floor(now.getMonth() / 3)
    const from = new Date(now.getFullYear(), q * 3, 1)
    return { from, to: now }
  }
  return null
}

function isInPeriod(isoDate: string, bounds: { from: Date; to: Date } | null): boolean {
  if (!bounds) return true
  const d = new Date(isoDate)
  return d >= bounds.from && d <= bounds.to
}

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

// All PostMetrics keys, in display order. Translated names for KPI picker /
// comparison-chart controls live under `performance.metric<Key>` in i18n-dict.
const METRIC_KEYS: MetricKey[] = [
  'reach', 'impressions', 'saves', 'shares', 'comments', 'likes', 'profileVisits', 'clicks', 'dms',
]

const METRIC_NAME_KEY: Record<MetricKey, string> = {
  reach:         'performance.metricReach',
  impressions:   'performance.metricImpressions',
  saves:         'performance.metricSaves',
  shares:        'performance.metricShares',
  comments:      'performance.metricComments',
  likes:         'performance.metricLikes',
  profileVisits: 'performance.metricProfileVisits',
  clicks:        'performance.metricClicks',
  dms:           'performance.metricDms',
}

const MAX_KPIS = 6
const DEFAULT_KPIS: MetricKey[] = ['reach', 'saves', 'clicks', 'dms']
const DEFAULT_COMPARE: [MetricKey, MetricKey] = ['reach', 'saves']

function kpiStorageKey(slug: string) {
  return `mp.perf.kpis.${slug}`
}

function isMetricKey(v: string): v is MetricKey {
  return (METRIC_KEYS as string[]).includes(v)
}

function loadKpiSelection(slug: string): MetricKey[] {
  if (typeof window === 'undefined') return DEFAULT_KPIS
  try {
    const raw = window.localStorage.getItem(kpiStorageKey(slug))
    if (!raw) return DEFAULT_KPIS
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_KPIS
    const keys = parsed.filter((x): x is MetricKey => typeof x === 'string' && isMetricKey(x))
    return keys.length ? keys.slice(0, MAX_KPIS) : DEFAULT_KPIS
  } catch {
    return DEFAULT_KPIS
  }
}

// ISO-week number (1–53) for an ISO date string. Used to bucket per-post
// metrics into a weekly series for ANY metric.
function isoWeek(iso: string): number {
  const d = new Date(iso)
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3)
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
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
  const { performance, posts, plan, brief, slug } = useOutletContext<ClientBundle>()
  const [sortBy, setSortBy] = useState<MetricKey>('reach')

  // GV2 — period filter
  const [period, setPeriod] = useState<PeriodKey>('all')

  // PF1 — customizable KPI summary row (persisted per slug in localStorage)
  const [kpiSelection, setKpiSelection] = useState<MetricKey[]>(() => loadKpiSelection(slug))
  useEffect(() => {
    setKpiSelection(loadKpiSelection(slug))
  }, [slug])
  useEffect(() => {
    try {
      window.localStorage.setItem(kpiStorageKey(slug), JSON.stringify(kpiSelection))
    } catch {
      /* ignore */
    }
  }, [slug, kpiSelection])

  const toggleKpi = (key: MetricKey) => {
    setKpiSelection((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key)
      if (prev.length >= MAX_KPIS) return prev
      return [...prev, key]
    })
  }

  // PF1 — combine-two-KPIs comparison chart
  const [compareA, setCompareA] = useState<MetricKey>(DEFAULT_COMPARE[0])
  const [compareB, setCompareB] = useState<MetricKey>(DEFAULT_COMPARE[1])

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

  // GF-44 — friendly per-client "Post N" name, computed from the full post set so
  // it matches the calendar/approvals numbering.
  const seqMap = useMemo(() => postSeqMap(posts), [posts])

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

  // GV2 — compute period bounds once; filter measured posts
  const periodBoundsValue = periodBounds(period)

  const measuredPostIds = Object.keys(performance.posts)
  const measuredPosts = measuredPostIds
    .map((id) => ({ post: postById[id], metrics: performance.posts[id] }))
    .filter((x): x is { post: Post; metrics: PostMetrics } => !!x.post && isInPeriod(x.post.date, periodBoundsValue))

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

  // PF1 — bucket per-post metrics into ISO weeks for the comparison chart.
  const compareData = (() => {
    const byWeek: Record<number, Record<MetricKey, number>> = {}
    for (const { post, metrics } of measuredPosts) {
      const wk = isoWeek(post.date)
      if (!byWeek[wk]) {
        byWeek[wk] = { reach: 0, impressions: 0, saves: 0, shares: 0, comments: 0, likes: 0, profileVisits: 0, clicks: 0, dms: 0 }
      }
      for (const k of METRIC_KEYS) byWeek[wk][k] += metrics[k]
    }
    return Object.entries(byWeek)
      .map(([w, m]) => ({ week: Number(w), [compareA]: m[compareA], [compareB]: m[compareB] }))
      .sort((a, b) => a.week - b.week)
  })()

  const nameA = t(METRIC_NAME_KEY[compareA])
  const nameB = t(METRIC_NAME_KEY[compareB])

  // GA proxy metrics — on-platform signals we actually have, NOT invented GA data.
  const analyticsTool = brief.tools?.analytics?.trim()

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
        <div className="flex items-center gap-3 flex-wrap">
          {/* GV2 — period filter */}
          <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <TabsList>
              {PERIOD_KEYS.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {t(`period.${k}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Clock className="h-3.5 w-3.5" />
            {fmtDate(performance.lastSyncedAt)} &middot; {t('performance.from')} {performance.source}
          </div>
        </div>
      </div>

      {/* PF1 — Customizable KPI summary row */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">{t('performance.kpiSummary')}</h2>
            <p className="text-sm text-ink-muted">{t('performance.kpiSummaryHint')}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {t('performance.customize')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{t('performance.pickMetrics', { max: MAX_KPIS })}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {METRIC_KEYS.map((key) => {
                const checked = kpiSelection.includes(key)
                const atCap = !checked && kpiSelection.length >= MAX_KPIS
                return (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={checked}
                    disabled={atCap}
                    onCheckedChange={() => toggleKpi(key)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {t(METRIC_NAME_KEY[key])}
                  </DropdownMenuCheckboxItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {kpiSelection.map((key) => {
            const goal = performance.vsGoals[key]
            // GV2: when period != 'all' use filtered totals so the cards reflect the selected range
            const current = period === 'all' && goal ? goal.current : (totals[key] ?? 0)
            return (
              <KpiCard
                key={key}
                label={t(METRIC_NAME_KEY[key])}
                current={current}
                target={goal ? goal.target : current}
                unit=""
                pace={period === 'all' ? goal?.pace : undefined}
                deltaPct={period === 'all' ? goal?.deltaPct : undefined}
              />
            )
          })}
        </div>
      </section>

      <Separator />

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

      {/* PF1 — Combine-two-KPIs comparison chart */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <LineChartIcon className="h-4 w-4 text-brand-blue" />
              {t('performance.compareTitle')}
            </h2>
            <p className="text-sm text-ink-muted">{t('performance.compareHint')}</p>
          </div>
          <div className="flex items-center gap-2">
            <MetricSelect
              ariaLabel={t('performance.compareMetricA')}
              value={compareA}
              onChange={setCompareA}
              t={t}
            />
            <span className="text-ink-muted text-sm">/</span>
            <MetricSelect
              ariaLabel={t('performance.compareMetricB')}
              value={compareB}
              onChange={setCompareB}
              t={t}
            />
          </div>
        </div>
        <Card>
          <CardContent className="p-5">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compareData}>
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
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey={compareA}
                    name={nameA}
                    stroke={BRAND.blue}
                    strokeWidth={2}
                    dot={{ r: 3, fill: BRAND.blue }}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey={compareB}
                    name={nameB}
                    stroke={BRAND.green}
                    strokeWidth={2}
                    dot={{ r: 3, fill: BRAND.green }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* PF1 — Google Analytics section (honest, no fabricated GA data) */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brand-blue" />
          {t('performance.gaTitle')}
        </h2>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="text-sm text-ink-muted max-w-xl">
                {analyticsTool
                  ? t('performance.gaConnected', { tool: analyticsTool })
                  : t('performance.gaNotConnected')}
                <br />
                {t('performance.gaComingSoon')}
              </p>
              <Button variant="outline" size="sm" disabled className="opacity-70">
                <BarChart3 className="h-3.5 w-3.5" />
                {t('performance.gaConnectCta')}
              </Button>
            </div>
            <Separator />
            <p className="text-xs text-ink-muted">{t('performance.gaProxyHint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ProxyStat
                icon={<MousePointer className="h-4 w-4 text-brand-blue" />}
                label={t('performance.gaClicksProxy')}
                value={totals.clicks ?? 0}
              />
              <ProxyStat
                icon={<Eye className="h-4 w-4 text-brand-blue" />}
                label={t('performance.gaVisitsProxy')}
                value={totals.profileVisits ?? 0}
              />
            </div>
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
                              <Badge variant="outline" className="text-[10px]">
                                {seqMap.get(post.id) ? t('post.nameN', { n: seqMap.get(post.id)! }) : post.id}
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

// PF1 — compact metric picker for the comparison chart (native select keeps it
// keyboard-accessible and TS-safe; styled to match the outline button look).
function MetricSelect({
  value,
  onChange,
  ariaLabel,
  t,
}: {
  value: MetricKey
  onChange: (k: MetricKey) => void
  ariaLabel: string
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => {
        if (isMetricKey(e.target.value)) onChange(e.target.value)
      }}
      className="h-7 rounded-md border border-border-subtle bg-paper px-2 text-[0.8rem] text-ink focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
    >
      {METRIC_KEYS.map((k) => (
        <option key={k} value={k}>
          {t(METRIC_NAME_KEY[k])}
        </option>
      ))}
    </select>
  )
}

// PF1 — single on-platform proxy stat for the Google Analytics section.
function ProxyStat({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border-subtle bg-paper-muted/40 px-4 py-3">
      <div className="h-9 w-9 rounded-full bg-brand-blue/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-ink-muted truncate">{label}</p>
        <p className="text-xl font-bold text-brand-blue">{fmtCompact(value)}</p>
      </div>
    </div>
  )
}


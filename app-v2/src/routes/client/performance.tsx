// GF-113 — the Performance tab, rebuilt on real numbers.
//
// WHAT THIS REPLACED: 776 lines that rendered nine metrics per post, a weekly
// reach chart, "top performer" cards and a Google Analytics panel — every one of
// them read from a hand-authored `performance.json` marked `"source": "manual"`.
// Real clients had no such file, so they saw an empty box. The tab was a stage set.
//
// THREE RULES THIS FILE FOLLOWS, and they are the whole point of the item:
//
//  1. NOTHING IS RENDERED THAT WE DID NOT MEASURE. No metric is defaulted to 0.
//     An absent number means "unknown" and is shown as such or not at all. A zero
//     is a claim, and we would not be able to back it up.
//  2. METRICS ARE LABEL-DRIVEN. Postiz returns a different set per platform,
//     decided at runtime. We render what it names; we never assert a fixed list.
//  3. A ONE-POINT SNAPSHOT IS NOT A TREND. Postiz returns Reach as a daily series
//     but Likes/Views/Comments/Shares/Saves/Replies as a single window total.
//     Charting the latter would draw a flat, meaningless line, so `kind` decides
//     the mark.
//
// PER-POST METRICS ARE DELIBERATELY ABSENT (TASK-018, Martin 2026-08-24).
// `/analytics/post/{id}` returns an empty array for every published post, so the
// nine-column table is gone rather than shown as zeros, and the "top performers"
// cards are gone because there is nothing per-post to rank. They do not come back
// as a channel-level fake. The Meta Graph route is folded into GF-21.

import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  AlertCircle,
  ExternalLink,
  KeyRound,
  Link2Off,
  RefreshCw,
  Unplug,
} from 'lucide-react'
import { postSeqMap } from '@/lib/post-status'
import { fmtCompact, fmtDateShort, fmtDateTime, fmtNumber } from '@/lib/format'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { apiSyncAnalytics, isApiEnabled } from '@/lib/api-client'
import type { ClientBundle } from '@/lib/client-data'
import type {
  AnalyticsChannel,
  AnalyticsPost,
  ClientAnalytics,
  MetricSeries,
  RemotePostState,
} from '@/types'

/**
 * Postiz hands us English labels. This maps the ones actually OBSERVED in the
 * TASK-001 probe to i18n keys; anything unmapped falls through to the raw label.
 *
 * The fallback matters: a new platform (or a Postiz change) must show its metric
 * under the provider's own name rather than as a blank cell. Guessing a
 * translation for a label we have never seen would be worse than showing English.
 */
const LABEL_KEYS: Record<string, string> = {
  Reach: 'analytics.labelReach',
  Likes: 'analytics.labelLikes',
  Views: 'analytics.labelViews',
  Comments: 'analytics.labelComments',
  Shares: 'analytics.labelShares',
  Saves: 'analytics.labelSaves',
  Replies: 'analytics.labelReplies',
  Followers: 'analytics.labelFollowers',
  Impressions: 'analytics.labelImpressions',
  Subscribers: 'analytics.labelSubscribers',
}

const STATE_STYLE: Record<RemotePostState, string> = {
  published: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  queued: 'bg-sky-50 text-sky-700 border-sky-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  unknown: 'bg-slate-100 text-slate-600 border-slate-200',
}

/** Sum of a snapshot's single point, or the latest value of a series. Used only
 *  for the headline figure next to a chart — never to invent a missing metric. */
function headlineValue(s: MetricSeries): number | null {
  if (s.points.length === 0) return null
  if (s.kind === 'snapshot') return s.points[0]!.total
  return s.points.reduce((acc, p) => acc + p.total, 0)
}

function ChannelBadge({ identifier }: { identifier: string }) {
  // `instagram-standalone` is what Postiz actually reports (probe finding). Show
  // the human half without pretending the raw identifier is something else.
  const pretty = identifier.replace(/-standalone$/, '').replace(/^\w/, (c) => c.toUpperCase())
  return (
    <Badge variant="outline" className="text-[11px] font-medium">
      {pretty}
    </Badge>
  )
}

function SeriesChart({ series, label }: { series: MetricSeries; label: string }) {
  const data = series.points.map((p) => ({ date: p.date, value: p.total }))
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${series.label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={BRAND.blue} stopOpacity={0.35} />
              <stop offset="100%" stopColor={BRAND.blue} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.35} />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => fmtDateShort(v)}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => fmtCompact(v)}
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            formatter={(v) => [fmtNumber(Number(v)), label]}
            labelFormatter={(v) => fmtDateShort(String(v))}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={BRAND.blue}
            strokeWidth={2}
            fill={`url(#grad-${series.label})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function ChannelPanel({ channel }: { channel: AnalyticsChannel }) {
  const t = useT()
  const labelFor = (raw: string) => {
    const key = LABEL_KEYS[raw]
    // Fall back to the provider's own wording rather than an empty cell.
    return key ? t(key) : raw
  }

  const trends = channel.series.filter((s) => s.kind === 'series' && s.points.length > 0)
  const snapshots = channel.series.filter((s) => s.kind === 'snapshot' && s.points.length > 0)

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {channel.picture ? (
              <img
                src={channel.picture}
                alt=""
                className="h-9 w-9 rounded-full object-cover border"
              />
            ) : null}
            <div>
              <p className="font-semibold text-ink leading-tight">{channel.name}</p>
              <p className="text-xs text-ink-muted">
                {channel.profile ? `@${channel.profile}` : channel.identifier}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ChannelBadge identifier={channel.identifier} />
            {channel.disabled ? (
              <Badge variant="outline" className="text-[11px] bg-amber-50 text-amber-700 border-amber-200">
                {t('analytics.channelDisabled')}
              </Badge>
            ) : null}
          </div>
        </div>

        {/* A channel that failed while its siblings succeeded says so, rather than
            silently showing nothing and looking like "no activity". */}
        {channel.error ? (
          <p className="text-xs text-rose-600 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-px shrink-0" />
            {t('analytics.channelError')}
          </p>
        ) : null}

        {channel.series.length === 0 && !channel.error ? (
          // The measured LinkedIn case: connected, enabled, 200, empty array.
          // "This platform gives us nothing" — NOT "your numbers are zero".
          <p className="text-sm text-ink-muted">{t('analytics.channelNoData')}</p>
        ) : null}

        {snapshots.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {snapshots.map((s) => {
              const v = headlineValue(s)
              if (v === null) return null
              return (
                <div key={s.label} className="rounded-lg border bg-surface-subtle px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                    {labelFor(s.label)}
                  </p>
                  <p className="text-xl font-semibold text-ink tabular-nums">{fmtNumber(v)}</p>
                </div>
              )
            })}
          </div>
        ) : null}

        {trends.map((s) => (
          <div key={s.label} className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium text-ink">{labelFor(s.label)}</p>
              <p className="text-xs text-ink-muted">
                {t('analytics.overDays', { count: String(s.points.length) })}
              </p>
            </div>
            <SeriesChart series={s} label={labelFor(s.label)} />
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function PostLedgerRow({
  post,
  seq,
  t,
}: {
  post: AnalyticsPost
  seq: number | null
  t: ReturnType<typeof useT>
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 flex-wrap">
      <div className="min-w-[7rem]">
        <p className="text-sm font-medium text-ink">
          {seq ? t('analytics.postN', { n: String(seq) }) : t('analytics.postUntracked')}
        </p>
      </div>
      <div className="min-w-[6rem]">
        {post.channel ? <ChannelBadge identifier={post.channel} /> : null}
      </div>
      <div className="min-w-[7rem] text-sm text-ink-muted tabular-nums">
        {post.publishDate ? fmtDateShort(post.publishDate) : '—'}
      </div>
      <Badge variant="outline" className={cn('text-[11px]', STATE_STYLE[post.state])}>
        {t(`analytics.state.${post.state}`)}
      </Badge>
      {/*
        The payoff of this whole ledger: a real, verified click-through from our
        dashboard to the live post. Only rendered when the provider gave us one —
        a dead link would be worse than none.
      */}
      <div className="ml-auto">
        {post.releaseURL ? (
          <Button asChild variant="ghost" size="sm">
            <a href={post.releaseURL} target="_blank" rel="noopener noreferrer">
              {t('analytics.viewLive')}
              <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </a>
          </Button>
        ) : null}
      </div>
      {/*
        GF-21 landing surface: when a per-post source exists, `metrics` fills and
        these columns appear with no rebuild. Empty today, by decision, and never
        rendered as zeros.
      */}
      {post.metrics.length > 0 ? (
        <div className="w-full flex gap-4 pt-2">
          {post.metrics.map((m) => {
            const v = headlineValue(m)
            return v === null ? null : (
              <span key={m.label} className="text-xs text-ink-muted">
                {m.label}: <span className="font-medium text-ink tabular-nums">{fmtNumber(v)}</span>
              </span>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** The four non-`ok` states, each with its own explanation and its own next step.
 *  This is the whole reason the contract carries an explicit `status`: the legacy
 *  route collapsed all of these into `{}` and the tab rendered one blank box. */
function StatusPanel({ analytics }: { analytics: ClientAnalytics }) {
  const t = useT()
  const map = {
    no_key: { Icon: KeyRound, title: 'analytics.noKeyTitle', body: 'analytics.noKeyBody' },
    no_channels: { Icon: Unplug, title: 'analytics.noChannelsTitle', body: 'analytics.noChannelsBody' },
    error: { Icon: AlertCircle, title: 'analytics.errorTitle', body: 'analytics.errorBody' },
    // `stale` normally means "showing retained real numbers", which never reaches
    // this panel because there IS data to render. It can only land here if a
    // payload is stale with nothing in it, and then the stale wording would
    // promise numbers that are not on screen. Treat it as the failure it is.
    stale: { Icon: AlertCircle, title: 'analytics.errorTitle', body: 'analytics.errorBody' },
  } as const
  // Never return null: this panel is the ONLY thing rendered when there is no
  // data, so returning null would leave a blank page with no explanation - the
  // exact failure the explicit `status` exists to prevent.
  const entry = map[analytics.status as keyof typeof map] ?? map.error
  const { Icon, title, body } = entry
  return (
    <Card>
      <CardContent className="p-10 text-center">
        <Icon className="h-8 w-8 mx-auto mb-3 text-ink-muted opacity-50" />
        <p className="font-semibold text-ink mb-1">{t(title)}</p>
        <p className="text-sm text-ink-muted max-w-md mx-auto">{t(body)}</p>
        {/* The provider's own message, when there is one. Never a secret — the
            API strips key material before this ever reaches the browser. */}
        {analytics.error ? (
          <p className="mt-3 text-xs text-ink-muted/80 font-mono break-words max-w-md mx-auto">
            {analytics.error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

export default function PerformanceView() {
  const t = useT()
  const { analytics: initial, posts, slug } = useOutletContext<ClientBundle>()
  const [analytics, setAnalytics] = useState<ClientAnalytics>(initial)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  // GF-44 — friendly "Post N" naming, computed from the FULL post set so the
  // numbers match the calendar and approvals tabs.
  const seqMap = useMemo(() => postSeqMap(posts), [posts])
  const postIdToSeq = (postId: string | null) => (postId ? (seqMap.get(postId) ?? null) : null)

  const refresh = async () => {
    setSyncing(true)
    setSyncError(null)
    try {
      setAnalytics(await apiSyncAnalytics(slug))
    } catch (err) {
      // Most likely the server-side per-client limiter (6 per 5 min). Say so
      // rather than leaving the button looking broken.
      setSyncError(err instanceof Error ? err.message : t('analytics.refreshFailed'))
    } finally {
      setSyncing(false)
    }
  }

  const hasData = analytics.channels.length > 0 || analytics.posts.length > 0
  // Drafts never went anywhere, so they do not belong in a record of what was
  // sent. Everything else does — INCLUDING failures, because a post that errored
  // must be visible rather than sitting as "Programmed" forever. The heading says
  // "Posts we sent", not "Published posts", precisely because this list is wider
  // than the published ones.
  const sent = analytics.posts.filter((p) => p.state !== 'draft')

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            {t('analytics.eyebrow')}
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">{t('analytics.heading')}</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Provenance, always visible. A number with no "as of" is a number you
              cannot act on. */}
          <div className="text-right">
            <p className="text-xs text-ink-muted">
              {analytics.syncedAt
                ? t('analytics.lastSynced', { when: fmtDateTime(analytics.syncedAt) })
                : t('analytics.neverSynced')}
            </p>
            <p className="text-[11px] text-ink-muted/70">
              {t('analytics.sourcedFrom', { provider: analytics.provider })}
            </p>
          </div>
          {/* File mode has no server to refresh against, so the button would be a
              lie there. */}
          {isApiEnabled ? (
            <Button variant="outline" size="sm" onClick={refresh} disabled={syncing}>
              <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', syncing && 'animate-spin')} />
              {syncing ? t('analytics.refreshing') : t('analytics.refresh')}
            </Button>
          ) : null}
        </div>
      </div>

      {syncError ? (
        <p className="text-sm text-rose-600 flex items-center gap-1.5">
          <AlertCircle className="h-4 w-4" />
          {syncError}
        </p>
      ) : null}

      {/* Stale is NOT an error state: it means a refresh was refused (usually a
          429) and we are still showing the last real numbers. Blanking a working
          tab because one refresh failed would be strictly worse. */}
      {analytics.status === 'stale' && hasData ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t('analytics.staleBody')}</span>
        </div>
      ) : null}

      {!hasData ? (
        <StatusPanel analytics={analytics} />
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-ink">{t('analytics.channelsHeading')}</h2>
            <motion.div
              className="grid gap-4 lg:grid-cols-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              {analytics.channels.map((ch) => (
                <ChannelPanel key={ch.id} channel={ch} />
              ))}
            </motion.div>
          </section>

          <Separator />

          <section className="space-y-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold text-ink">{t('analytics.ledgerHeading')}</h2>
              <p className="text-xs text-ink-muted max-w-xl">
                {/* Says out loud that per-post numbers are not available, so nobody
                    reads the ledger as "these posts got zero engagement". */}
                {t('analytics.ledgerNote')}
              </p>
            </div>

            {sent.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-sm text-ink-muted">
                  {t('analytics.ledgerEmpty')}
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <CardContent className="p-0">
                  {sent.map((p) => (
                    <PostLedgerRow key={p.remoteId} post={p} seq={postIdToSeq(p.postId)} t={t} />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Under-reporting is a form of lying too. While GF-26's payload bug is
                unfixed most posts never reach Postiz, and the tab must say so. */}
            {analytics.unlinked > 0 ? (
              <p className="text-xs text-ink-muted flex items-start gap-1.5">
                <Link2Off className="h-3.5 w-3.5 mt-px shrink-0" />
                {t('analytics.unlinkedNote', { count: String(analytics.unlinked) })}
              </p>
            ) : null}
          </section>
        </>
      )}
    </div>
  )
}

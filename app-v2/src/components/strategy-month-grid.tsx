// GF-105 — the month-at-a-glance block that closes a "Share Strategy" link.
//
// Purely presentational: it is handed one month key and the posts of that month
// and renders (a) a calendar grid with every post placed on its day, chipped in
// its pillar colour, and (b) a volume summary — posts per pillar, per network,
// per type. The summary is computed from exactly the posts it was given, so it
// can never claim more (or less) than what was actually shared.
//
// There is deliberately no image, thumbnail or mockup anywhere in here: a
// strategy link carries no image URLs at all (the API strips them server-side).

import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChannelIcon, CHANNEL_LABEL } from '@/components/channel-icon'
import { Pillar } from '@/components/pillar'
import { dayOfIsoDay } from '@/lib/calendar-date'
import { getFormatLocale } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { parseMonthKey } from '@/lib/planning-range'
import { postFormatLabelKey } from '@/lib/post-format'
import { pillarColors } from '@/lib/section-accent'
import { cn } from '@/lib/utils'
import type { Channel } from '@/types'

/** The (structural) shape this grid needs. `PublicReviewPost` satisfies it. */
export interface StrategyGridPost {
  id: string
  date: string
  title: string
  pillar?: string
  format?: string
  channel?: string
  channels?: string[]
}

// Local copies of the two channel helpers the strategy surface needs. They are
// NOT exported: this file also exports a component, and the repo's
// react-refresh/only-export-components rule forbids mixing the two. The strategy
// view keeps its own equally small copies rather than adding a shared module for
// four lines.

/** Every network a post targets: `channels` when present, else the primary. */
function strategyChannels(post: StrategyGridPost): string[] {
  const list = post.channels && post.channels.length > 0 ? post.channels : post.channel ? [post.channel] : []
  return Array.from(new Set(list.filter(Boolean)))
}

/** Human label for a network — the canonical brand casing, or the raw value. */
function strategyChannelLabel(channel: string): string {
  return CHANNEL_LABEL[channel as Channel] ?? channel
}

/** Monday-first weekday initials in the active locale. 2024-01-01 was a Monday. */
function weekdayLabels(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
  )
}

interface Tally {
  label: string
  count: number
  color?: string
}

function tally(
  entries: string[],
  colors?: Record<string, string>,
): Tally[] {
  const counts = new Map<string, number>()
  for (const e of entries) counts.set(e, (counts.get(e) ?? 0) + 1)
  return Array.from(counts, ([label, count]) => ({ label, count, color: colors?.[label] }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

export function StrategyMonthGrid({
  monthKey,
  posts,
  pillarColorMap,
  className,
}: {
  monthKey: string
  posts: StrategyGridPost[]
  /**
   * Pillar → colour. Optional: pass the map built over ALL shared posts so the
   * colours agree across months. Omitted, the grid derives it from its own posts.
   */
  pillarColorMap?: Record<string, string>
  className?: string
}) {
  const t = useT()
  const locale = getFormatLocale()

  const colors = useMemo(
    () => pillarColorMap ?? pillarColors(posts.map((p) => p.pillar ?? '')),
    [pillarColorMap, posts],
  )

  const untagged = t('review.strategy.untagged')

  const { monthLabel, leading, days, byDay } = useMemo(() => {
    const start = parseMonthKey(monthKey)
    if (!start) return { monthLabel: monthKey, leading: 0, days: 0, byDay: new Map<number, StrategyGridPost[]>() }
    const total = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()
    const map = new Map<number, StrategyGridPost[]>()
    for (const p of posts) {
      const d = dayOfIsoDay(p.date)
      if (d === null) continue
      const bucket = map.get(d)
      if (bucket) bucket.push(p)
      else map.set(d, [p])
    }
    return {
      monthLabel: start.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
      leading: (start.getDay() + 6) % 7,
      days: total,
      byDay: map,
    }
  }, [monthKey, posts, locale])

  const pillarTally = useMemo(
    () => tally(posts.map((p) => p.pillar?.trim() || untagged), colors),
    [posts, colors, untagged],
  )
  const channelTally = useMemo(
    // Tally on the RAW channel key, not the display label: ChannelIcon is keyed
    // by the raw value, and a channel with no entry in CHANNEL_LABEL would
    // otherwise round-trip through its own display string and lose its icon.
    () => tally(posts.flatMap((p) => strategyChannels(p))),
    [posts],
  )
  const formatTally = useMemo(
    () =>
      tally(
        posts.map((p) => {
          const key = p.format ? postFormatLabelKey(p.format) : undefined
          return key ? t(key) : p.format?.trim() || untagged
        }),
      ),
    [posts, t, untagged],
  )

  const weekdays = weekdayLabels(locale)
  const cells = Array.from({ length: leading + days }, (_, i) => (i < leading ? null : i - leading + 1))

  return (
    <section
      className={cn('rounded-xl border border-border-subtle bg-paper overflow-hidden', className)}
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-border-subtle px-4 py-3">
        <h3 className="text-sm font-semibold capitalize">{monthLabel}</h3>
        <span className="text-[11px] text-ink-muted shrink-0">
          {t('review.strategy.totalPosts', { n: posts.length })}
        </span>
      </header>

      {/* Month grid */}
      <div className="px-2 py-3 sm:px-3">
        <div className="grid grid-cols-7 gap-px text-center">
          {weekdays.map((w) => (
            <div key={w} className="pb-1 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`pad-${i}`} className="min-h-[52px]" />
            const dayPosts = byDay.get(day) ?? []
            return (
              <div
                key={day}
                className={cn(
                  'min-h-[52px] rounded-md border p-1 text-left',
                  dayPosts.length > 0
                    ? 'border-border-subtle bg-paper'
                    : 'border-transparent bg-paper-muted/40',
                )}
              >
                <span
                  className={cn(
                    'block text-[10px] leading-none tabular-nums',
                    dayPosts.length > 0 ? 'font-semibold text-ink' : 'text-ink-muted',
                  )}
                >
                  {day}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayPosts.map((p) => {
                    const color = colors[p.pillar?.trim() || untagged] ?? '#211D58'
                    return (
                      <span
                        key={p.id}
                        title={`${p.title}${p.pillar ? ` — ${p.pillar}` : ''}`}
                        className="flex items-center gap-1 rounded-[3px] px-1 py-0.5 text-[9px] font-medium leading-tight"
                        style={{ backgroundColor: `${color}1a`, color }}
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <span className="truncate">{p.title}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border-subtle px-4 py-2.5">
        <span className="text-[10px] font-medium uppercase tracking-wide text-ink-muted">
          {t('review.strategy.pillars')}
        </span>
        {pillarTally.map((p) => (
          <Pillar key={p.label} name={p.label} color={p.color} />
        ))}
      </div>

      {/* Volume summary */}
      <div className="grid gap-4 border-t border-border-subtle px-4 py-3 sm:grid-cols-3">
        <TallyBlock title={t('review.strategy.perPillar')} rows={pillarTally} total={posts.length} />
        <TallyBlock
          title={t('review.strategy.perPlatform')}
          rows={channelTally}
          total={posts.length}
          hint={t('review.strategy.platformHint')}
          icon
          display={strategyChannelLabel}
        />
        <TallyBlock title={t('review.strategy.perFormat')} rows={formatTally} total={posts.length} />
      </div>
    </section>
  )
}

function TallyBlock({
  title,
  rows,
  total,
  hint,
  icon = false,
  display,
}: {
  title: string
  rows: Tally[]
  total: number
  hint?: string
  icon?: boolean
  /** Renders `label` for display. `label` itself stays the raw key the icon needs. */
  display?: (label: string) => string
}) {
  const max = Math.max(total, ...rows.map((r) => r.count), 1)
  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-[11px] text-ink-muted">—</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="space-y-0.5">
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  {icon && <ChannelIcon channel={r.label} className="h-3 w-3" />}
                  <span className="truncate">{display ? display(r.label) : r.label}</span>
                </span>
                <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-[10px] tabular-nums">
                  {r.count}
                </Badge>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-paper-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(r.count / max) * 100}%`,
                    backgroundColor: r.color ?? '#5e5497',
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="text-[10px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  )
}

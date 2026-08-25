import { useEffect, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { fmtCompact, fmtDelta, fmtNumber } from '@/lib/format'
import { PACE_COLORS } from '@/lib/brand'
import { TrendingDown, TrendingUp, Minus, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import type { SocialNetwork } from '@/types/brief'
// GF-20: brand glyph paths now live in one shared module (channel-icon.tsx).
// SocialNetwork and Channel are the same 5-value union, so the map indexes fine.
import { CHANNEL_PATHS as NETWORK_PATHS } from '@/components/channel-icon'

const NETWORK_LABEL: Record<SocialNetwork, string> = {
  linkedin:  'LinkedIn',
  instagram: 'Instagram',
  facebook:  'Facebook',
  x:         'X',
  tiktok:    'TikTok',
}

const NETWORK_COLOR: Record<SocialNetwork, string> = {
  linkedin:  '#0A66C2',
  instagram: '#E1306C',
  facebook:  '#1877F2',
  x:         'currentColor',
  tiktok:    'currentColor',
}

interface Props {
  label: string
  /** GF-113: `null` means we genuinely cannot measure this goal, and the card
   *  says so instead of drawing a 0% bar. A zero would assert the client achieved
   *  nothing, which is a different claim from "we have no source for this". */
  current: number | null
  /** GF-113: set when `current` covers a SHORTER window than `target` (our
   *  measurements are 30-day; goals are quarterly). Displays the window and
   *  SUPPRESSES the progress bar, because the two are not comparable. */
  windowNote?: string
  target: number
  unit: string
  pace?: 'ahead' | 'on-track' | 'behind'
  deltaPct?: number
  compact?: boolean
  channel?: SocialNetwork
  channelUrl?: string
}

function CountUp({ to, compact = false }: { to: number; compact?: boolean }) {
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, (v) => (compact ? fmtCompact(v) : fmtNumber(v)))
  const [display, setDisplay] = useState(compact ? fmtCompact(0) : '0')

  useEffect(() => {
    const controls = animate(mv, to, {
      duration: 1.2,
      ease: 'easeOut',
    })
    const unsub = rounded.on('change', setDisplay)
    return () => {
      controls.stop()
      unsub()
    }
  }, [to, mv, rounded])

  return <>{display}</>
}

export function KpiCard({
  label,
  current,
  target,
  unit,
  pace,
  deltaPct,
  compact = true,
  channel,
  channelUrl,
  windowNote,
}: Props) {
  const t = useT()
  const unmeasured = current === null
  // No bar when the measured window does not cover the target period — see
  // ANALYTICS_WINDOW_DAYS in lib/goal-actuals.ts.
  const showBar = !unmeasured && !windowNote
  const pct = target === 0 || current === null ? 0 : Math.min(100, (current / target) * 100)
  const paceColor = pace ? PACE_COLORS[pace] : '#6b6375'
  const Icon = !deltaPct ? Minus : deltaPct > 0 ? TrendingUp : TrendingDown

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
            {label}
          </p>
          {pace && !unmeasured && (
            <div
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ backgroundColor: paceColor + '22', color: paceColor }}
            >
              <Icon className="h-3 w-3" />
              {deltaPct !== undefined ? fmtDelta(deltaPct) : pace}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          {unmeasured ? (
            <span className="text-lg font-medium text-ink-muted/80">
              {t('goals.notMeasured')}
            </span>
          ) : (
            <span className="text-3xl font-bold text-brand-blue tracking-tight">
              <CountUp to={current} compact={compact} />
            </span>
          )}
          <span className="text-sm text-ink-muted">
            {unmeasured || windowNote ? t('goals.targetPrefix') : '/'}{' '}
            {compact ? fmtCompact(target) : fmtNumber(target)} {unit}
          </span>
        </div>

        {windowNote && !unmeasured && (
          <p className="mt-1 text-[11px] text-ink-muted/80">{windowNote}</p>
        )}

        {showBar ? (
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-paper-muted">
            <motion.div
              className={cn('h-full rounded-full')}
              style={{ backgroundColor: paceColor }}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 1.0, ease: 'easeOut' }}
            />
          </div>
        ) : (
          // Deliberately no track either: an empty rail still reads as "0% done".
          <div className="mt-4 h-1.5" />
        )}

        {channelUrl && (
          <a
            href={channelUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted hover:text-brand-blue transition-colors"
          >
            {channel ? (
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: NETWORK_COLOR[channel] }}
              >
                <path d={NETWORK_PATHS[channel]} />
              </svg>
            ) : (
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            )}
            <span>
              {t('kpi.viewChannel', {
                network: channel ? NETWORK_LABEL[channel] : '',
              })}
            </span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
          </a>
        )}
      </CardContent>
    </Card>
  )
}

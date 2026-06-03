import { useEffect, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { fmtCompact, fmtDelta, fmtNumber } from '@/lib/format'
import { PACE_COLORS } from '@/lib/brand'
import { TrendingDown, TrendingUp, Minus, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import type { SocialNetwork } from '@/types/brief'

// Brand glyphs for social networks (fill="currentColor", viewBox 0 0 24 24)
const NETWORK_PATHS: Record<SocialNetwork, string> = {
  linkedin:
    'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z',
  instagram:
    'M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.33 4.14.63c-.79.3-1.46.72-2.12 1.38C1.35 2.68.93 3.35.63 4.14c-.3.76-.5 1.64-.56 2.91C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.26 2.15.56 2.91.3.79.72 1.46 1.38 2.12.66.66 1.33 1.08 2.12 1.38.76.3 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.26 2.91-.56a5.86 5.86 0 0 0 2.12-1.38 5.86 5.86 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.26-2.15-.56-2.91a5.86 5.86 0 0 0-1.38-2.12A5.86 5.86 0 0 0 19.86.63c-.76-.3-1.64-.5-2.91-.56C15.67.01 15.26 0 12 0zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-10.84a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z',
  facebook:
    'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z',
  x: 'M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.59l5.24 6.93 6.07-6.93zm-1.29 19.5h2.04L6.49 3.24H4.3L17.61 20.65z',
  tiktok:
    'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .58.04.86.13V9.4a6.33 6.33 0 0 0-.86-.05A6.34 6.34 0 0 0 5.6 20.97a6.34 6.34 0 0 0 10.74-4.58V9.42a8.16 8.16 0 0 0 4.76 1.52V7.49a4.83 4.83 0 0 1-1.51-.8z',
}

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
  current: number
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
}: Props) {
  const t = useT()
  const pct = target === 0 ? 0 : Math.min(100, (current / target) * 100)
  const paceColor = pace ? PACE_COLORS[pace] : '#6b6375'
  const Icon = !deltaPct ? Minus : deltaPct > 0 ? TrendingUp : TrendingDown

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
            {label}
          </p>
          {pace && (
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
          <span className="text-3xl font-bold text-brand-blue tracking-tight">
            <CountUp to={current} compact={compact} />
          </span>
          <span className="text-sm text-ink-muted">
            / {compact ? fmtCompact(target) : fmtNumber(target)} {unit}
          </span>
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-paper-muted">
          <motion.div
            className={cn('h-full rounded-full')}
            style={{ backgroundColor: paceColor }}
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1.0, ease: 'easeOut' }}
          />
        </div>

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

import { useEffect, useState } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { fmtCompact, fmtDelta, fmtNumber } from '@/lib/format'
import { PACE_COLORS } from '@/lib/brand'
import { TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  current: number
  target: number
  unit: string
  pace?: 'ahead' | 'on-track' | 'behind'
  deltaPct?: number
  compact?: boolean
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
}: Props) {
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
      </CardContent>
    </Card>
  )
}

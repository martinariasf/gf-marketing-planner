import { useOutletContext } from 'react-router'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Calendar, Star } from 'lucide-react'
import { fmtDateShort } from '@/lib/format'
import { Pillar } from '@/components/pillar'
import { useT } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'
import type { KeyDate } from '@/types'

const RELEVANCE_RING: Record<KeyDate['relevance'], string> = {
  high: 'ring-2 ring-brand-blue',
  medium: 'ring-1 ring-brand-blue/30',
  low: 'ring-1 ring-border-subtle',
}

const TYPE_BG: Record<KeyDate['type'], string> = {
  brand: 'bg-brand-blue text-white',
  industry: 'bg-amber-100 text-amber-800',
  holiday: 'bg-rose-100 text-rose-700',
  seasonal: 'bg-brand-green-100 text-brand-green-600',
  observance: 'bg-violet-100 text-violet-700',
}

export default function StrategyView() {
  const t = useT()
  const { plan } = useOutletContext<ClientBundle>()
  const totalWeeks = 12

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          {plan.quarter.label} {t('strategy.eyebrowSuffix')}
        </p>
        <h1 className="text-3xl font-bold text-brand-blue tracking-tight max-w-3xl">
          {plan.headline ?? plan.quarter.theme}
        </h1>
        {plan.strategy && (
          <p className="text-ink-muted mt-3 max-w-3xl text-base leading-relaxed">
            {plan.strategy}
          </p>
        )}
      </div>

      {/* KPIs */}
      {plan.kpis && plan.kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {plan.kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-4">
                <p className="text-[11px] uppercase tracking-wider text-ink-muted">
                  {k.label}
                </p>
                <p className="text-2xl font-bold text-brand-blue mt-1">{k.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {plan.positioningStatement && (
        <Card className="border-l-4 border-l-brand-blue">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wider text-ink-muted mb-2">
              {t('strategy.positioning')}
            </p>
            <p className="text-base leading-relaxed">{plan.positioningStatement}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Strategic priorities */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('strategy.strategicPriorities')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plan.strategicPriorities.map((p, i) => (
            <Card key={p.label}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-brand-blue text-white flex items-center justify-center text-sm font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{p.label}</h3>
                    <p className="text-sm text-ink-muted">{p.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* Content pillars */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('strategy.contentPillars')}</h2>
        <p className="text-sm text-ink-muted">
          {t('strategy.pillarsDesc')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plan.pillars.map((p) => (
            <Card key={p.name} className="overflow-hidden">
              <div
                className="h-1 w-full"
                style={{ backgroundColor: p.color }}
              />
              <CardContent className="p-5">
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="font-semibold">{p.name}</h3>
                  <span className="text-2xl font-bold" style={{ color: p.color }}>
                    {p.weight}%
                  </span>
                </div>
                <p className="text-sm text-ink-muted">{p.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* Campaign timeline */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('strategy.campaignRoadmap')}</h2>
        <Card>
          <CardContent className="p-5">
            <div className="space-y-2">
              {/* Header week numbers */}
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: '160px 1fr' }}>
                <div />
                <div className="grid grid-cols-12 gap-1 text-[10px] text-ink-muted">
                  {Array.from({ length: totalWeeks }, (_, i) => (
                    <div key={i} className="text-center">W{i + 1}</div>
                  ))}
                </div>
              </div>

              {/* Month banding */}
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: '160px 1fr' }}>
                <div />
                <div className="grid grid-cols-12 gap-1">
                  {plan.quarter.months.map((m) => (
                    <div
                      key={m.key}
                      className="col-span-4 rounded bg-paper-muted py-1 text-center text-[11px] font-medium text-ink-muted"
                    >
                      {m.name}
                    </div>
                  ))}
                </div>
              </div>

              {/* Campaign bars */}
              {plan.campaigns.map((c) => (
                <div
                  key={c.name}
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: '160px 1fr' }}
                >
                  <div className="text-xs truncate" title={c.name}>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-ink-muted text-[10px]">{c.pillar}</p>
                  </div>
                  <div className="relative grid grid-cols-12 gap-1 h-7">
                    {Array.from({ length: totalWeeks }, (_, i) => (
                      <div key={i} className="rounded-sm bg-paper-muted" />
                    ))}
                    <motion.div
                      initial={{ scaleX: 0, transformOrigin: 'left' }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
                      className="absolute top-0 bottom-0 rounded-md flex items-center px-2 text-[10px] font-semibold text-white shadow-sm"
                      style={{
                        backgroundColor: c.color,
                        left: `calc(${((c.startWeek - 1) / totalWeeks) * 100}% + ${(c.startWeek - 1) * 4}px)`,
                        width: `calc(${((c.endWeek - c.startWeek + 1) / totalWeeks) * 100}% - 4px)`,
                      }}
                    >
                      W{c.startWeek}-W{c.endWeek}
                    </motion.div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      {/* Platforms */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('strategy.platforms')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {plan.platforms.map((p) => (
            <Card key={p.channelKey}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{p.name}</CardTitle>
                <p className="text-xs text-ink-muted">{p.role}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{p.rationale}</p>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                    {t('strategy.cadence')}
                  </p>
                  <p className="text-sm">{p.cadence}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                    {t('strategy.formatMix')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.formatMix.map((f) => (
                      <Badge key={f.label} variant="outline" className="font-normal">
                        {f.label} · {f.weight}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                    {t('strategy.watch')}
                  </p>
                  <ul className="text-xs space-y-0.5 text-ink-muted">
                    {p.watch.map((w) => (
                      <li key={w}>&middot; {w}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* Key dates */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {t('strategy.keyDates')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plan.keyDates.map((d) => (
            <Card key={d.date + d.title} className={RELEVANCE_RING[d.relevance]}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {fmtDateShort(d.date)}
                    </p>
                    <h3 className="font-semibold text-sm mt-0.5">{d.title}</h3>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`text-[10px] ${TYPE_BG[d.type]}`}>{d.type}</Badge>
                    {d.relevance === 'high' && (
                      <Star className="h-3 w-3 fill-brand-blue text-brand-blue" />
                    )}
                  </div>
                </div>
                <p className="text-xs text-ink-muted">{d.angle}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  )
}

export { Pillar }

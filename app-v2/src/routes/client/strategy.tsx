import { useEffect, useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Calendar,
  Star,
  Pencil,
  MessageSquare,
  Target,
  LayoutGrid,
  MessageCircle,
  Monitor,
  MapPin,
} from 'lucide-react'
import { fmtDateShort } from '@/lib/format'
import { Pillar } from '@/components/pillar'
import { useT } from '@/lib/i18n'
import { useEdit } from '@/lib/edit-store'
import { apiLoadCalendarRange, isApiEnabled } from '@/lib/api-client'
import {
  defaultCalendarRange,
  isIsoInMonthRange,
  monthsInRange,
  normalizeCalendarRange,
  type CalendarRangeConfig,
} from '@/lib/planning-range'
import type { ClientBundle } from '@/lib/client-data'
import type { KeyDate } from '@/types'

// ─── Strategic content type → accent color + icon ────────────────────────────
// Each section of the strategy page has a distinct hue so blocks are visually
// distinguishable at a glance. Colors use existing Tailwind tokens.

type SectionType = 'positioning' | 'priorities' | 'pillars' | 'roadmap' | 'platforms' | 'keyDates'

const SECTION_META: Record<
  SectionType,
  { icon: React.ElementType; border: string; bg: string; iconCls: string; labelCls: string }
> = {
  positioning: {
    icon: Target,
    border:   'border-l-brand-blue',
    bg:       'bg-brand-blue-50/40',
    iconCls:  'text-brand-blue',
    labelCls: 'text-brand-blue',
  },
  priorities: {
    icon: LayoutGrid,
    border:   'border-l-violet-400',
    bg:       'bg-violet-50/40',
    iconCls:  'text-violet-600',
    labelCls: 'text-violet-700',
  },
  pillars: {
    icon: MessageCircle,
    border:   'border-l-amber-400',
    bg:       'bg-amber-50/40',
    iconCls:  'text-amber-600',
    labelCls: 'text-amber-700',
  },
  roadmap: {
    icon: MapPin,
    border:   'border-l-teal-400',
    bg:       'bg-teal-50/30',
    iconCls:  'text-teal-600',
    labelCls: 'text-teal-700',
  },
  platforms: {
    icon: Monitor,
    border:   'border-l-rose-400',
    bg:       'bg-rose-50/30',
    iconCls:  'text-rose-600',
    labelCls: 'text-rose-700',
  },
  keyDates: {
    icon: Calendar,
    border:   'border-l-brand-green-600',
    bg:       'bg-brand-green-100/40',
    iconCls:  'text-brand-green-600',
    labelCls: 'text-brand-green-600',
  },
}

/** Section heading row: type-coloured icon chip + title. */
function SectionHeading({
  type,
  children,
  right,
}: {
  type: SectionType
  children: React.ReactNode
  right?: React.ReactNode
}) {
  const { icon: Icon, iconCls, bg, border } = SECTION_META[type]
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center justify-center h-7 w-7 rounded-md ${bg} border-l-2 ${border}`}>
          <Icon className={`h-3.5 w-3.5 ${iconCls}`} />
        </span>
        <h2 className="text-lg font-semibold">{children}</h2>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

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

// ─── Inline-edit primitives ────────────────────────────────────────────────

/**
 * Editable single-line input (for headline, priority labels, cadence).
 * Read-only plain text when editMode is off.
 * In edit mode: tinted button → clicking shows an input.
 */
function EditableInlineText({
  slug,
  path,
  value,
  placeholder,
  editMode,
  onCommit,
  className = '',
}: {
  slug: string
  path: (string | number)[]
  value: string | undefined
  placeholder: string
  editMode: boolean
  onCommit?: () => void
  className?: string
}) {
  const { setField } = useEdit()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== (value ?? '')) setField(slug, 'plan', path, trimmed || null)
    onCommit?.()
    setEditing(false)
  }

  if (!editMode) {
    return value ? <span className={className}>{value}</span> : null
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { commit(); return }
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        className={`w-full rounded border border-amber-300 bg-amber-50/40 px-1.5 py-0.5 outline-none ring-2 ring-amber-200/60 focus:border-amber-400 ${className}`}
        placeholder={placeholder}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className={`group inline-flex items-center gap-1.5 rounded px-2 py-0.5 bg-brand-blue-50/70 border border-brand-blue-200/60 text-brand-blue hover:bg-brand-blue-50 transition-colors text-left ${className}`}
    >
      <Pencil className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      {value ? (
        <span>{value}</span>
      ) : (
        <span className="text-ink-muted/50 italic">{placeholder}</span>
      )}
    </button>
  )
}

/**
 * Editable textarea (for strategy, positioningStatement, descriptions, rationale).
 * Read-only plain text when editMode is off.
 * In edit mode: tinted button → clicking shows a textarea.
 */
function EditableInlineTextarea({
  slug,
  path,
  value,
  placeholder,
  editMode,
  rows = 3,
  onCommit,
  className = '',
}: {
  slug: string
  path: (string | number)[]
  value: string | undefined
  placeholder: string
  editMode: boolean
  rows?: number
  onCommit?: () => void
  className?: string
}) {
  const { setField } = useEdit()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== (value ?? '')) setField(slug, 'plan', path, trimmed || null)
    onCommit?.()
    setEditing(false)
  }

  if (!editMode) {
    return value ? <span className={className}>{value}</span> : null
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        rows={rows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
        }}
        className={`w-full rounded border border-amber-300 bg-amber-50/40 px-1.5 py-0.5 text-sm outline-none ring-2 ring-amber-200/60 focus:border-amber-400 resize-y ${className}`}
        placeholder={placeholder}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className={`group inline-flex items-start gap-1.5 rounded px-2 py-0.5 text-sm bg-brand-blue-50/70 border border-brand-blue-200/60 text-brand-blue hover:bg-brand-blue-50 transition-colors w-full text-left ${className}`}
    >
      <Pencil className="h-3 w-3 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      {value ? (
        <span className="whitespace-pre-wrap">{value}</span>
      ) : (
        <span className="text-ink-muted/50 italic">{placeholder}</span>
      )}
    </button>
  )
}

/** Small "Revisar con Víktor" button dispatching mp:open-chat. */
function ReviewButton({ message }: { message: string }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(
          new CustomEvent('mp:open-chat', { detail: { message } })
        )
      }
      className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-brand-blue transition-colors rounded px-2 py-1 hover:bg-brand-blue-50/50 border border-transparent hover:border-brand-blue-200/40"
    >
      <MessageSquare className="h-3.5 w-3.5" />
      {t('strategy.reviewWithViktor')}
    </button>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────

export default function StrategyView() {
  const t = useT()
  const { plan } = useOutletContext<ClientBundle>()
  const { slug = '' } = useParams<{ slug: string }>()
  const { editMode, setField } = useEdit()
  const defaultRange = useMemo(() => defaultCalendarRange(), [])
  const [planningRange, setPlanningRange] = useState<CalendarRangeConfig>(defaultRange)

  useEffect(() => {
    let cancelled = false
    if (!isApiEnabled) return
    apiLoadCalendarRange(slug).then((range) => {
      if (!cancelled) setPlanningRange(normalizeCalendarRange(range))
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  const planningMonths = useMemo(() => monthsInRange(planningRange), [planningRange])
  const totalWeeks = planningMonths.length * 4
  const keyDatesInRange = useMemo(
    () => plan.keyDates.filter((date) => isIsoInMonthRange(date.date, planningRange)),
    [plan.keyDates, planningRange],
  )

  // GF-8: period wording follows the planning range. The default range is a
  // 3-month quarter (12 weeks); keep the fixed "this quarter" / "12 weeks"
  // wording in that case, and switch to range-driven labels only when a
  // different range is configured.
  const isDefaultQuarter = planningMonths.length === 3
  const periodLabel =
    planningMonths.length > 0
      ? `${planningMonths[0].label} – ${planningMonths[planningMonths.length - 1].label}`
      : ''
  const positioningLabel = isDefaultQuarter
    ? t('strategy.positioning')
    : t('strategy.positioningPeriod', { period: periodLabel })
  const roadmapLabel = isDefaultQuarter
    ? t('strategy.campaignRoadmap')
    : t('strategy.campaignRoadmapWeeks', { weeks: totalWeeks })

  /** Write a lastModified timestamp for a given block key. */
  const stampBlock = (blockKey: string) => {
    setField(slug, 'plan', ['lastModified', blockKey], new Date().toISOString())
  }

  const lm: Record<string, string> = plan.lastModified ?? {}

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          {plan.quarter.label} {t('strategy.eyebrowSuffix')}
        </p>

        {/* Headline */}
        {editMode ? (
          <EditableInlineText
            slug={slug}
            path={['headline']}
            value={plan.headline}
            placeholder={plan.quarter.theme ?? t('strategy.headlinePlaceholder')}
            editMode={editMode}
            onCommit={() => stampBlock('headline')}
            className="text-3xl font-bold text-brand-blue tracking-tight max-w-3xl"
          />
        ) : (
          <h1 className="text-3xl font-bold text-brand-blue tracking-tight max-w-3xl">
            {plan.headline ?? plan.quarter.theme}
          </h1>
        )}

        {/* Strategy intro */}
        {(plan.strategy || editMode) && (
          <div className="max-w-3xl">
            {editMode ? (
              <EditableInlineTextarea
                slug={slug}
                path={['strategy']}
                value={plan.strategy}
                placeholder={t('strategy.strategyPlaceholder')}
                editMode={editMode}
                rows={3}
                onCommit={() => stampBlock('hero')}
                className="text-ink-muted text-base leading-relaxed"
              />
            ) : (
              <p className="text-ink-muted mt-3 text-base leading-relaxed">
                {plan.strategy}
              </p>
            )}
          </div>
        )}

        {/* Revisar hero */}
        <div className="pt-1">
          <ReviewButton
            message={`Revisemos la estrategia general: "${plan.strategy ?? plan.headline ?? plan.quarter.theme}". ¿Qué ajustarías para este trimestre?`}
          />
          {lm['hero'] && (
            <p className="text-[10px] text-ink-muted/50 mt-0.5">
              {t('strategy.editedOn').replace('{date}', fmtDateShort(lm['hero']))}
            </p>
          )}
        </div>
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

      {/* Positioning statement */}
      {(plan.positioningStatement || editMode) && (
        <Card className={`border-l-4 ${SECTION_META.positioning.border} ${SECTION_META.positioning.bg}`}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-1.5">
                <SECTION_META.positioning.icon className={`h-4 w-4 ${SECTION_META.positioning.iconCls}`} />
                <p className={`text-xs uppercase tracking-wider font-medium ${SECTION_META.positioning.labelCls}`}>
                  {positioningLabel}
                </p>
              </div>
              <ReviewButton
                message={`Revisemos la declaración de posicionamiento: "${plan.positioningStatement ?? ''}". ¿Qué ajustarías?`}
              />
            </div>
            {editMode ? (
              <EditableInlineTextarea
                slug={slug}
                path={['positioningStatement']}
                value={plan.positioningStatement}
                placeholder={t('strategy.positioningPlaceholder')}
                editMode={editMode}
                rows={2}
                onCommit={() => stampBlock('positioningStatement')}
                className="text-base leading-relaxed"
              />
            ) : (
              <p className="text-base leading-relaxed">{plan.positioningStatement}</p>
            )}
            {lm['positioningStatement'] && (
              <p className="text-[10px] text-ink-muted/50 mt-1.5">
                {t('strategy.editedOn').replace('{date}', fmtDateShort(lm['positioningStatement']))}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Strategic priorities */}
      <section className="space-y-3">
        <SectionHeading
          type="priorities"
          right={
            <>
              {lm['priorities'] && (
                <p className="text-[10px] text-ink-muted/50">
                  {t('strategy.editedOn').replace('{date}', fmtDateShort(lm['priorities']))}
                </p>
              )}
              <ReviewButton
                message={`Revisemos las prioridades estratégicas: ${plan.strategicPriorities.map((p, i) => `${i + 1}. ${p.label}`).join(', ')}. ¿Cuál reordenarías o cambiarías?`}
              />
            </>
          }
        >
          {t('strategy.strategicPriorities')}
        </SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plan.strategicPriorities.map((p, i) => (
            <Card key={p.label + i} className={`border-l-4 ${SECTION_META.priorities.border}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-sm font-bold shrink-0 border border-violet-200">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editMode ? (
                      <EditableInlineText
                        slug={slug}
                        path={['strategicPriorities', i, 'label']}
                        value={p.label}
                        placeholder={t('strategy.priorityLabelPlaceholder')}
                        editMode={editMode}
                        onCommit={() => stampBlock('priorities')}
                        className="font-semibold mb-1"
                      />
                    ) : (
                      <h3 className="font-semibold mb-1">{p.label}</h3>
                    )}
                    {editMode ? (
                      <EditableInlineTextarea
                        slug={slug}
                        path={['strategicPriorities', i, 'description']}
                        value={p.description}
                        placeholder={t('strategy.priorityDescPlaceholder')}
                        editMode={editMode}
                        rows={2}
                        onCommit={() => stampBlock('priorities')}
                        className="text-sm text-ink-muted"
                      />
                    ) : (
                      <p className="text-sm text-ink-muted">{p.description}</p>
                    )}
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
        <SectionHeading
          type="pillars"
          right={
            <>
              {lm['pillars'] && (
                <p className="text-[10px] text-ink-muted/50">
                  {t('strategy.editedOn').replace('{date}', fmtDateShort(lm['pillars']))}
                </p>
              )}
              <ReviewButton
                message={`Revisemos los pilares de contenido: ${plan.pillars.map((p) => `${p.name} (${p.weight}%)`).join(', ')}. ¿Cambiarías el peso de alguno?`}
              />
            </>
          }
        >
          {t('strategy.contentPillars')}
        </SectionHeading>
        <p className="text-sm text-ink-muted">
          {t('strategy.pillarsDesc')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plan.pillars.map((p, i) => (
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
                {editMode ? (
                  <EditableInlineTextarea
                    slug={slug}
                    path={['pillars', i, 'description']}
                    value={p.description}
                    placeholder={t('strategy.pillarDescPlaceholder')}
                    editMode={editMode}
                    rows={2}
                    onCommit={() => stampBlock('pillars')}
                    className="text-sm text-ink-muted"
                  />
                ) : (
                  <p className="text-sm text-ink-muted">{p.description}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Separator />

      {/* Campaign timeline */}
      <section className="space-y-3">
        <SectionHeading
          type="roadmap"
          right={
            <span className="text-[11px] text-ink-muted">
              {planningMonths[0]?.label} - {planningMonths[planningMonths.length - 1]?.label}
            </span>
          }
        >
          {roadmapLabel}
        </SectionHeading>
        <Card>
          <CardContent className="p-5">
            <div className="space-y-2">
              {/* Header week numbers */}
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: '160px 1fr' }}>
                <div />
                <div className="grid gap-1 text-[10px] text-ink-muted" style={{ gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))` }}>
                  {Array.from({ length: totalWeeks }, (_, i) => (
                    <div key={i} className="text-center">W{i + 1}</div>
                  ))}
                </div>
              </div>

              {/* Month banding */}
              <div className="grid items-center gap-2" style={{ gridTemplateColumns: '160px 1fr' }}>
                <div />
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${planningMonths.length}, minmax(0, 1fr))` }}>
                  {planningMonths.map((m) => (
                    <div
                      key={m.key}
                      className="rounded bg-paper-muted py-1 text-center text-[11px] font-medium text-ink-muted"
                    >
                      {m.name}
                      {m.isCurrent && <span className="ml-1 text-brand-green-600">now</span>}
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
                  <div className="relative grid gap-1 h-7" style={{ gridTemplateColumns: `repeat(${totalWeeks}, minmax(0, 1fr))` }}>
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
                        left: `calc(${((Math.min(c.startWeek, totalWeeks) - 1) / totalWeeks) * 100}% + ${(Math.min(c.startWeek, totalWeeks) - 1) * 4}px)`,
                        width: `calc(${((Math.min(c.endWeek, totalWeeks) - Math.min(c.startWeek, totalWeeks) + 1) / totalWeeks) * 100}% - 4px)`,
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
        <SectionHeading
          type="platforms"
          right={
            <>
              {lm['platforms'] && (
                <p className="text-[10px] text-ink-muted/50">
                  {t('strategy.editedOn').replace('{date}', fmtDateShort(lm['platforms']))}
                </p>
              )}
              <ReviewButton
                message={`Revisemos la estrategia de plataformas: ${plan.platforms.map((p) => p.name).join(', ')}. ¿Ajustarías la cadencia o el rol de alguna?`}
              />
            </>
          }
        >
          {t('strategy.platforms')}
        </SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {plan.platforms.map((p, i) => (
            <Card key={p.channelKey} className={`border-l-4 ${SECTION_META.platforms.border}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-1.5">
                  <Monitor className={`h-4 w-4 ${SECTION_META.platforms.iconCls} shrink-0`} />
                  <CardTitle className="text-base">{p.name}</CardTitle>
                </div>
                <p className="text-xs text-ink-muted">{p.role}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {editMode ? (
                  <EditableInlineTextarea
                    slug={slug}
                    path={['platforms', i, 'rationale']}
                    value={p.rationale}
                    placeholder={t('strategy.rationalePlaceholder')}
                    editMode={editMode}
                    rows={2}
                    onCommit={() => stampBlock('platforms')}
                    className="text-sm"
                  />
                ) : (
                  <p className="text-sm">{p.rationale}</p>
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                    {t('strategy.cadence')}
                  </p>
                  {editMode ? (
                    <EditableInlineText
                      slug={slug}
                      path={['platforms', i, 'cadence']}
                      value={p.cadence}
                      placeholder={t('strategy.cadencePlaceholder')}
                      editMode={editMode}
                      onCommit={() => stampBlock('platforms')}
                      className="text-sm"
                    />
                  ) : (
                    <p className="text-sm">{p.cadence}</p>
                  )}
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
        <SectionHeading type="keyDates">{t('strategy.keyDates')}</SectionHeading>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {keyDatesInRange.map((d) => (
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

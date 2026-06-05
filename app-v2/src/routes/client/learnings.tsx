import { useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Lightbulb, ArrowRight, Calendar, Tag, Pencil, MessageCircle, CheckCircle2, Circle } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { useEdit } from '@/lib/edit-store'
import type { ClientBundle } from '@/lib/client-data'
import type { Learning } from '@/types'

// ── Types ────────────────────────────────────────────────────────────────────

type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low'
type PeriodKey = 'all' | 'last4w' | 'thisMonth' | 'thisQuarter'
type AppliedFilter = 'all' | 'applied' | 'pending'

const PERIOD_KEYS: PeriodKey[] = ['all', 'last4w', 'thisMonth', 'thisQuarter']

const CONFIDENCE_TONE: Record<Learning['confidence'], string> = {
  high:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100  text-amber-800   border-amber-200',
  low:    'bg-neutral-100 text-neutral-700 border-neutral-200',
}

// ── Period helpers ───────────────────────────────────────────────────────────

function isDateInPeriod(isoDate: string, key: PeriodKey): boolean {
  if (key === 'all') return true
  const d = new Date(isoDate)
  const now = new Date()
  if (key === 'last4w') {
    const from = new Date(now)
    from.setDate(from.getDate() - 28)
    return d >= from && d <= now
  }
  if (key === 'thisMonth') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  if (key === 'thisQuarter') {
    const q = Math.floor(now.getMonth() / 3)
    return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === q
  }
  return true
}

// ── Inline editable text field (learnings file) ──────────────────────────────

function EditableText({
  slug,
  path,
  value,
  placeholder,
  multiline = true,
  editMode,
}: {
  slug: string
  path: (string | number)[]
  value: string | undefined
  placeholder: string
  multiline?: boolean
  editMode: boolean
}) {
  const { setField } = useEdit()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== (value ?? '')) setField(slug, 'learnings', path, trimmed || null)
    setEditing(false)
  }

  if (!editMode) {
    return value ? (
      <span>{value}</span>
    ) : (
      <span className="text-ink-muted/40">—</span>
    )
  }

  if (editing) {
    const cls =
      'w-full rounded border border-amber-300 bg-amber-50/40 px-1.5 py-0.5 text-sm outline-none ring-2 ring-amber-200/60 focus:border-amber-400'
    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) { commit(); return }
      if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
    }
    return multiline ? (
      <textarea
        autoFocus
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cls}
        placeholder={placeholder}
      />
    ) : (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className={cls}
        placeholder={placeholder}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value ?? ''); setEditing(true) }}
      className="group inline-flex items-start gap-1.5 rounded px-2 py-0.5 text-sm bg-brand-blue-50/70 border border-brand-blue-200/60 text-brand-blue hover:bg-brand-blue-50 transition-colors w-full text-left"
    >
      <Pencil className="h-3 w-3 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
      {value ? (
        <span>{value}</span>
      ) : (
        <span className="text-ink-muted/50 italic">{placeholder}</span>
      )}
    </button>
  )
}

// ── View component ───────────────────────────────────────────────────────────

export default function LearningsView() {
  const t = useT()
  const { learnings, posts, plan } = useOutletContext<ClientBundle>()
  const { slug = '' } = useParams<{ slug: string }>()
  const { editMode, setField } = useEdit()

  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all')
  const [period, setPeriod] = useState<PeriodKey>('all')
  const [appliedFilter, setAppliedFilter] = useState<AppliedFilter>('all')

  const pillarByPost = useMemo(() => {
    const m: Record<string, string> = {}
    posts.forEach((p) => (m[p.id] = p.pillar))
    return m
  }, [posts])

  const pillarColor = useMemo(() => {
    const m: Record<string, string> = {}
    plan.pillars.forEach((p) => (m[p.name] = p.color))
    return m
  }, [plan.pillars])

  const items = learnings?.items ?? []

  const filtered = useMemo(() => {
    let result = items
    if (confidenceFilter !== 'all') result = result.filter((i) => i.confidence === confidenceFilter)
    if (period !== 'all') result = result.filter((i) => isDateInPeriod(i.createdAt, period))
    if (appliedFilter === 'applied') result = result.filter((i) => i.applied === true)
    if (appliedFilter === 'pending') result = result.filter((i) => !i.applied)
    return [...result].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [items, confidenceFilter, period, appliedFilter])

  const byConfidence = useMemo(() => {
    const m = { high: 0, medium: 0, low: 0 } as Record<Learning['confidence'], number>
    items.forEach((i) => (m[i.confidence] += 1))
    return m
  }, [items])

  const appliedCount = useMemo(() => items.filter((i) => i.applied).length, [items])

  function toggleApplied(idx: number, current: boolean | undefined) {
    setField(slug, 'learnings', ['items', idx, 'applied'], !current)
    if (!current) {
      setField(slug, 'learnings', ['items', idx, 'appliedAt'], new Date().toISOString())
    }
  }

  function openAskViktor() {
    const message = t('learnings.askViktorPrompt')
    window.dispatchEvent(new CustomEvent('mp:open-chat', { detail: { message } }))
  }

  function openDiscussLearning(title: string) {
    const message = `${t('learnings.discussPrefix')} "${title}": `
    window.dispatchEvent(new CustomEvent('mp:open-chat', { detail: { message } }))
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-ink-muted">
          <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            {t('learnings.empty')}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ── Header row ────────────────────────────────────────────────────── */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            {t('learnings.eyebrow')}
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">
            {t('learnings.heading')}
          </h1>
          <p className="text-ink-muted mt-1 text-sm max-w-2xl">
            {t('learnings.introPrefix')}<em>{t('learnings.introQuestion')}</em>{t('learnings.introSuffix')}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={openAskViktor}
          className="flex items-center gap-1.5 text-brand-blue border-brand-blue-200/60 bg-brand-blue-50/50 hover:bg-brand-blue-50"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {t('learnings.askViktor')}
        </Button>
      </div>

      {/* ── Filter row ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Confidence filter */}
        <Tabs value={confidenceFilter} onValueChange={(v) => setConfidenceFilter(v as ConfidenceFilter)}>
          <TabsList>
            <TabsTrigger value="all">{t('learnings.tabAll', { n: items.length })}</TabsTrigger>
            <TabsTrigger value="high">{t('learnings.tabHigh', { n: byConfidence.high })}</TabsTrigger>
            <TabsTrigger value="medium">{t('learnings.tabMedium', { n: byConfidence.medium })}</TabsTrigger>
            <TabsTrigger value="low">{t('learnings.tabLow', { n: byConfidence.low })}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Period filter */}
        <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
          <TabsList>
            {PERIOD_KEYS.map((k) => (
              <TabsTrigger key={k} value={k}>
                {t(`period.${k}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {/* Applied filter */}
        <Tabs value={appliedFilter} onValueChange={(v) => setAppliedFilter(v as AppliedFilter)}>
          <TabsList>
            <TabsTrigger value="all">{t('learnings.filterAll')}</TabsTrigger>
            <TabsTrigger value="pending">{t('learnings.filterPending')}</TabsTrigger>
            <TabsTrigger value="applied">{t('learnings.filterApplied', { n: appliedCount })}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Separator />

      {/* ── Cards ─────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-ink-muted text-sm">
              {t('learnings.noResults')}
            </CardContent>
          </Card>
        )}
        {filtered.map((item, _visIdx) => {
          // Find real index in original items array for path addressing
          const realIdx = items.indexOf(item)
          const relatedPillar = item.relatedPostId ? pillarByPost[item.relatedPostId] : undefined

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: _visIdx * 0.04 }}
            >
              <Card className={cn(item.applied && 'opacity-75 border-emerald-200/60')}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {item.id}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn('text-[10px] uppercase tracking-wider font-semibold', CONFIDENCE_TONE[item.confidence])}
                        >
                          {t(`confidence.${item.confidence}`)}{t('learnings.confidenceSuffix')}
                        </Badge>
                        <span className="text-[11px] text-ink-muted flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {fmtDate(item.createdAt)}
                        </span>
                        {/* Applied badge */}
                        {item.applied && (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 border">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            {t('learnings.applied')}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg leading-snug">
                        {item.title}
                      </CardTitle>
                    </div>

                    {/* Card actions */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      {/* Mark applied toggle */}
                      <button
                        type="button"
                        onClick={() => toggleApplied(realIdx, item.applied)}
                        className={cn(
                          'inline-flex items-center gap-1.5 text-[11px] rounded border px-2 py-1 transition-colors',
                          item.applied
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-paper-muted border-border-subtle text-ink-muted hover:bg-brand-blue-50/40 hover:border-brand-blue-200/60 hover:text-brand-blue'
                        )}
                        title={item.applied ? (item.appliedAt ? fmtDate(item.appliedAt) : '') : t('learnings.markApplied')}
                      >
                        {item.applied ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Circle className="h-3 w-3" />
                        )}
                        {item.applied ? t('learnings.applied') : t('learnings.markApplied')}
                      </button>

                      {/* Discuss with Viktor */}
                      <button
                        type="button"
                        onClick={() => openDiscussLearning(item.title)}
                        className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-brand-blue transition-colors rounded px-2 py-1 hover:bg-brand-blue-50/50 border border-transparent hover:border-brand-blue-200/40"
                      >
                        <MessageCircle className="h-3 w-3" />
                        {t('learnings.discussWithViktor')}
                      </button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Tags row */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="secondary" className="bg-paper-muted">
                      <Tag className="h-3 w-3 mr-1" />
                      {item.platform}
                    </Badge>
                    {item.relatedPostId && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {t('suggestions.postPrefix')}{item.relatedPostId}
                      </Badge>
                    )}
                    {item.relatedCampaign && (
                      <Badge
                        variant="secondary"
                        className="bg-paper-muted text-ink-muted"
                        style={
                          relatedPillar
                            ? {
                                backgroundColor: (pillarColor[relatedPillar] ?? '#211D58') + '15',
                                color: pillarColor[relatedPillar] ?? '#211D58',
                              }
                            : undefined
                        }
                      >
                        {item.relatedCampaign}
                      </Badge>
                    )}
                  </div>

                  {/* ── Hypothesis cycle stepper ─────────────────────────── */}
                  <div className="space-y-3">
                    {/* Step 1: Hipótesis — show only if present or in edit mode */}
                    {(item.hypothesis != null || editMode) && (
                      <div className="rounded-md border border-dashed border-brand-blue-200/60 bg-brand-blue-50/20 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-brand-blue font-semibold mb-1 flex items-center gap-1">
                          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-brand-blue text-white text-[9px] font-bold">1</span>
                          {t('learnings.hypothesis')}
                        </p>
                        {editMode ? (
                          <EditableText
                            slug={slug}
                            path={['items', realIdx, 'hypothesis']}
                            value={item.hypothesis}
                            placeholder={t('learnings.hypothesisPlaceholder')}
                            editMode={editMode}
                          />
                        ) : (
                          <p className="text-sm leading-relaxed text-ink-muted italic">{item.hypothesis}</p>
                        )}
                      </div>
                    )}

                    {/* Arrow connector */}
                    {(item.hypothesis != null || editMode) && (
                      <div className="flex justify-center text-ink-muted/40">
                        <ArrowRight className="h-4 w-4 rotate-90" />
                      </div>
                    )}

                    {/* Steps 2+3: Qué pasó + Aprendizaje (always shown) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1">
                          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-ink-muted/20 text-ink-muted text-[9px] font-bold">2</span>
                          {t('learnings.whatHappened')}
                        </p>
                        {editMode ? (
                          <EditableText
                            slug={slug}
                            path={['items', realIdx, 'whatHappened']}
                            value={item.whatHappened}
                            placeholder={t('learnings.whatHappenedPlaceholder')}
                            editMode={editMode}
                          />
                        ) : (
                          <p className="text-sm leading-relaxed">{item.whatHappened}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1">
                          <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-ink-muted/20 text-ink-muted text-[9px] font-bold">3</span>
                          {t('learnings.lesson')}
                        </p>
                        {editMode ? (
                          <EditableText
                            slug={slug}
                            path={['items', realIdx, 'lesson']}
                            value={item.lesson}
                            placeholder={t('learnings.lessonPlaceholder')}
                            editMode={editMode}
                          />
                        ) : (
                          <p className="text-sm leading-relaxed">{item.lesson}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-center text-ink-muted/40">
                      <ArrowRight className="h-4 w-4 rotate-90" />
                    </div>

                    {/* Step 4: Cambio recomendado */}
                    <div className="rounded-md border-l-4 border-l-brand-blue bg-brand-blue-50/30 p-4">
                      <p className="text-[10px] uppercase tracking-wider text-brand-blue font-semibold mb-1 flex items-center gap-1">
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-brand-blue text-white text-[9px] font-bold">4</span>
                        <ArrowRight className="h-3 w-3" />
                        {t('learnings.behaviorChange')}
                      </p>
                      {editMode ? (
                        <EditableText
                          slug={slug}
                          path={['items', realIdx, 'recommendedBehaviorChange']}
                          value={item.recommendedBehaviorChange}
                          placeholder={t('learnings.behaviorChangePlaceholder')}
                          editMode={editMode}
                        />
                      ) : (
                        <p className="text-sm leading-relaxed font-medium">
                          {item.recommendedBehaviorChange}
                        </p>
                      )}
                    </div>

                    {/* Arrow + Step 5: Nueva hipótesis — show only if present or in edit mode */}
                    {(item.newHypothesis != null || editMode) && (
                      <>
                        <div className="flex justify-center text-ink-muted/40">
                          <ArrowRight className="h-4 w-4 rotate-90" />
                        </div>
                        <div className="rounded-md border border-dashed border-emerald-300 bg-emerald-50/20 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-emerald-700 font-semibold mb-1 flex items-center gap-1">
                            <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold">5</span>
                            {t('learnings.newHypothesis')}
                          </p>
                          {editMode ? (
                            <EditableText
                              slug={slug}
                              path={['items', realIdx, 'newHypothesis']}
                              value={item.newHypothesis}
                              placeholder={t('learnings.newHypothesisPlaceholder')}
                              editMode={editMode}
                            />
                          ) : (
                            <p className="text-sm leading-relaxed text-emerald-800 italic">{item.newHypothesis}</p>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

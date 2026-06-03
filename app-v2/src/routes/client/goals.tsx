import React, { useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { KpiCard } from '@/components/kpi-card'
import { fmtCompact, fmtDate } from '@/lib/format'
import { BRAND, PACE_COLORS } from '@/lib/brand'
import { Clock, Pencil, Lock } from 'lucide-react'
import { useEdit } from '@/lib/edit-store'
import { useT, useI18n, type Lang } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'

const LOCALE: Record<Lang, string> = { en: 'en-US', de: 'de-DE', es: 'es-ES' }

interface ChartTooltipPayload {
  dataKey: string
  value: number
  color: string
}
interface MonthlyTooltipProps {
  active?: boolean
  payload?: ChartTooltipPayload[]
  label?: string
}
/**
 * A single editable goal-target cell. Read-only (plain) unless global edit mode
 * is on, in which case it gets a tinted background + pencil affordance and turns
 * into a number input on click. Writes into the goals file via the edit store.
 */
function EditableTargetCell({
  slug,
  path,
  value,
  unit,
  editMode,
}: {
  slug: string
  path: (string | number)[]
  value: number
  unit: string
  editMode: boolean
}) {
  const t = useT()
  const { setField } = useEdit()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const suffix = unit && unit !== 'count' ? ` ${unit}` : ''

  if (!editMode) {
    return (
      <span className="tabular-nums font-medium">
        {fmtCompact(value)}
        {suffix}
      </span>
    )
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const n = Number(draft)
          if (!Number.isNaN(n) && n !== value) setField(slug, 'goals', path, n)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = Number(draft)
            if (!Number.isNaN(n) && n !== value) setField(slug, 'goals', path, n)
            setEditing(false)
          } else if (e.key === 'Escape') {
            setDraft(String(value))
            setEditing(false)
          }
        }}
        className="w-28 text-right tabular-nums rounded border border-amber-300 bg-amber-50/40 px-1.5 py-0.5 outline-none ring-2 ring-amber-200/60 focus:border-amber-400"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value))
        setEditing(true)
      }}
      className="group inline-flex items-center gap-1.5 rounded px-2 py-0.5 tabular-nums font-medium bg-brand-blue-50/70 border border-brand-blue-200/60 text-brand-blue hover:bg-brand-blue-50 transition-colors"
      title={t('goals.targetEditTip')}
    >
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      {fmtCompact(value)}
      {suffix}
    </button>
  )
}

/**
 * Editable text (single-line input) or textarea for weekly focus fields.
 * When editMode is off, renders plain text (or a muted dash if empty).
 * When editMode is on, shows a tinted button affordance; clicking activates an input.
 */
function EditableTextField({
  slug,
  path,
  value,
  placeholder,
  multiline = false,
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
    if (trimmed !== (value ?? '')) setField(slug, 'goals', path, trimmed || null)
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
    const sharedClass =
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
        className={sharedClass}
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
        className={sharedClass}
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

/**
 * Editable number field for kpiTarget.
 * Read-only plain text when editMode off; tinted button affordance in edit mode.
 */
function EditableNumberField({
  slug,
  path,
  value,
  editMode,
}: {
  slug: string
  path: (string | number)[]
  value: number | undefined
  editMode: boolean
}) {
  const { setField } = useEdit()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value != null ? String(value) : '')

  const commit = () => {
    const n = draft.trim() === '' ? null : Number(draft)
    if (n !== (value ?? null) && (n === null || !Number.isNaN(n))) {
      setField(slug, 'goals', path, n)
    }
    setEditing(false)
  }

  if (!editMode) {
    return value != null ? (
      <span className="tabular-nums font-medium">{fmtCompact(value)}</span>
    ) : (
      <span className="text-ink-muted/40">—</span>
    )
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          else if (e.key === 'Escape') { setDraft(value != null ? String(value) : ''); setEditing(false) }
        }}
        className="w-24 text-right tabular-nums rounded border border-amber-300 bg-amber-50/40 px-1.5 py-0.5 outline-none ring-2 ring-amber-200/60 focus:border-amber-400"
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => { setDraft(value != null ? String(value) : ''); setEditing(true) }}
      className="group inline-flex items-center gap-1.5 rounded px-2 py-0.5 tabular-nums font-medium bg-brand-blue-50/70 border border-brand-blue-200/60 text-brand-blue hover:bg-brand-blue-50 transition-colors"
    >
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
      {value != null ? fmtCompact(value) : <span className="text-ink-muted/50 italic font-normal">—</span>}
    </button>
  )
}

function MonthlyTooltip({ active, payload, label }: MonthlyTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-border-subtle bg-paper px-3 py-2 shadow-md text-xs">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.dataKey}: {fmtCompact(p.value ?? 0)}
        </p>
      ))}
    </div>
  )
}

export default function GoalsView() {
  const t = useT()
  const { lang } = useI18n()
  const { goals, performance, brief } = useOutletContext<ClientBundle>()
  const { slug = '' } = useParams<{ slug: string }>()
  const { editMode } = useEdit()

  // GV1 — anchor the dashboard to "now". The chart's X axis uses English month
  // names (e.g. "June"), so the TODAY reference line is placed at the English
  // month; the section subheader is localised per the active language.
  const now = new Date()
  const todayMonthEn = now.toLocaleString('en-US', { month: 'long' })
  const periodHeader = t('goals.periodHeader', {
    month: now.toLocaleString(LOCALE[lang], { month: 'long', year: 'numeric' }),
    n: Math.ceil(now.getDate() / 7),
  })

  const monthlyReachData = goals.monthly.map((m) => {
    const reachGoal = m.goals.find((g) => g.ref === 'g_reach')
    const reachActual = performance?.aggregates.monthly[m.month]?.reach ?? 0
    return {
      month: m.month,
      target: reachGoal?.target ?? 0,
      actual: reachActual,
    }
  })

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            {t('goals.eyebrow')}
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">
            {t('goals.heading')}
          </h1>
        </div>
        {performance?.lastSyncedAt && (
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Clock className="h-3.5 w-3.5" />
            {t('goals.lastSync')} {fmtDate(performance.lastSyncedAt)}
            <span className="ml-1 text-ink-muted/70">({performance.source})</span>
          </div>
        )}
      </div>

      {!performance && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-4 text-sm text-amber-700">
            {t('goals.noPerformance')}
          </CardContent>
        </Card>
      )}

      <section id="quarterly-kpis" className="space-y-3">
        <h2 className="text-lg font-semibold">{t('goals.quarterlyKpis')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.quarterly.map((g) => {
            const progress = performance?.vsGoals[g.id]
            const profiles = brief.channels.profiles ?? []
            const labelLower = g.label.toLowerCase()
            const matchedProfile = profiles.find((p) =>
              labelLower.includes(p.network.toLowerCase()) ||
              (p.network === 'x' && (labelLower.includes(' x ') || labelLower.startsWith('x ') || labelLower.endsWith(' x') || labelLower === 'x'))
            )
            return (
              <KpiCard
                key={g.id}
                label={g.label}
                current={progress?.current ?? 0}
                target={g.target}
                unit={g.unit}
                pace={progress?.pace}
                deltaPct={progress?.deltaPct}
                compact={g.target > 1000}
                channel={matchedProfile?.network}
                channelUrl={matchedProfile?.url}
              />
            )
          })}
        </div>
      </section>

      <Separator />

      {/* Editable goal targets. Only the Target column is user-editable —
          actuals are synced from integrations and shown read-only. The colour
          + pencil affordance makes the editable slots obvious. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">{t('goals.targets')}</h2>
          {editMode ? (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 flex items-center gap-1.5">
              <Pencil className="h-3 w-3" /> {t('goals.editOn')}
            </span>
          ) : (
            <span className="text-xs text-ink-muted flex items-center gap-1.5">
              {t('goals.editHintPrefix')}<strong className="text-ink">{t('common.edit')}</strong>{t('goals.editHintSuffix')}
            </span>
          )}
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-subtle text-[11px] uppercase tracking-wider text-ink-muted">
                  <th className="text-left font-medium px-4 py-2.5">{t('goals.colKpi')}</th>
                  <th className="text-right font-medium px-4 py-2.5">
                    <span className="inline-flex items-center gap-1 text-brand-blue">
                      <Pencil className="h-3 w-3" /> {t('goals.colTarget')}
                    </span>
                  </th>
                  <th className="text-right font-medium px-4 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      <Lock className="h-3 w-3" /> {t('goals.colActual')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {goals.quarterly.map((g, i) => {
                  const actual = performance?.vsGoals[g.id]?.current
                  return (
                    <tr key={g.id} className="border-b border-border-subtle/60 last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-medium">{g.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <EditableTargetCell
                          slug={slug}
                          path={['quarterly', i, 'target']}
                          value={g.target}
                          unit={g.unit}
                          editMode={editMode}
                        />
                      </td>
                      <td className="px-4 py-3 text-right text-ink-muted tabular-nums">
                        {actual != null ? (
                          <>
                            {fmtCompact(actual)}
                            {g.unit && g.unit !== 'count' ? ` ${g.unit}` : ''}
                          </>
                        ) : (
                          <span className="text-ink-muted/50">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <p className="text-[11px] text-ink-muted">
          <Lock className="h-3 w-3 inline mr-1 -mt-0.5" />
          {t('goals.actualsHint')}
        </p>
      </section>

      <Separator />

      {/* ── Objetivos del trimestre ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('goals.quarterlyObjectives')}</h2>
        <div className="space-y-3">
          {goals.quarterly.map((g, i) => {
            const current = g.current ?? 0
            const pct = g.target > 0 ? Math.min(100, Math.round((current / g.target) * 100)) : 0
            const suffix = g.unit && g.unit !== 'count' ? ` ${g.unit}` : ''

            // Due date helpers
            let dueBadge: React.ReactNode = null
            if (g.dueDate) {
              const due = new Date(g.dueDate)
              const today = new Date()
              today.setHours(0, 0, 0, 0)
              const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
              const dateStr = fmtDate(g.dueDate)
              let label: string
              let cls: string
              if (diffDays < 0) {
                label = t('goals.objOverdue')
                cls = 'bg-rose-50 border-rose-200 text-rose-700'
              } else if (diffDays === 0) {
                label = t('goals.objToday')
                cls = 'bg-amber-50 border-amber-300 text-amber-700'
              } else if (diffDays <= 30) {
                label = t('goals.objInDays', { n: diffDays })
                cls = 'bg-amber-50 border-amber-200 text-amber-700'
              } else {
                label = dateStr
                cls = 'bg-ink-muted/5 border-border-subtle text-ink-muted'
              }
              dueBadge = (
                <span className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded px-2 py-0.5 ${cls}`} title={dateStr}>
                  {t('goals.objDue')}: {label}
                </span>
              )
            }

            // KPI ref chip — scrolls to the quarterly KPIs section (id="quarterly-kpis")
            const kpiChip = g.kpiRef ? (
              <button
                type="button"
                onClick={() => document.getElementById('quarterly-kpis')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-1 text-[11px] font-medium border border-brand-blue-200/60 bg-brand-blue-50/60 text-brand-blue rounded px-2 py-0.5 hover:bg-brand-blue-50 transition-colors"
              >
                {t('goals.objScrollToKpi', { kpi: g.kpiRef })}
              </button>
            ) : null

            return (
              <Card key={g.id}>
                <CardContent className="p-4 space-y-3">
                  {/* Label row */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="font-medium text-sm flex-1 min-w-0">
                      {editMode ? (
                        <EditableTextField
                          slug={slug}
                          path={['quarterly', i, 'label']}
                          value={g.label}
                          placeholder={t('goals.objLabelPlaceholder')}
                          editMode={editMode}
                        />
                      ) : (
                        <span>{g.label}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap shrink-0">
                      {/* Due date badge (or editable in edit mode) */}
                      {editMode ? (
                        <span className="text-[11px] text-ink-muted flex items-center gap-1">
                          {t('goals.objDue')}:
                          <EditableTextField
                            slug={slug}
                            path={['quarterly', i, 'dueDate']}
                            value={g.dueDate}
                            placeholder={t('goals.objDueDatePlaceholder')}
                            editMode={editMode}
                          />
                        </span>
                      ) : dueBadge}
                      {/* KPI ref chip (or editable in edit mode) */}
                      {editMode ? (
                        <span className="text-[11px] text-ink-muted flex items-center gap-1">
                          {t('goals.objKpiRef')}:
                          <EditableTextField
                            slug={slug}
                            path={['quarterly', i, 'kpiRef']}
                            value={g.kpiRef}
                            placeholder={t('goals.objKpiRefPlaceholder')}
                            editMode={editMode}
                          />
                        </span>
                      ) : kpiChip}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span>{t('goals.objProgress')}</span>
                      <span className="tabular-nums">
                        {g.current != null ? (
                          <>
                            {editMode ? (
                              <EditableNumberField
                                slug={slug}
                                path={['quarterly', i, 'current']}
                                value={g.current}
                                editMode={editMode}
                              />
                            ) : (
                              <span>{fmtCompact(current)}</span>
                            )}
                            {' '}/{' '}
                            <EditableTargetCell
                              slug={slug}
                              path={['quarterly', i, 'target']}
                              value={g.target}
                              unit={g.unit}
                              editMode={editMode}
                            />
                            {suffix && !editMode ? '' : null}
                          </>
                        ) : (
                          <>
                            <span className="text-ink-muted/50">—</span>
                            {' '}/ {' '}
                            <EditableTargetCell
                              slug={slug}
                              path={['quarterly', i, 'target']}
                              value={g.target}
                              unit={g.unit}
                              editMode={editMode}
                            />
                          </>
                        )}
                        {' '}
                        <span className={`font-semibold ${pct >= 100 ? 'text-brand-green-600' : pct >= 70 ? 'text-brand-blue' : 'text-ink-muted'}`}>
                          ({pct}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-ink-muted/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-brand-green-500' : pct >= 70 ? 'bg-brand-blue' : pct > 0 ? 'bg-amber-400' : 'bg-ink-muted/20'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-lg font-semibold">{t('goals.monthlyTitle')}</h2>
          <span className="text-xs font-medium text-brand-blue bg-brand-blue-50/70 border border-brand-blue-200/60 rounded px-2 py-0.5">
            {periodHeader}
          </span>
        </div>
        <Card>
          <CardContent className="p-5">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyReachData} barGap={4}>
                  <XAxis
                    dataKey="month"
                    stroke={BRAND.inkMuted}
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke={BRAND.inkMuted}
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) => fmtCompact(v)}
                  />
                  <Tooltip content={<MonthlyTooltip />} cursor={{ fill: BRAND.paperMuted }} />
                  {monthlyReachData.some((d) => d.month === todayMonthEn) && (
                    <ReferenceLine
                      x={todayMonthEn}
                      stroke={BRAND.blue}
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{
                        value: t('goals.todayMarker'),
                        position: 'top',
                        fill: BRAND.blue,
                        fontSize: 10,
                        fontWeight: 600,
                      }}
                    />
                  )}
                  <Bar dataKey="target" radius={[6, 6, 0, 0]} fill={BRAND.blue + '40'} />
                  <Bar dataKey="actual" radius={[6, 6, 0, 0]}>
                    {monthlyReachData.map((entry) => {
                      const pct = entry.target === 0 ? 0 : entry.actual / entry.target
                      const color =
                        entry.actual === 0
                          ? '#d4d4d8'
                          : pct >= 1
                            ? PACE_COLORS.ahead
                            : pct >= 0.9
                              ? PACE_COLORS['on-track']
                              : PACE_COLORS.behind
                      return <Cell key={entry.month} fill={color} />
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: BRAND.blue + '40' }} />
                {t('goals.legendTarget')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PACE_COLORS.ahead }} />
                {t('goals.legendAhead')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: PACE_COLORS.behind }} />
                {t('goals.legendBehind')}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('goals.weeklyFocus')}</h2>
        <p className="text-sm text-ink-muted">
          {t('goals.weeklyFocusDesc')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {goals.weekly.map((w, i) => {
            const sendToViktor = () => {
              const parts: string[] = [`Semana ${w.week}:`]
              if (w.channel)    parts.push(`canal ${w.channel}`)
              if (w.message)    parts.push(`mensaje '${w.message}'`)
              if (w.audience)   parts.push(`público ${w.audience}`)
              if (w.focus)      parts.push(`foco ${w.focus}`)
              if (w.kpi)        parts.push(`KPI ${w.kpi}${w.kpiTarget != null ? ` (objetivo ${fmtCompact(w.kpiTarget)})` : ''}`)
              const message = parts.join(', ') + '. ¿Lo preparamos?'
              window.dispatchEvent(new CustomEvent('mp:open-chat', { detail: { message } }))
            }

            return (
              <Card key={w.week} className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between gap-2">
                    <span>{t('goals.week', { n: w.week })}</span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-normal shrink-0">
                      {w.kpi}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2.5 flex-1">
                  {/* Channel */}
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {t('goals.weekChannel')}
                    </p>
                    <EditableTextField
                      slug={slug}
                      path={['weekly', i, 'channel']}
                      value={w.channel}
                      placeholder={t('goals.weekFieldPlaceholder')}
                      editMode={editMode}
                    />
                  </div>
                  {/* Message */}
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {t('goals.weekMessage')}
                    </p>
                    <EditableTextField
                      slug={slug}
                      path={['weekly', i, 'message']}
                      value={w.message}
                      placeholder={t('goals.weekFieldPlaceholder')}
                      multiline
                      editMode={editMode}
                    />
                  </div>
                  {/* Audience */}
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {t('goals.weekAudience')}
                    </p>
                    <EditableTextField
                      slug={slug}
                      path={['weekly', i, 'audience']}
                      value={w.audience}
                      placeholder={t('goals.weekFieldPlaceholder')}
                      editMode={editMode}
                    />
                  </div>
                  {/* Focus */}
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {t('goals.weekFocus')}
                    </p>
                    <EditableTextField
                      slug={slug}
                      path={['weekly', i, 'focus']}
                      value={w.focus}
                      placeholder={t('goals.weekFieldPlaceholder')}
                      multiline
                      editMode={editMode}
                    />
                  </div>
                  {/* KPI + target */}
                  <div className="space-y-0.5">
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {t('goals.weekKpiTarget')}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-ink-muted">{w.kpi}</span>
                      <EditableNumberField
                        slug={slug}
                        path={['weekly', i, 'kpiTarget']}
                        value={w.kpiTarget}
                        editMode={editMode}
                      />
                    </div>
                  </div>
                  {/* Send to Viktor */}
                  <div className="pt-1 mt-auto">
                    <button
                      type="button"
                      onClick={sendToViktor}
                      className="w-full text-xs font-medium rounded border border-brand-blue-200/60 bg-brand-blue-50/50 text-brand-blue px-3 py-1.5 hover:bg-brand-blue-50 transition-colors text-center"
                    >
                      {t('goals.sendToViktor')}
                    </button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {performance?.weeklySummary && (
        <>
          <Separator />
          <section id="weekly-summary" className="space-y-3">
            <h2 className="text-lg font-semibold">
              {t('goals.weekSummary', { n: performance.weeklySummary.week })}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-brand-green-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-brand-green-600">{t('goals.wins')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-2">
                    {performance.weeklySummary.wins.map((x, i) => (
                      <li key={i}>&middot; {x}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-rose-200/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-rose-700">{t('goals.losses')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-2">
                    {performance.weeklySummary.losses.map((x, i) => (
                      <li key={i}>&middot; {x}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-brand-blue-200/60 bg-brand-blue-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-brand-blue">{t('goals.nextTest')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{performance.weeklySummary.nextTest}</p>
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

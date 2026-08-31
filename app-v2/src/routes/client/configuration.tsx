// GF-92 (C) — Configuration page: per-client dashboard toggles.
//
// Deliberately a SEPARATE page from Integration (that page is developer /
// credential-facing; this one is dashboard-user-facing). Two toggles today,
// both stored in org_configs.settings (see api-client.ts / client-data.ts).

import type { KeyboardEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { toast } from 'sonner'
import { Sparkles, CalendarClock, Globe, Search, ChevronDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { InfoHint } from '@/components/ui/info-hint'
import { cn } from '@/lib/utils'
import { isApiEnabled, apiSaveOrgSettings, type OrgSettings } from '@/lib/api-client'
import type { ClientBundle } from '@/lib/client-data'
import { useT } from '@/lib/i18n'

// GF-37 residual — curated fallback for browsers without `Intl.supportedValuesOf`
// (all evergreen browsers this app targets have it, but the API isn't
// universal, so this covers UTC plus GF's actual client base regions rather
// than leaving the picker empty).
const FALLBACK_TIMEZONES = [
  'UTC',
  'Europe/Berlin',
  'Europe/Madrid',
  'America/Montevideo',
  'America/Mexico_City',
]

function listTimezones(current: string): string[] {
  let base: string[]
  try {
    base = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : FALLBACK_TIMEZONES
  } catch {
    base = FALLBACK_TIMEZONES
  }
  // Always include whatever this client currently has stored, even if it
  // falls outside the list above (e.g. a value set before a browser update
  // changed its supported set) — otherwise the select would silently show
  // (and could save) a different zone than what's actually persisted.
  return base.includes(current) ? base : [current, ...base]
}

export default function ConfigurationView() {
  const t = useT()
  const { slug = '' } = useParams<{ slug: string }>()
  const { settings, refetch } = useOutletContext<ClientBundle & { refetch: () => void }>()
  const [local, setLocal] = useState<OrgSettings>(settings)
  const [saving, setSaving] = useState<keyof OrgSettings | null>(null)

  const toggle = async (key: keyof OrgSettings) => {
    if (!isApiEnabled || saving) return
    const prev = local
    const next = { ...local, [key]: !local[key] }
    setLocal(next)
    setSaving(key)
    try {
      const saved = await apiSaveOrgSettings(slug, next)
      setLocal(saved)
      toast.success(t('config.saved'))
      refetch()
    } catch (err) {
      setLocal(prev)
      toast.error(err instanceof Error ? err.message : t('config.saveFailed'))
    } finally {
      setSaving(null)
    }
  }

  // GF-37 residual — same save shape as toggle(), but for a select value
  // instead of a boolean flip.
  const saveTimezone = async (timezone: string) => {
    if (!isApiEnabled || saving || timezone === local.timezone) return
    const prev = local
    const next = { ...local, timezone }
    setLocal(next)
    setSaving('timezone')
    try {
      const saved = await apiSaveOrgSettings(slug, next)
      setLocal(saved)
      toast.success(t('config.saved'))
      refetch()
    } catch (err) {
      setLocal(prev)
      toast.error(err instanceof Error ? err.message : t('config.saveFailed'))
    } finally {
      setSaving(null)
    }
  }

  const timezoneOptions = useMemo(() => listTimezones(local.timezone), [local.timezone])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          {t('config.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">{t('config.heading')}</h1>
        <p className="text-ink-muted mt-1 text-sm max-w-2xl">{t('config.intro')}</p>
      </div>

      {!isApiEnabled && (
        <div className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800">
          {t('config.apiModeRequired')}
        </div>
      )}

      <div className="space-y-4 max-w-2xl">
        <ToggleCard
          icon={Sparkles}
          title={t('config.aiLabel.title')}
          info={t('config.aiLabel.info')}
          checked={local.showAiGeneratedLabel}
          disabled={!isApiEnabled}
          saving={saving === 'showAiGeneratedLabel'}
          onToggle={() => toggle('showAiGeneratedLabel')}
        />
        <ToggleCard
          icon={CalendarClock}
          title={t('config.autoSchedule.title')}
          info={t('config.autoSchedule.info')}
          checked={local.autoScheduleOnApprove}
          disabled={!isApiEnabled}
          saving={saving === 'autoScheduleOnApprove'}
          onToggle={() => toggle('autoScheduleOnApprove')}
        />
        <TimezoneCard
          value={local.timezone}
          options={timezoneOptions}
          disabled={!isApiEnabled}
          saving={saving === 'timezone'}
          onChange={saveTimezone}
        />
      </div>
    </div>
  )
}

function ToggleCard({
  icon: Icon,
  title,
  info,
  checked,
  disabled,
  saving,
  onToggle,
}: {
  icon: typeof Sparkles
  title: string
  info: string
  checked: boolean
  disabled: boolean
  saving: boolean
  onToggle: () => void
}) {
  const t = useT()
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 text-brand-blue shrink-0" />
          <span className="text-sm font-medium truncate">{title}</span>
          <InfoHint aria-label={title}>{info}</InfoHint>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          disabled={disabled || saving}
          onClick={onToggle}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40',
            checked ? 'bg-brand-blue' : 'bg-border-subtle',
            (disabled || saving) && 'opacity-50 cursor-not-allowed',
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform',
              checked ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
          <span className="sr-only">{checked ? t('common.on') : t('common.off')}</span>
        </button>
      </CardContent>
    </Card>
  )
}

function tzLabel(tz: string): string {
  return tz.replace(/_/g, ' ')
}

function matchesQuery(tz: string, q: string): boolean {
  const hay = tzLabel(tz).toLowerCase()
  return hay.includes(q) || tz.toLowerCase().includes(q)
}

// GF-37 residual, Martin design-review round 1 — a flat native <select> with
// ~400 `Intl.supportedValuesOf('timeZone')` entries was reported unusable
// ("too many options, difficult to find, no search"). Replaced with a
// minimal type-to-filter combobox instead of pulling in a new dependency:
// there is no combobox/command primitive anywhere in this repo (checked
// package.json and components/ui/) to reuse, so this borrows the two
// patterns the app already has for "pick one of many" —
// assets.tsx's search-input styling (icon + input classes) and
// calendar.tsx's channel-picker dropdown shape (button trigger,
// role="listbox"/role="option", click-away backdrop) — rather than inventing
// a third visual language for one field.
//
// With the query empty, the list shows only the curated pinned suggestions
// (UTC + GF's actual client base regions, same FALLBACK_TIMEZONES used when
// Intl.supportedValuesOf is unavailable) plus the client's current value if
// it isn't one of those — never the full ~400-entry list unfiltered. Typing
// searches the full option set by both the raw IANA id and the
// space-separated display label (so "berlin" and "Europe/Berlin" both work).
function TimezoneCard({
  value,
  options,
  disabled,
  saving,
  onChange,
}: {
  value: string
  options: string[]
  disabled: boolean
  saving: boolean
  onChange: (timezone: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const pinned = useMemo(() => {
    const seen = new Set<string>()
    const list: string[] = []
    for (const tz of [value, ...FALLBACK_TIMEZONES]) {
      if (options.includes(tz) && !seen.has(tz)) {
        seen.add(tz)
        list.push(tz)
      }
    }
    return list
  }, [value, options])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pinned
    return options.filter((tz) => matchesQuery(tz, q))
  }, [query, options, pinned])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const select = (tz: string) => {
    onChange(tz)
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const tz = filtered[activeIndex]
      if (tz) select(tz)
    }
  }

  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="h-4 w-4 text-brand-blue shrink-0" />
          <span className="text-sm font-medium truncate">{t('config.timezone.title')}</span>
          <InfoHint aria-label={t('config.timezone.title')}>{t('config.timezone.info')}</InfoHint>
        </div>
        <div ref={rootRef} className="relative w-full sm:w-72">
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o)
              setActiveIndex(0)
            }}
            disabled={disabled || saving}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={t('config.timezone.title')}
            className={cn(
              'flex w-full items-center justify-between gap-2 rounded-md border border-border-subtle bg-paper px-3 py-1.5 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-brand-blue/30',
              (disabled || saving) && 'opacity-50 cursor-not-allowed',
            )}
          >
            <span className="truncate">{tzLabel(value)}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" />
              <div className="absolute right-0 z-20 mt-1 w-full sm:w-80 rounded-md border border-border-subtle bg-paper shadow-md">
                <div className="relative p-2 border-b border-border-subtle">
                  <Search className="absolute left-4.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted pointer-events-none" />
                  <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls="config-timezone-listbox"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value)
                      setActiveIndex(0)
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={t('config.timezone.searchPlaceholder')}
                    className="w-full pl-8 pr-2 py-1.5 text-sm rounded border border-border-subtle bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                  />
                </div>
                {!query.trim() && (
                  <p className="px-3 pt-2 text-[10px] uppercase tracking-wider text-ink-muted">
                    {t('config.timezone.suggested')}
                  </p>
                )}
                <ul id="config-timezone-listbox" role="listbox" className="max-h-64 overflow-y-auto py-1">
                  {filtered.length === 0 && (
                    <li className="px-3 py-2 text-xs text-ink-muted">{t('config.timezone.noMatches')}</li>
                  )}
                  {filtered.map((tz, i) => (
                    <li key={tz}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={tz === value}
                        onMouseEnter={() => setActiveIndex(i)}
                        onClick={() => select(tz)}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-paper-muted',
                          i === activeIndex && 'bg-paper-muted',
                          tz === value && 'font-medium text-brand-blue',
                        )}
                      >
                        {tzLabel(tz)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

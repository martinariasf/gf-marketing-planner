// GF-92 (C) — Configuration page: per-client dashboard toggles.
//
// Deliberately a SEPARATE page from Integration (that page is developer /
// credential-facing; this one is dashboard-user-facing). Two toggles today,
// both stored in org_configs.settings (see api-client.ts / client-data.ts).

import { useMemo, useState } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { toast } from 'sonner'
import { Sparkles, CalendarClock, Globe } from 'lucide-react'
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

// GF-37 residual — per-client timezone picker. Same Card shell as ToggleCard
// (same page, same visual language), a native <select> instead of a switch:
// with ~400 IANA zone names a native control gets type-ahead and scrolling
// for free, and this page has no other "pick one of many" pattern to match.
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
  return (
    <Card>
      <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="h-4 w-4 text-brand-blue shrink-0" />
          <span className="text-sm font-medium truncate">{t('config.timezone.title')}</span>
          <InfoHint aria-label={t('config.timezone.title')}>{t('config.timezone.info')}</InfoHint>
        </div>
        <select
          value={value}
          disabled={disabled || saving}
          onChange={(e) => onChange(e.target.value)}
          aria-label={t('config.timezone.title')}
          className={cn(
            'w-full sm:w-auto min-w-[220px] text-sm bg-paper border border-border-subtle rounded-md px-3 py-1.5',
            'focus:outline-none focus:ring-2 focus:ring-brand-blue/30',
            (disabled || saving) && 'opacity-50 cursor-not-allowed',
          )}
        >
          {options.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </CardContent>
    </Card>
  )
}

import type { Lang } from './i18n'

// Maps the app language to a BCP-47 locale used by Intl formatters.
const LOCALES: Record<Lang, string> = {
  en: 'en-US',
  de: 'de-DE',
  es: 'es-ES',
}

// Active locale for all date/number formatting. Kept in sync with the language
// switcher by LanguageProvider (see i18n.tsx) so non-React modules format dates
// and numbers in the selected language without threading `lang` through every call.
let currentLocale: string = LOCALES.en

export function setFormatLocale(lang: Lang): void {
  currentLocale = LOCALES[lang] ?? LOCALES.en
}

// The active BCP-47 locale, for modules that build their own Intl formatters
// (e.g. planning-range month names) and need to match the selected language.
export function getFormatLocale(): string {
  return currentLocale
}

// Formatters are cached per locale+shape so switching language rebuilds them once.
// The cache is intentionally append-only: keys are prefixed with the locale, so a
// locale change reuses/creates a different entry rather than invalidating. Bounded
// by locales × shapes (~3 × 5), so do not "optimise" by dropping the locale prefix.
const numberCache = new Map<string, Intl.NumberFormat>()
const dateCache = new Map<string, Intl.DateTimeFormat>()

function nf(tag: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${currentLocale}|${tag}`
  let f = numberCache.get(key)
  if (!f) {
    f = new Intl.NumberFormat(currentLocale, opts)
    numberCache.set(key, f)
  }
  return f
}

function df(tag: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${currentLocale}|${tag}`
  let f = dateCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(currentLocale, opts)
    dateCache.set(key, f)
  }
  return f
}

export function fmtNumber(n: number): string {
  return nf('full', {}).format(Math.round(n))
}

export function fmtCompact(n: number): string {
  return nf('compact', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

export function fmtDelta(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

export function fmtDate(iso: string): string {
  return df('long', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso))
}

export function fmtDateShort(iso: string): string {
  return df('short', { month: 'short', day: 'numeric' }).format(new Date(iso))
}

export function fmtDateTime(iso: string): string {
  return df('datetime', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

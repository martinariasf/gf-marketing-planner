import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translations } from './i18n-dict'
import { setFormatLocale } from './format'

export type Lang = 'en' | 'de' | 'es'

export const SUPPORTED_LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'en', label: 'English',  short: 'EN' },
  { code: 'de', label: 'Deutsch',  short: 'DE' },
  { code: 'es', label: 'Español',  short: 'ES' },
]

const STORAGE_KEY = 'mp.lang'
const DEFAULT_LANG: Lang = 'en'

function readInitial(): Lang {
  if (typeof window === 'undefined') return DEFAULT_LANG
  const saved = window.localStorage.getItem(STORAGE_KEY)
  if (saved === 'en' || saved === 'de' || saved === 'es') return saved
  return DEFAULT_LANG
}

// Initialise the date/number format locale (format.ts) from the persisted language
// at module load — before any component renders — so the very first paint already
// formats dates in the right language. Subsequent changes are handled in the effect
// below; this avoids a render-time side effect while still covering first paint.
setFormatLocale(readInitial())

interface I18nCtx {
  lang: Lang
  setLang: (l: Lang) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const Ctx = createContext<I18nCtx | null>(null)

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`))
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitial)

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, lang) } catch {/* ignore */}
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo<I18nCtx>(() => {
    const dict = translations[lang]
    const enDict = translations.en
    const t = (key: string, vars?: Record<string, string | number>) => {
      const raw = dict[key] ?? enDict[key] ?? key
      return interpolate(raw, vars)
    }
    // Sync the format locale in the setter (an event handler, not render) so that
    // when the user switches language the date/number formatters are already on the
    // new locale before consumers re-render — no render-phase side effect, no lag.
    const setLang = (l: Lang) => {
      setFormatLocale(l)
      setLangState(l)
    }
    return { lang, setLang, t }
  }, [lang])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useI18n must be used inside <LanguageProvider>')
  return ctx
}

export function useT() {
  return useI18n().t
}

/**
 * Non-hook translation lookup for code that runs outside the React tree or in a
 * class component (e.g. the top-level error boundary). Reads the persisted
 * language directly instead of from context. Falls back to English, then the key.
 */
export function tStatic(key: string, vars?: Record<string, string | number>): string {
  const lang = readInitial()
  const dict = translations[lang]
  const raw = dict[key] ?? translations.en[key] ?? key
  return interpolate(raw, vars)
}

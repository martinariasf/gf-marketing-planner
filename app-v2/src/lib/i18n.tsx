import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { translations } from './i18n-dict'

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
    return { lang, setLang: setLangState, t }
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

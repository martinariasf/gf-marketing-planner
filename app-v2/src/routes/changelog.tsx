import { useEffect } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GFLogo } from '@/components/gf-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { useT } from '@/lib/i18n'
import { CHANGELOG, markChangelogSeen } from '@/lib/changelog'

export default function Changelog() {
  const t = useT()

  // Opening the page clears the "What's new" dot.
  useEffect(() => {
    markChangelogSeen()
  }, [])

  return (
    <div className="min-h-screen bg-paper-muted">
      <header className="border-b border-border-subtle bg-paper">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between gap-3 flex-wrap">
          <Link to="/" className="flex items-center gap-3 group">
            <GFLogo variant="lockup" size="lg" />
            <div className="hidden sm:block border-l border-border-subtle pl-3 ml-1">
              <p className="text-[10px] uppercase tracking-wider text-ink-muted leading-tight">
                Viktor
              </p>
              <h1 className="text-sm font-semibold leading-tight text-ink">
                {t('changelog.title')}
              </h1>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-brand-blue transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              {t('changelog.back')}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-3xl font-bold text-brand-blue tracking-tight">
              {t('changelog.title')}
            </h2>
            <p className="text-ink-muted text-sm mt-1">{t('changelog.subtitle')}</p>
          </div>
        </div>

        <ol className="relative border-l border-border-subtle ml-3 space-y-8">
          {CHANGELOG.map((entry, i) => (
            <motion.li
              key={entry.date}
              className="ml-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06, ease: 'easeOut' }}
            >
              <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-brand-blue ring-4 ring-paper-muted" />
              <Card>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="text-[10px] uppercase tracking-wider text-ink-muted"
                    >
                      {formatDate(entry.date)}
                    </Badge>
                    <h3 className="font-semibold leading-tight text-ink">{entry.title}</h3>
                  </div>
                  <ul className="space-y-1.5">
                    {entry.items.map((item, j) => (
                      <li
                        key={j}
                        className="flex gap-2 text-sm text-ink-muted leading-relaxed"
                      >
                        <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-brand-blue/50" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </motion.li>
          ))}
        </ol>
      </main>
    </div>
  )
}

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

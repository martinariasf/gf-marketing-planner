import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, ExternalLink, Loader2, Sparkles, Users } from 'lucide-react'
import { GFLogo } from '@/components/gf-logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { useT } from '@/lib/i18n'
import { hasUnseenChangelog } from '@/lib/changelog'
import { loadClientIndex } from '@/lib/client-data'
import { cn } from '@/lib/utils'
import type { ClientIndex, ClientIndexEntry, ClientStatus } from '@/types'

const STATUS_TONE: Record<ClientStatus, string> = {
  active:     'bg-brand-green-100 text-brand-green-600 border-brand-green-200',
  demo:       'bg-brand-blue-50  text-brand-blue       border-brand-blue-200',
  onboarding: 'bg-amber-50       text-amber-700        border-amber-200',
  paused:     'bg-neutral-100    text-neutral-700      border-neutral-200',
  archived:   'bg-neutral-50     text-neutral-500      border-neutral-200',
}

export default function ClientPicker() {
  const t = useT()
  const [index, setIndex] = useState<ClientIndex | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadClientIndex()
      .then(setIndex)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
  }, [])

  return (
    <div className="min-h-screen bg-paper-muted">
      <header className="border-b border-border-subtle bg-paper">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between gap-3 flex-wrap">
          <Link to="/" className="flex items-center gap-3 group">
            <GFLogo variant="lockup" size="lg" />
            <div className="hidden sm:block border-l border-border-subtle pl-3 ml-1">
              <p className="text-[10px] uppercase tracking-wider text-ink-muted leading-tight">
                Viktor
              </p>
              <h1 className="text-sm font-semibold leading-tight text-ink">
                {t('home.eyebrow')}
              </h1>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <WhatsNewLink />
            <a
              href="https://gfinnov.com"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-brand-blue transition-colors"
            >
              gfinnov.com
              <ExternalLink className="h-3 w-3" />
            </a>
            <Badge variant="secondary" className="bg-brand-green-100 text-brand-green-600">
              v2
            </Badge>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            {t('home.pickClient')}
          </p>
          <h2 className="text-4xl font-bold text-brand-blue tracking-tight">
            {t('home.heading')}
          </h2>
          <p className="text-ink-muted mt-2 max-w-2xl">
            {t('home.subhead')}
          </p>
        </div>

        {error && (
          <Card className="border-rose-200 bg-rose-50/40">
            <CardContent className="p-5 text-sm text-rose-700">
              {t('home.cannotLoadIndex', { error })}
            </CardContent>
          </Card>
        )}

        {!error && !index && (
          <div className="flex items-center gap-2 text-ink-muted text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('home.loadingClients')}
          </div>
        )}

        {index && index.clients.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-ink-muted">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">
                {t('home.noClients')}
              </p>
            </CardContent>
          </Card>
        )}

        {index && index.clients.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {index.clients.map((c, i) => (
              <ClientCard key={c.slug} client={c} delay={i * 0.05} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function OpenCockpitLabel() {
  const t = useT()
  return <>{t('home.openCockpit')}</>
}

/** "What's new" header link with an unseen-entry dot. */
function WhatsNewLink() {
  const t = useT()
  const [unseen, setUnseen] = useState(false)
  useEffect(() => setUnseen(hasUnseenChangelog()), [])
  return (
    <Link
      to="/changelog"
      className="relative inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-brand-blue transition-colors"
    >
      <Sparkles className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{t('home.whatsNew')}</span>
      {unseen && (
        <span className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full bg-brand-blue ring-2 ring-paper" />
      )}
    </Link>
  )
}

function ClientCard({ client, delay }: { client: ClientIndexEntry; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
    >
      <Link
        to={`/${client.slug}/context`}
        className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue rounded-xl"
      >
        <Card className="h-full hover:shadow-lg transition-all group-hover:-translate-y-0.5">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-11 w-11 rounded-lg bg-brand-blue text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {client.logoInitials}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold leading-tight line-clamp-2">
                    {client.name}
                  </h3>
                  <p className="text-xs text-ink-muted line-clamp-2 mt-0.5">
                    {client.industry}
                  </p>
                </div>
              </div>
              <Badge
                variant="outline"
                className={cn('text-[10px] uppercase tracking-wider shrink-0', STATUS_TONE[client.status])}
              >
                {client.status}
              </Badge>
            </div>

            {client.headline && (
              <p className="text-sm text-ink-muted line-clamp-3 leading-relaxed">
                "{client.headline}"
              </p>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
              <span className="text-ink-muted">
                {client.quarter ?? '—'}
              </span>
              <span className="flex items-center gap-1 text-brand-blue font-medium group-hover:gap-2 transition-all">
                <OpenCockpitLabel />
                <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  )
}

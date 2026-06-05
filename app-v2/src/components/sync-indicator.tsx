// Sync indicator — shows the most recent "viktor.notify" audit event as a
// compact "enviado a Víktor · hace 2 min" badge in the client layout header.
//
// Refresh strategy: the component listens for the window event
// 'mp:viktor-notified' dispatched by EditBar after a successful notify. On that
// event it bumps its own internal refreshKey which re-runs the useEffect.

import { useState, useEffect } from 'react'
import { Send } from 'lucide-react'
import { apiLoadSyncLog, isApiEnabled, type SyncEvent } from '@/lib/api-client'
import { useT } from '@/lib/i18n'

function relativeTime(
  ts: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const diffMs = Date.now() - Date.parse(ts)
  if (isNaN(diffMs) || diffMs < 0) return t('sync.justNow')
  const s = Math.floor(diffMs / 1000)
  if (s < 30) return t('sync.justNow')
  const m = Math.floor(s / 60)
  if (m < 60) return t('sync.minAgo', { n: m })
  const h = Math.floor(m / 60)
  return t('sync.hoursAgo', { n: h })
}

export function SyncIndicator({ slug }: { slug: string }) {
  const t = useT()
  const [latest, setLatest] = useState<SyncEvent | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  // Force re-render every 30s so relative time stays fresh.
  const [, tick] = useState(0)

  // Listen for the window event dispatched by EditBar after a successful notify.
  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1)
    window.addEventListener('mp:viktor-notified', handler)
    return () => window.removeEventListener('mp:viktor-notified', handler)
  }, [])

  useEffect(() => {
    if (!isApiEnabled) return
    apiLoadSyncLog(slug, 1).then((items) => {
      setLatest(items[0] ?? null)
    })
  }, [slug, refreshKey])

  useEffect(() => {
    if (!latest) return
    const id = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(id)
  }, [latest])

  if (!isApiEnabled || !latest) return null

  return (
    <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-ink-muted leading-none select-none">
      <Send className="h-3 w-3 shrink-0 text-brand-blue/70" />
      <span>
        {t('sync.sentToViktor')}
        {' · '}
        {relativeTime(latest.ts, t)}
      </span>
    </span>
  )
}

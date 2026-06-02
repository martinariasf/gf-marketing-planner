import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Lightbulb, ArrowRight, Calendar, Tag } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'
import type { Learning } from '@/types'

type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low'

const CONFIDENCE_TONE: Record<Learning['confidence'], string> = {
  high:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100  text-amber-800   border-amber-200',
  low:    'bg-neutral-100 text-neutral-700 border-neutral-200',
}

export default function LearningsView() {
  const t = useT()
  const { learnings, posts, plan } = useOutletContext<ClientBundle>()
  const [filter, setFilter] = useState<ConfidenceFilter>('all')

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
    const filtered = filter === 'all' ? items : items.filter((i) => i.confidence === filter)
    return [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [items, filter])

  const byConfidence = useMemo(() => {
    const m = { high: 0, medium: 0, low: 0 } as Record<Learning['confidence'], number>
    items.forEach((i) => (m[i.confidence] += 1))
    return m
  }, [items])

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

        <Tabs value={filter} onValueChange={(v) => setFilter(v as ConfidenceFilter)}>
          <TabsList>
            <TabsTrigger value="all">{t('learnings.tabAll', { n: items.length })}</TabsTrigger>
            <TabsTrigger value="high">{t('learnings.tabHigh', { n: byConfidence.high })}</TabsTrigger>
            <TabsTrigger value="medium">{t('learnings.tabMedium', { n: byConfidence.medium })}</TabsTrigger>
            <TabsTrigger value="low">{t('learnings.tabLow', { n: byConfidence.low })}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Separator />

      <div className="space-y-4">
        {filtered.map((item, idx) => {
          const relatedPillar = item.relatedPostId ? pillarByPost[item.relatedPostId] : undefined
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: idx * 0.04 }}
            >
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
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
                      </div>
                      <CardTitle className="text-lg leading-snug">
                        {item.title}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                        {t('learnings.whatHappened')}
                      </p>
                      <p className="text-sm leading-relaxed">{item.whatHappened}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                        {t('learnings.lesson')}
                      </p>
                      <p className="text-sm leading-relaxed">{item.lesson}</p>
                    </div>
                  </div>

                  <div className="rounded-md border-l-4 border-l-brand-blue bg-brand-blue-50/30 p-4">
                    <p className="text-[10px] uppercase tracking-wider text-brand-blue font-semibold mb-1 flex items-center gap-1">
                      <ArrowRight className="h-3 w-3" />
                      {t('learnings.behaviorChange')}
                    </p>
                    <p className="text-sm leading-relaxed font-medium">
                      {item.recommendedBehaviorChange}
                    </p>
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

import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pillar } from '@/components/pillar'
import {
  Sparkles,
  Lightbulb,
  Wand2,
  Replace,
  Scale,
  Compass,
  Repeat,
  GitFork,
  Copy,
  Check,
  Clock,
  X,
} from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { toast, Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import type { ClientBundle } from '@/lib/client-data'
import type { Suggestion, SuggestionKind, SuggestionStatus, Confidence } from '@/types'
import { isApiEnabled, apiPatchSuggestion } from '@/lib/api-client'

const KIND_META: Record<SuggestionKind, { Icon: typeof Sparkles; label: string; tone: string }> = {
  post_idea:       { Icon: Lightbulb, label: 'Post idea',       tone: 'bg-amber-50  text-amber-700' },
  hook_rewrite:    { Icon: Wand2,     label: 'Hook rewrite',    tone: 'bg-violet-50 text-violet-700' },
  cta_alternative: { Icon: Replace,   label: 'CTA alternative', tone: 'bg-cyan-50   text-cyan-700' },
  pillar_balance:  { Icon: Scale,     label: 'Pillar balance',  tone: 'bg-blue-50   text-blue-700' },
  next_action:     { Icon: Compass,   label: 'Next action',     tone: 'bg-brand-blue-50 text-brand-blue' },
  follow_up:       { Icon: Repeat,    label: 'Follow-up',       tone: 'bg-brand-green-100 text-brand-green-600' },
  pivot:           { Icon: GitFork,   label: 'Pivot',           tone: 'bg-rose-50   text-rose-700' },
}

const CONFIDENCE_TONE: Record<Confidence, string> = {
  high:   'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100   text-amber-800   border-amber-200',
  low:    'bg-neutral-100 text-neutral-700 border-neutral-200',
}

type Filter = 'open' | 'accepted' | 'dismissed' | 'all'

export default function SuggestionsView() {
  const { suggestions, plan, slug, refetch } = useOutletContext<
    ClientBundle & { refetch: () => void }
  >()
  const [filter, setFilter] = useState<Filter>('open')

  const pillarColor = useMemo(() => {
    const m: Record<string, string> = {}
    plan.pillars.forEach((p) => (m[p.name] = p.color))
    return m
  }, [plan.pillars])

  const items = suggestions?.items ?? []
  const counts = useMemo(() => {
    const c = { open: 0, accepted: 0, dismissed: 0 } as Record<SuggestionStatus, number>
    items.forEach((i) => (c[i.status] += 1))
    return c
  }, [items])

  const filtered = useMemo(() => {
    const subset = filter === 'all' ? items : items.filter((i) => i.status === filter)
    return [...subset].sort((a, b) => {
      // open first, then by confidence (high → low), then newest
      const cw = { high: 3, medium: 2, low: 1 }
      return cw[b.confidence] - cw[a.confidence] || b.createdAt.localeCompare(a.createdAt)
    })
  }, [items, filter])

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-ink-muted">
          <Sparkles className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            No <code>suggestions.json</code> yet. Viktor's <code>ai-suggestions</code>{' '}
            skill writes this file when he spots an opportunity in the data.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Toaster position="bottom-right" />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            AI suggestions
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">
            What does Viktor think you should do next?
          </h1>
          <p className="text-ink-muted mt-1 text-sm max-w-2xl">
            Proactive recommendations grounded in your performance, learnings,
            and brief. Each one is a one-line copy-paste into Telegram - the
            agent does the actual writing.
          </p>
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="open">
              Open
              {counts.open > 0 && (
                <Badge className="ml-1.5 bg-brand-blue text-white">{counts.open}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="accepted">Accepted ({counts.accepted})</TabsTrigger>
            <TabsTrigger value="dismissed">Dismissed ({counts.dismissed})</TabsTrigger>
            <TabsTrigger value="all">All ({items.length})</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <Separator />

      <AnimatePresence mode="popLayout">
        <div className="space-y-3">
          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.22, delay: i * 0.03 }}
            >
              <SuggestionCard
                suggestion={s}
                pillarColor={pillarColor[s.relatedPillar ?? '']}
                slug={slug}
                onChanged={refetch}
              />
            </motion.div>
          ))}
        </div>
      </AnimatePresence>

      {filtered.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-ink-muted text-sm">
            Nothing in this tab.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SuggestionCard({
  suggestion,
  pillarColor,
  slug,
  onChanged,
}: {
  suggestion: Suggestion
  pillarColor?: string
  slug: string
  onChanged: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const { Icon, label, tone } = KIND_META[suggestion.kind]

  async function setStatus(next: 'accepted' | 'dismissed') {
    if (busy) return
    setBusy(true)
    try {
      await apiPatchSuggestion(slug, suggestion.id, { status: next })
      toast(`${suggestion.id} → ${next}`, { duration: 1800 })
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(suggestion.suggestedAction).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    toast('Copied. Paste into Viktor on Telegram.', {
      description: <code className="font-mono text-xs">{suggestion.suggestedAction}</code>,
    })
  }

  const dismiss = () => {
    const cmd = `dismiss ${suggestion.id}`
    navigator.clipboard.writeText(cmd).catch(() => {})
    toast('Copied dismiss command.', {
      description: <code className="font-mono text-xs">{cmd}</code>,
    })
  }

  const isOpen = suggestion.status === 'open'
  const expired = suggestion.expiresAt
    ? new Date(suggestion.expiresAt) < new Date()
    : false

  return (
    <Card className={cn(
      'transition-colors',
      isOpen ? 'hover:border-brand-blue/40' : 'opacity-70',
    )}>
      <CardContent className="p-5 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[10px]">
              {suggestion.id}
            </Badge>
            <Badge className={cn('text-[10px] flex items-center gap-1', tone)}>
              <Icon className="h-3 w-3" />
              {label}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wider', CONFIDENCE_TONE[suggestion.confidence])}>
              {suggestion.confidence}
            </Badge>
            {suggestion.status === 'accepted' && (
              <Badge className="text-[10px] bg-emerald-100 text-emerald-700">
                <Check className="h-3 w-3 mr-1" /> Accepted
              </Badge>
            )}
            {suggestion.status === 'dismissed' && (
              <Badge className="text-[10px] bg-neutral-100 text-neutral-700">
                <X className="h-3 w-3 mr-1" /> Dismissed
              </Badge>
            )}
            {expired && isOpen && (
              <Badge className="text-[10px] bg-rose-50 text-rose-700">
                <Clock className="h-3 w-3 mr-1" /> Expired
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-ink-muted">
            {fmtDate(suggestion.createdAt)}
          </span>
        </div>

        {/* Title + rationale */}
        <div>
          <h3 className="font-semibold leading-snug mb-1.5">{suggestion.title}</h3>
          <p className="text-sm text-ink-muted leading-relaxed">{suggestion.rationale}</p>
        </div>

        {/* Related entities */}
        {(suggestion.relatedPostId || suggestion.relatedCampaign || suggestion.relatedPillar) && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {suggestion.relatedPostId && (
              <Badge variant="outline" className="font-mono text-[10px]">
                post {suggestion.relatedPostId}
              </Badge>
            )}
            {suggestion.relatedCampaign && (
              <Badge variant="secondary" className="bg-paper-muted text-ink-muted">
                {suggestion.relatedCampaign}
              </Badge>
            )}
            {suggestion.relatedPillar && (
              <Pillar name={suggestion.relatedPillar} color={pillarColor} />
            )}
          </div>
        )}

        {/* Suggested action + CTAs */}
        <div className="rounded-md bg-paper-muted border border-border-subtle p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted">
            Paste this into Viktor on Telegram to accept
          </p>
          <code className="block font-mono text-xs text-brand-blue break-all">
            {suggestion.suggestedAction}
          </code>
          {isOpen && (
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <Button size="sm" onClick={copy} className="bg-brand-blue hover:bg-brand-blue-600">
                {copied ? (
                  <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</>
                ) : (
                  <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy & accept</>
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={dismiss}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                Dismiss (copy)
              </Button>
              {isApiEnabled && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => setStatus('accepted')}
                    disabled={busy}
                  >
                    <Check className="h-3.5 w-3.5 mr-1.5" /> Accept (staging)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                    onClick={() => setStatus('dismissed')}
                    disabled={busy}
                  >
                    <X className="h-3.5 w-3.5 mr-1.5" /> Dismiss (staging)
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Decision footer (for accepted / dismissed) */}
        {suggestion.decidedAt && (
          <div className="border-t border-border-subtle pt-3 text-xs text-ink-muted">
            {suggestion.status === 'accepted' ? '✓' : '✗'}{' '}
            <span className="font-medium">{suggestion.decidedBy}</span> on{' '}
            {fmtDate(suggestion.decidedAt)}
            {suggestion.decisionNote && (
              <span> — "{suggestion.decisionNote}"</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Pillar } from '@/components/pillar'
import { MessageSquare, Copy, Check, Send, Ban, ShieldCheck, Clock, Calendar, Circle } from 'lucide-react'
import { fmtDateTime, fmtDateShort } from '@/lib/format'
import { toast, Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import type { ClientBundle } from '@/lib/client-data'
import type { Post, ApprovalLogEntry } from '@/types'
import { isApiEnabled } from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import { ApprovalKanban } from '@/components/approval-kanban'

// Covers both the legacy disk-log verbs (approve/reject/block/unblock) and the
// PB approvals_v2 result states (approved/rejected/in_review/scheduled). An
// unknown action falls back to FALLBACK_ICON so the whole page never blanks
// on a future action type — guard against the bug that was causing white
// screens when chat-driven approvals_v2 rows showed up in the feed.
const ACTION_ICON = {
  approve:   { Icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50' },
  approved:  { Icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50' },
  reject:    { Icon: Ban,         color: 'text-rose-700 bg-rose-50' },
  rejected:  { Icon: Ban,         color: 'text-rose-700 bg-rose-50' },
  block:     { Icon: Ban,         color: 'text-amber-700 bg-amber-50' },
  unblock:   { Icon: ShieldCheck, color: 'text-blue-700 bg-blue-50' },
  in_review: { Icon: Clock,       color: 'text-blue-700 bg-blue-50' },
  scheduled: { Icon: Calendar,    color: 'text-indigo-700 bg-indigo-50' },
} as const

const FALLBACK_ICON = { Icon: Circle, color: 'text-ink-muted bg-paper-muted' }

export default function ApprovalsView() {
  const t = useT()
  const { posts, approvalsLog, plan, slug, refetch } = useOutletContext<
    ClientBundle & { refetch: () => void }
  >()

  const pillarColor = useMemo(() => {
    const m: Record<string, string> = {}
    plan.pillars.forEach((p) => (m[p.name] = p.color))
    return m
  }, [plan.pillars])

  const waiting = useMemo(
    () =>
      posts
        .filter((p) =>
          ['in_review', 'drafting', 'needs_revision'].includes(p.status),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [posts],
  )

  const recentApprovals = useMemo(
    () =>
      [...approvalsLog]
        .sort((a, b) => b.ts.localeCompare(a.ts))
        .slice(0, 20),
    [approvalsLog],
  )

  const batchCommand =
    waiting.length > 0
      ? `approve ${waiting.map((p) => p.id).join(' ')}`
      : null

  return (
    <div className="space-y-6">
      <Toaster position="bottom-right" />

      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          {t('approvals.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">
          {t('approvals.heading')}
        </h1>
      </div>

      <TelegramBanner batchCommand={batchCommand} waitingCount={waiting.length} />

      {isApiEnabled && (
        <>
          <Separator />
          <section className="space-y-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">{t('approvals.kanbanTitle')}</h2>
              <span className="text-[11px] text-ink-muted">
                {t('approvals.kanbanHint')}
              </span>
            </div>
            <ApprovalKanban
              slug={slug}
              posts={posts}
              pillarColor={pillarColor}
              onChanged={refetch}
            />
          </section>
        </>
      )}

      <Separator />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{t('approvals.waitingTitle')}</h2>
          <span className="text-sm text-ink-muted">
            {waiting.length === 1
              ? t('approvals.waitingCount', { n: waiting.length })
              : t('approvals.waitingCountPlural', { n: waiting.length })}
          </span>
        </div>

        {waiting.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-ink-muted">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-brand-green-500" />
              <p className="text-sm">{t('approvals.nothingPending')}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {waiting.map((p) => (
              <WaitingRow key={p.id} post={p} pillarColor={pillarColor[p.pillar]} />
            ))}
          </div>
        )}
      </section>

      <Separator />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('approvals.recentActivity')}</h2>
        <p className="text-sm text-ink-muted">
          {t('approvals.recentHint')}
        </p>
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border-subtle">
              {recentApprovals.map((e, i) => (
                <LogRow key={i} entry={e} />
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function TelegramBanner({
  batchCommand,
  waitingCount,
}: {
  batchCommand: string | null
  waitingCount: number
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (!batchCommand) return
    navigator.clipboard.writeText(batchCommand).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    toast(t('approvals.copiedPaste'), {
      icon: <MessageSquare className="h-4 w-4" />,
    })
  }

  return (
    <Card className="border-brand-blue-200/60 bg-brand-blue-50/30 overflow-hidden">
      <CardContent className="p-5 flex items-start gap-4 flex-wrap">
        <div className="h-10 w-10 rounded-full bg-brand-blue text-white flex items-center justify-center shrink-0">
          <MessageSquare className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold mb-1">
            {t('approvals.bannerTitle')}
          </p>
          <p className="text-sm text-ink-muted">
            {t('approvals.bannerBodyPrefix')}<code className="bg-paper-muted px-1.5 py-0.5 rounded text-brand-blue text-xs">approve &lt;id&gt;</code>{t('approvals.bannerBodySuffix')}
          </p>
          {batchCommand && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <code className="bg-paper border border-border-subtle rounded px-2 py-1 text-xs font-mono">
                {batchCommand}
              </code>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? t('common.copied') : t('approvals.copyBatch')}
              </Button>
              <span className="text-[11px] text-ink-muted">
                {t('approvals.approvesAll', { n: waitingCount })}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function WaitingRow({
  post,
  pillarColor,
}: {
  post: Post
  pillarColor?: string
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const cmd = `approve ${post.id}`
  const copy = () => {
    navigator.clipboard.writeText(cmd).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    toast(t('approvals.copiedPaste'), {
      description: <code className="font-mono text-xs">{cmd}</code>,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
    >
      <Card>
        <CardContent className="p-4 flex items-start gap-4 flex-wrap">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="font-mono text-[10px]">
                {post.id}
              </Badge>
              <span className="text-[11px] text-ink-muted">
                {fmtDateShort(post.date)} · {post.channel} · {post.format}
              </span>
              <Badge variant="secondary" className={cn(
                'capitalize',
                post.status === 'in_review' && 'bg-blue-50 text-blue-700',
                post.status === 'drafting' && 'bg-amber-50 text-amber-700',
                post.status === 'needs_revision' && 'bg-orange-50 text-orange-700',
              )}>
                {post.status.replace('_', ' ')}
              </Badge>
            </div>
            <h3 className="font-semibold">{post.title}</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Pillar name={post.pillar} color={pillarColor} />
              {post.campaign && (
                <span className="text-[11px] text-ink-muted">
                  {t('approvals.in')} {post.campaign}
                </span>
              )}
              <span className="text-[11px] text-ink-muted">
                v{post.approval.version}
              </span>
            </div>
            {post.approval.blockerReason && (
              <p className="text-[12px] text-rose-700 bg-rose-50 px-2 py-1 rounded inline-block">
                {post.approval.blockerReason}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Button size="sm" onClick={copy} className="bg-brand-blue hover:bg-brand-blue-600">
              {copied ? (
                <><Check className="h-3.5 w-3.5 mr-1.5" /> {t('common.copied')}</>
              ) : (
                <><Send className="h-3.5 w-3.5 mr-1.5" /> {t('common.copy')} <code className="ml-1 bg-white/15 px-1 rounded">approve {post.id}</code></>
              )}
            </Button>
            <span className="text-[10px] text-ink-muted">{t('approvals.pasteIntoViktor')}</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function LogRow({ entry }: { entry: ApprovalLogEntry }) {
  const t = useT()
  const { Icon, color } = ACTION_ICON[entry.action] ?? FALLBACK_ICON
  const label = entry.action.replace('_', ' ')
  return (
    <li className="px-4 py-3 flex items-start gap-3">
      <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0', color)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-semibold capitalize">{label}</span>
          {' '}<code className="font-mono text-xs bg-paper-muted px-1 rounded">{entry.postId}</code>
          {' '}by <span className="font-medium">{entry.actor}</span>
          {entry.via && <> <span className="text-ink-muted">{t('approvals.via')} {entry.via}</span></>}
        </p>
        {(entry.note || entry.reason) && (
          <p className="text-xs text-ink-muted mt-0.5">
            {entry.note ?? entry.reason}
          </p>
        )}
      </div>
      <span className="text-[11px] text-ink-muted shrink-0 whitespace-nowrap">
        {fmtDateTime(entry.ts)}
      </span>
    </li>
  )
}

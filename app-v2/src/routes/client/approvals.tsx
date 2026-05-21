import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Pillar } from '@/components/pillar'
import { MessageSquare, Copy, Check, Send, Ban, ShieldCheck } from 'lucide-react'
import { fmtDateTime, fmtDateShort } from '@/lib/format'
import { toast, Toaster } from 'sonner'
import { cn } from '@/lib/utils'
import type { ClientBundle } from '@/lib/client-data'
import type { Post, ApprovalLogEntry } from '@/types'

const ACTION_ICON = {
  approve: { Icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50' },
  reject:  { Icon: Ban,         color: 'text-rose-700 bg-rose-50' },
  block:   { Icon: Ban,         color: 'text-amber-700 bg-amber-50' },
  unblock: { Icon: ShieldCheck, color: 'text-blue-700 bg-blue-50' },
} as const

export default function ApprovalsView() {
  const { posts, approvalsLog, plan } = useOutletContext<ClientBundle>()

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
          Approvals
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">
          What is Viktor waiting on?
        </h1>
      </div>

      <TelegramBanner batchCommand={batchCommand} waitingCount={waiting.length} />

      <Separator />

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Waiting for review</h2>
          <span className="text-sm text-ink-muted">
            {waiting.length} item{waiting.length === 1 ? '' : 's'}
          </span>
        </div>

        {waiting.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-ink-muted">
              <ShieldCheck className="h-8 w-8 mx-auto mb-2 text-brand-green-500" />
              <p className="text-sm">Nothing pending. Viktor is unblocked.</p>
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
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <p className="text-sm text-ink-muted">
          Append-only audit log. Every line is a literal action — what
          Pilar or Martin sent and when Viktor applied it.
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
  const [copied, setCopied] = useState(false)
  const copy = () => {
    if (!batchCommand) return
    navigator.clipboard.writeText(batchCommand).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    toast('Copied. Paste into Viktor on Telegram.', {
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
            Approval is literal. It happens on Telegram.
          </p>
          <p className="text-sm text-ink-muted">
            Send <code className="bg-paper-muted px-1.5 py-0.5 rounded text-brand-blue text-xs">approve &lt;id&gt;</code>
            {' '}(or multiple IDs space-separated) to Viktor. He flips
            the post status, appends to <code className="text-xs">approvals.log</code>,
            queues Postiz, and pushes a commit.
          </p>
          {batchCommand && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <code className="bg-paper border border-border-subtle rounded px-2 py-1 text-xs font-mono">
                {batchCommand}
              </code>
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                {copied ? 'Copied' : 'Copy batch'}
              </Button>
              <span className="text-[11px] text-ink-muted">
                Approves all {waitingCount} pending in one message.
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
  const [copied, setCopied] = useState(false)
  const cmd = `approve ${post.id}`
  const copy = () => {
    navigator.clipboard.writeText(cmd).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
    toast('Copied. Paste into Viktor on Telegram.', {
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
                  in {post.campaign}
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
                <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</>
              ) : (
                <><Send className="h-3.5 w-3.5 mr-1.5" /> Copy <code className="ml-1 bg-white/15 px-1 rounded">approve {post.id}</code></>
              )}
            </Button>
            <span className="text-[10px] text-ink-muted">paste into Viktor</span>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

function LogRow({ entry }: { entry: ApprovalLogEntry }) {
  const { Icon, color } = ACTION_ICON[entry.action]
  return (
    <li className="px-4 py-3 flex items-start gap-3">
      <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0', color)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-semibold capitalize">{entry.action}</span>
          {' '}<code className="font-mono text-xs bg-paper-muted px-1 rounded">{entry.postId}</code>
          {' '}by <span className="font-medium">{entry.actor}</span>
          {' '}<span className="text-ink-muted">via {entry.via}</span>
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

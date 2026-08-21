// GF-107 — the workflow status control and its colour tokens, lifted out of
// calendar.tsx so both the calendar route and the Month-view copy pane can use
// them without an import cycle. Moved verbatim; the only change is the new
// `tinted` prop, which paints the dropdown trigger in the state's own colour
// (Draft amber, Review blue, Approved green, Programmed violet, Needs revision
// orange, Rejected rose). Those tones already existed in `WORKFLOW[].tone` —
// the badge used them, the control you actually click did not.

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AlertTriangle, Check, ChevronDown, ExternalLink, Loader2, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { fmtDate } from '@/lib/format'
import { dateTiming } from '@/lib/planning-range'
import { WORKFLOW, isPublished, laneFor, publishedUrl, scheduleConfirmationFor } from '@/lib/post-status'
import type { ApprovalDecision } from '@/lib/api-client'
import type { Post } from '@/types'

export const STATUS_STYLES: Record<string, string> = {
  idea:           'bg-neutral-100 text-neutral-700',
  drafting:       'bg-amber-50 text-amber-700',
  in_review:      'bg-blue-50 text-blue-700',
  needs_revision: 'bg-orange-50 text-orange-700',
  approved:       'bg-emerald-50 text-emerald-700',
  scheduled:      'bg-violet-50 text-violet-700',
  published:      'bg-brand-green-100 text-brand-green-600',
  rejected:       'bg-rose-50 text-rose-700',
}

/**
 * GF-23 — workflow status control. For a live (non-published) post it is a
 * dropdown over the full workflow (Draft/Review/Approved/Programmed/Rechecked/
 * Rejected). A published post is read-only: it shows the Published badge and a
 * link to the live Postiz post when one is known.
 */
export function StatusSelect({
  post,
  busy,
  onSetStatus,
  size = 'sm',
  tinted = false,
}: {
  post: Post
  busy: boolean
  onSetStatus: (decision: ApprovalDecision) => void
  size?: 'sm' | 'xs'
  /** GF-107 — paint the trigger in the current state's own colour. */
  tinted?: boolean
}) {
  const t = useT()

  if (isPublished(post)) {
    const url = publishedUrl(post)
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <Badge variant="secondary" className={cn(size === 'xs' ? 'text-[9px]' : 'text-[10px]', STATUS_STYLES.published)}>
          <Send className={cn(size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3', 'mr-1')} />
          {t('status.published')}
        </Badge>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1 font-medium text-brand-blue hover:underline',
              size === 'xs' ? 'text-[10px]' : 'text-xs',
            )}
          >
            <ExternalLink className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            {t('calendar.viewPublished')}
          </a>
        )}
      </span>
    )
  }

  const current = laneFor(post) as ApprovalDecision
  const step = WORKFLOW.find((s) => s.key === current) ?? WORKFLOW[1]
  const StepIcon = step.Icon
  // GF-92 — the "scheduled" label doesn't mean a provider job actually exists;
  // surface the real confirmation (or its absence) next to the control.
  const scheduleConfirmation = current === 'scheduled' ? scheduleConfirmationFor(post) : null
  return (
    <span className="inline-flex items-center gap-1.5 flex-wrap">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            className={cn(
              'gap-1.5',
              size === 'xs' && 'h-6 px-2 text-[10px]',
              tinted && cn(step.tone, 'font-semibold hover:opacity-90'),
            )}
          >
            {busy ? (
              <Loader2 className={size === 'xs' ? 'h-3 w-3 animate-spin' : 'h-3.5 w-3.5 animate-spin'} />
            ) : (
              <StepIcon className={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            )}
            {t(step.labelKey)}
            <ChevronDown className={size === 'xs' ? 'h-3 w-3 opacity-60' : 'h-3.5 w-3.5 opacity-60'} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {WORKFLOW.map((s) => {
            const Icon = s.Icon
            // GF-37 — block scheduling (Programmed) a post dated in the past.
            const pastSchedule = s.key === 'scheduled' && dateTiming(post.date) === 'past'
            return (
              <DropdownMenuItem
                key={s.key}
                disabled={s.key === current || pastSchedule}
                onClick={() => onSetStatus(s.key)}
                title={pastSchedule ? t('calendar.pastDateNoSchedule') : undefined}
              >
                <Icon className="h-3.5 w-3.5 mr-2" />
                {t(s.labelKey)}
                {s.key === current && <Check className="ml-auto h-3.5 w-3.5 text-brand-green-600" />}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {scheduleConfirmation?.kind === 'confirmed' && (
        <span className={cn('text-ink-muted', size === 'xs' ? 'text-[9px]' : 'text-[10px]')}>
          {t('schedule.confirmedAt', {
            date: scheduleConfirmation.scheduledFor ? fmtDate(scheduleConfirmation.scheduledFor) : '—',
            provider: scheduleConfirmation.provider ?? '—',
          })}
        </span>
      )}
      {scheduleConfirmation?.kind === 'failed' && (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-rose-700',
            size === 'xs' ? 'text-[9px]' : 'text-[10px]',
          )}
        >
          <AlertTriangle className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          {t('schedule.failed', { error: scheduleConfirmation.lastError })}
        </span>
      )}
      {scheduleConfirmation?.kind === 'missingJob' && (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-amber-700',
            size === 'xs' ? 'text-[9px]' : 'text-[10px]',
          )}
        >
          <AlertTriangle className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          {t('schedule.notConfirmed')}
        </span>
      )}
    </span>
  )
}

export function StatusBadges({ post }: { post: Post }) {
  const approval = post.approval.status || post.status
  const isPublished = post.status === 'published' || Boolean(post.publishing.publishedAt || post.publishing.publicUrl)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Badge variant="secondary" className={cn('text-[9px]', STATUS_STYLES[approval] ?? STATUS_STYLES[post.status])}>
        {approval.replace('_', ' ')}
      </Badge>
      {isPublished && (
        <Badge variant="secondary" className={cn('text-[9px]', STATUS_STYLES.published)}>
          published
        </Badge>
      )}
    </div>
  )
}

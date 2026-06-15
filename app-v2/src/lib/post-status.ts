// GF-23 — the single source of truth for the content workflow shared by the
// calendar status selector and the approval kanban, so the two never drift
// ("It should contemplate what is also shown in the Kanban").
//
// Six settable states map 1:1 onto the API's APPROVAL_DECISIONS. `published` is
// a seventh, terminal lane that is NEVER user-settable: a post only enters it
// after Postiz publishes it, surfaced via `publishing.publishedAt`/`publicUrl`.

import { PenLine, Eye, ShieldCheck, CalendarClock, RotateCcw, Ban, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ApprovalDecision } from '@/lib/api-client'
import type { Post } from '@/types'

export type WorkflowKey = ApprovalDecision
export type Lane = WorkflowKey | 'published'

export interface WorkflowStep {
  key: WorkflowKey
  /** i18n key for the human label (Draft, Review, Approved, …). */
  labelKey: string
  Icon: LucideIcon
  /** Column header / badge tone. */
  tone: string
  /** Card border tone in the kanban. */
  cardTone: string
}

// Notion GF-23 order: Draft → Review → Approved → Programmed → Rechecked, plus
// Rejected (kept from the existing flow so reject is not a regression).
export const WORKFLOW: WorkflowStep[] = [
  { key: 'drafting',       labelKey: 'status.drafting',       Icon: PenLine,       tone: 'text-amber-700 bg-amber-50 border-amber-200',       cardTone: 'border-amber-100' },
  { key: 'in_review',      labelKey: 'status.in_review',      Icon: Eye,           tone: 'text-blue-700 bg-blue-50 border-blue-200',         cardTone: 'border-blue-100' },
  { key: 'approved',       labelKey: 'status.approved',       Icon: ShieldCheck,   tone: 'text-emerald-700 bg-emerald-50 border-emerald-200', cardTone: 'border-emerald-100' },
  { key: 'scheduled',      labelKey: 'status.scheduled',      Icon: CalendarClock, tone: 'text-violet-700 bg-violet-50 border-violet-200',   cardTone: 'border-violet-100' },
  { key: 'needs_revision', labelKey: 'status.needs_revision', Icon: RotateCcw,     tone: 'text-orange-700 bg-orange-50 border-orange-200',   cardTone: 'border-orange-100' },
  { key: 'rejected',       labelKey: 'status.rejected',       Icon: Ban,           tone: 'text-rose-700 bg-rose-50 border-rose-200',         cardTone: 'border-rose-100' },
]

// The terminal, read-only Published lane.
export const PUBLISHED_STEP = {
  key: 'published' as const,
  labelKey: 'status.published',
  Icon: Send,
  tone: 'text-brand-green-600 bg-brand-green-100 border-brand-green-300',
  cardTone: 'border-brand-green-200',
}

export const WORKFLOW_KEYS: WorkflowKey[] = WORKFLOW.map((s) => s.key)

/** True once Postiz has published the post (or its status says so). */
export function isPublished(post: Post): boolean {
  return (
    post.status === 'published' ||
    Boolean(post.publishing?.publishedAt || post.publishing?.publicUrl)
  )
}

/** Which lane/column a post belongs to. Published wins over everything. */
export function laneFor(post: Post): Lane {
  if (isPublished(post)) return 'published'
  const s = (post.approval?.status ?? post.status) as string
  switch (s) {
    case 'approved':
      return 'approved'
    case 'scheduled':
      return 'scheduled'
    case 'rejected':
      return 'rejected'
    case 'needs_revision':
      return 'needs_revision'
    case 'drafting':
    case 'idea':
      return 'drafting'
    default:
      return 'in_review'
  }
}

/** The live Postiz post URL, when present. */
export function publishedUrl(post: Post): string | null {
  return post.publishing?.publicUrl ?? null
}

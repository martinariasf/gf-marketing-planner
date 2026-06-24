// Approval kanban — drag-to-move content board.
//
// GF-23: the columns are the full content workflow (Draft, Review, Approved,
// Programmed, Rechecked, Rejected) plus a terminal, read-only **Published**
// column a post only reaches once Postiz published it. Dragging a card into a
// workflow column optimistically updates the local view, fires POST
// /api/v1/clients/:slug/approvals, and asks the parent to refetch. The
// Published column accepts no drops and shows a link to the live post when
// available.
//
// GF-43: the per-card "→ Column" buttons were removed — moving a card is done by
// dragging it between columns. (Touch/keyboard users now rely on native HTML5
// drag; revisit with a lighter affordance if that proves insufficient.)
//
// Implementation note: native HTML5 drag-and-drop (no @dnd-kit) — ~0 deps.

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fmtDateShort } from '@/lib/format'
import { apiSetApproval, type ApprovalDecision } from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import {
  WORKFLOW,
  PUBLISHED_STEP,
  laneFor,
  publishedUrl,
  postSeqMap,
  type Lane,
} from '@/lib/post-status'
import type { Post } from '@/types'

export function ApprovalKanban({
  slug,
  posts,
  pillarColor,
  onChanged,
}: {
  slug: string
  posts: Post[]
  pillarColor: Record<string, string>
  onChanged: () => void
}) {
  const t = useT()
  // GF-44 — friendly per-client "Post N" name from the same post set.
  const seqMap = useMemo(() => postSeqMap(posts), [posts])
  const nameOf = (post: Post) => {
    const n = seqMap.get(post.id)
    return n ? t('post.nameN', { n }) : post.id
  }
  // Optimistic overrides keyed by postId (workflow lanes only; never Published).
  const [overrides, setOverrides] = useState<Record<string, ApprovalDecision>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  // Currently-dragged post id and the column hovered as drop target.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<ApprovalDecision | null>(null)

  const laneOf = (post: Post): Lane => {
    // An optimistic override only applies while the post is still in a workflow
    // lane; a published post can never be moved back out.
    const base = laneFor(post)
    if (base === 'published') return 'published'
    return overrides[post.id] ?? base
  }

  const grouped = useMemo(() => {
    const out: Record<Lane, Post[]> = {
      drafting: [],
      in_review: [],
      approved: [],
      scheduled: [],
      needs_revision: [],
      rejected: [],
      published: [],
    }
    for (const p of posts) out[laneOf(p)].push(p)
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, overrides])

  async function move(post: Post, decision: ApprovalDecision) {
    if (pending.has(post.id)) return
    const prev = overrides[post.id]
    setOverrides((o) => ({ ...o, [post.id]: decision }))
    setPending((p) => new Set(p).add(post.id))
    try {
      await apiSetApproval(slug, post.id, decision)
      toast(`${nameOf(post)} → ${t(`status.${decision}`)}`, { duration: 1800 })
      onChanged()
    } catch (err) {
      setOverrides((o) => {
        const next = { ...o }
        if (prev) next[post.id] = prev
        else delete next[post.id]
        return next
      })
      toast.error(err instanceof Error ? err.message : t('approvals.approvalWriteFailed'))
    } finally {
      setPending((p) => {
        const next = new Set(p)
        next.delete(post.id)
        return next
      })
    }
  }

  function onDragStart(e: React.DragEvent, post: Post) {
    setDraggingId(post.id)
    e.dataTransfer.setData('text/plain', post.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragEnd() {
    setDraggingId(null)
    setDropTarget(null)
  }

  function onDragOver(e: React.DragEvent, colKey: ApprovalDecision) {
    e.preventDefault() // required to allow drop
    e.dataTransfer.dropEffect = 'move'
    if (dropTarget !== colKey) setDropTarget(colKey)
  }

  function onDrop(e: React.DragEvent, colKey: ApprovalDecision) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || draggingId
    setDropTarget(null)
    setDraggingId(null)
    if (!id) return
    const post = posts.find((p) => p.id === id)
    if (!post) return
    if (laneOf(post) === colKey) return
    void move(post, colKey)
  }

  // Workflow columns are interactive; the Published column is appended read-only.
  const allColumns = [...WORKFLOW, PUBLISHED_STEP]

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
      {allColumns.map((col) => {
        const isPublishedCol = col.key === 'published'
        const items = grouped[col.key as Lane]
        const Icon = col.Icon
        const isDropTarget =
          !isPublishedCol && dropTarget === col.key && draggingId !== null
        return (
          <div
            key={col.key}
            className={cn(
              'shrink-0 w-60 space-y-2 rounded-lg transition-colors',
              isDropTarget && 'bg-brand-blue-50/40 ring-2 ring-brand-blue/40',
            )}
            onDragOver={isPublishedCol ? undefined : (e) => onDragOver(e, col.key as ApprovalDecision)}
            onDragLeave={() => dropTarget === col.key && setDropTarget(null)}
            onDrop={isPublishedCol ? undefined : (e) => onDrop(e, col.key as ApprovalDecision)}
          >
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-semibold',
                col.tone,
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{t(col.labelKey)}</span>
              <span className="ml-auto text-xs opacity-70">{items.length}</span>
            </div>
            <div className="space-y-2 min-h-[80px] p-1">
              {items.length === 0 && (
                <p className="text-[11px] text-ink-muted px-2 py-6 text-center border border-dashed border-border-subtle rounded-md">
                  {isDropTarget ? t('approvals.dropHere') : t('common.empty')}
                </p>
              )}
              {items.map((post) => {
                const isDragging = draggingId === post.id
                const url = isPublishedCol ? publishedUrl(post) : null
                return (
                  <Card
                    key={post.id}
                    draggable={!isPublishedCol && !pending.has(post.id)}
                    onDragStart={isPublishedCol ? undefined : (e) => onDragStart(e, post)}
                    onDragEnd={onDragEnd}
                    className={cn(
                      'border select-none',
                      col.cardTone,
                      isPublishedCol ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                      isDragging && 'opacity-50 ring-2 ring-brand-blue/60',
                    )}
                    title={isPublishedCol ? t('approvals.publishedLocked') : t('approvals.dragToMove')}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {nameOf(post)}
                        </Badge>
                        <span className="text-[10px] text-ink-muted">
                          {fmtDateShort(post.date)} · {post.channel}
                        </span>
                        {pending.has(post.id) && (
                          <Loader2 className="h-3 w-3 animate-spin text-ink-muted" />
                        )}
                      </div>
                      <p className="text-xs font-medium leading-tight line-clamp-2">
                        {post.title}
                      </p>
                      {post.pillar && (
                        <span
                          className="inline-block text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: pillarColor[post.pillar] + '22', color: pillarColor[post.pillar] }}
                        >
                          {post.pillar}
                        </span>
                      )}
                      {/* GF-43 — cards are moved by drag-and-drop, so the per-card
                          "→ Column" buttons were dropped to declutter the card. The
                          Published column keeps its read-only link to the live post. */}
                      {isPublishedCol &&
                        (url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 pt-1 text-[10px] font-medium text-brand-blue hover:underline"
                          >
                            <ExternalLink className="h-3 w-3" />
                            {t('approvals.viewPost')}
                          </a>
                        ) : (
                          <span className="inline-block pt-1 text-[10px] text-ink-muted">
                            {t('approvals.publishedNoLink')}
                          </span>
                        ))}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

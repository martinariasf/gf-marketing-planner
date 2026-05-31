// Approval kanban — staging-only, drag-to-move + click-button fallback.
//
// Four columns map to the approvals_v2 decision enum. Drag a card into another
// column → optimistically updates the local view, fires POST /api/v1/clients/
// :slug/approvals, asks the parent to refetch. Each card still has the
// explicit "→ Column" buttons for keyboard / touch users.
//
// Implementation note: native HTML5 drag-and-drop (no @dnd-kit). For the
// click-to-move case we trade some animation polish for ~0 dependencies.

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Calendar, Ban, Eye, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fmtDateShort } from '@/lib/format'
import { apiSetApproval, type ApprovalDecision } from '@/lib/api-client'
import type { Post } from '@/types'

const COLUMNS: Array<{
  key: ApprovalDecision
  label: string
  Icon: typeof Eye
  tone: string
  cardTone: string
}> = [
  {
    key: 'in_review',
    label: 'In review',
    Icon: Eye,
    tone: 'text-blue-700 bg-blue-50 border-blue-200',
    cardTone: 'border-blue-100',
  },
  {
    key: 'approved',
    label: 'Approved',
    Icon: ShieldCheck,
    tone: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    cardTone: 'border-emerald-100',
  },
  {
    key: 'scheduled',
    label: 'Scheduled',
    Icon: Calendar,
    tone: 'text-violet-700 bg-violet-50 border-violet-200',
    cardTone: 'border-violet-100',
  },
  {
    key: 'rejected',
    label: 'Rejected',
    Icon: Ban,
    tone: 'text-rose-700 bg-rose-50 border-rose-200',
    cardTone: 'border-rose-100',
  },
]

function columnFor(post: Post): ApprovalDecision {
  const s = post.approval?.status ?? post.status
  if (s === 'approved') return 'approved'
  if (s === 'scheduled' || s === 'published') return 'scheduled'
  if (s === 'rejected') return 'rejected'
  return 'in_review'
}

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
  // Optimistic overrides keyed by postId
  const [overrides, setOverrides] = useState<Record<string, ApprovalDecision>>({})
  const [pending, setPending] = useState<Set<string>>(new Set())
  // Currently-dragged post id and the column hovered as drop target.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<ApprovalDecision | null>(null)

  const grouped = useMemo(() => {
    const out: Record<ApprovalDecision, Post[]> = {
      in_review: [],
      approved: [],
      scheduled: [],
      rejected: [],
    }
    for (const p of posts) {
      const col = overrides[p.id] ?? columnFor(p)
      out[col].push(p)
    }
    return out
  }, [posts, overrides])

  async function move(post: Post, decision: ApprovalDecision) {
    if (pending.has(post.id)) return
    const prev = overrides[post.id]
    setOverrides((o) => ({ ...o, [post.id]: decision }))
    setPending((p) => new Set(p).add(post.id))
    try {
      await apiSetApproval(slug, post.id, decision)
      toast(`${post.id} → ${decision.replace('_', ' ')}`, { duration: 1800 })
      onChanged()
    } catch (err) {
      setOverrides((o) => {
        const next = { ...o }
        if (prev) next[post.id] = prev
        else delete next[post.id]
        return next
      })
      toast.error(err instanceof Error ? err.message : 'Approval write failed')
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
    const currentCol = overrides[post.id] ?? columnFor(post)
    if (currentCol === colKey) return
    void move(post, colKey)
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {COLUMNS.map((col) => {
        const items = grouped[col.key]
        const Icon = col.Icon
        const isDropTarget = dropTarget === col.key && draggingId !== null
        return (
          <div
            key={col.key}
            className={cn(
              'space-y-2 rounded-lg transition-colors',
              isDropTarget && 'bg-brand-blue-50/40 ring-2 ring-brand-blue/40',
            )}
            onDragOver={(e) => onDragOver(e, col.key)}
            onDragLeave={() => dropTarget === col.key && setDropTarget(null)}
            onDrop={(e) => onDrop(e, col.key)}
          >
            <div
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-semibold',
                col.tone,
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{col.label}</span>
              <span className="ml-auto text-xs opacity-70">{items.length}</span>
            </div>
            <div className="space-y-2 min-h-[80px] p-1">
              {items.length === 0 && (
                <p className="text-[11px] text-ink-muted px-2 py-6 text-center border border-dashed border-border-subtle rounded-md">
                  {isDropTarget ? 'drop here' : 'empty'}
                </p>
              )}
              {items.map((post) => {
                const isDragging = draggingId === post.id
                return (
                  <Card
                    key={post.id}
                    draggable={!pending.has(post.id)}
                    onDragStart={(e) => onDragStart(e, post)}
                    onDragEnd={onDragEnd}
                    className={cn(
                      'border cursor-grab active:cursor-grabbing select-none',
                      col.cardTone,
                      isDragging && 'opacity-50 ring-2 ring-brand-blue/60',
                    )}
                    title="Drag to another column to move"
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {post.id}
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
                      <div className="flex flex-wrap gap-1 pt-1">
                        {COLUMNS.filter((c) => c.key !== col.key).map((c) => (
                          <Button
                            key={c.key}
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            disabled={pending.has(post.id)}
                            onClick={() => move(post, c.key)}
                          >
                            → {c.label}
                          </Button>
                        ))}
                      </div>
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

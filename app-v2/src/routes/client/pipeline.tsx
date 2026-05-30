import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Pillar } from '@/components/pillar'
import { MoreHorizontal, MessageSquare, Copy, Check } from 'lucide-react'
import { fmtDateShort } from '@/lib/format'
import { toast, Toaster } from 'sonner'
import type { ClientBundle } from '@/lib/client-data'
import type { Post, PostStatus } from '@/types'
import { isApiEnabled } from '@/lib/api-client'
import { PostDrawer } from '@/components/post-drawer'

const COLUMNS: Array<{ key: PostStatus; label: string; color: string }> = [
  { key: 'idea',           label: 'Idea',           color: 'bg-neutral-100 text-neutral-700' },
  { key: 'drafting',       label: 'Drafting',       color: 'bg-amber-50 text-amber-700' },
  { key: 'in_review',      label: 'In Review',      color: 'bg-blue-50 text-blue-700' },
  { key: 'needs_revision', label: 'Needs Revision', color: 'bg-orange-50 text-orange-700' },
  { key: 'approved',       label: 'Approved',       color: 'bg-emerald-50 text-emerald-700' },
  { key: 'scheduled',      label: 'Scheduled',      color: 'bg-violet-50 text-violet-700' },
  { key: 'published',      label: 'Published',      color: 'bg-brand-green-100 text-brand-green-600' },
  { key: 'rejected',       label: 'Rejected',       color: 'bg-rose-50 text-rose-700' },
]

function telegramCommand(action: PostStatus, postId: string): string {
  switch (action) {
    case 'approved':       return `approve ${postId}`
    case 'needs_revision': return `revise ${postId}`
    case 'rejected':       return `reject ${postId}`
    case 'drafting':       return `draft ${postId}`
    case 'in_review':      return `submit ${postId}`
    case 'scheduled':      return `schedule ${postId}`
    case 'published':      return `publish ${postId}`
    default:               return `move ${postId} to ${action}`
  }
}

export default function PipelineView() {
  const { posts, plan, slug, refetch } = useOutletContext<
    ClientBundle & { refetch: () => void }
  >()
  const [drawerPost, setDrawerPost] = useState<Post | null>(null)

  const pillarColor = useMemo(() => {
    const m: Record<string, string> = {}
    plan.pillars.forEach((p) => (m[p.name] = p.color))
    return m
  }, [plan.pillars])

  const byStatus = useMemo(() => {
    const m: Record<PostStatus, Post[]> = {
      idea: [], drafting: [], in_review: [], needs_revision: [],
      approved: [], scheduled: [], published: [], rejected: [],
    }
    for (const p of posts) m[p.status]?.push(p)
    for (const k of Object.keys(m) as PostStatus[]) {
      m[k].sort((a, b) => a.date.localeCompare(b.date))
    }
    return m
  }, [posts])

  return (
    <div className="space-y-6">
      <Toaster position="bottom-right" />

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            Pipeline
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">
            Where is every post?
          </h1>
          <p className="text-ink-muted mt-1 text-sm max-w-2xl">
            Read-only board. To move a post, send Viktor the suggested
            Telegram command from the card menu — actual writes happen
            on the agent, not in the browser.
          </p>
        </div>
        <Badge variant="secondary" className="bg-paper-muted">
          {posts.filter((p) => p.status !== 'published' && p.status !== 'rejected').length}{' '}
          posts in flight
        </Badge>
      </div>

      <div className="overflow-x-auto -mx-6 px-6 pb-4">
        <div className="flex gap-3 min-w-max">
          {COLUMNS.map((col) => (
            <Column
              key={col.key}
              col={col}
              posts={byStatus[col.key] ?? []}
              pillarColor={pillarColor}
              onOpen={isApiEnabled ? setDrawerPost : undefined}
            />
          ))}
        </div>
      </div>

      <PostDrawer
        slug={slug}
        post={drawerPost}
        open={drawerPost !== null}
        onOpenChange={(o) => !o && setDrawerPost(null)}
        onSaved={refetch}
      />
    </div>
  )
}

function Column({
  col,
  posts,
  pillarColor,
  onOpen,
}: {
  col: (typeof COLUMNS)[number]
  posts: Post[]
  pillarColor: Record<string, string>
  onOpen?: (post: Post) => void
}) {
  return (
    <div className="w-[260px] shrink-0">
      <div className={`rounded-t-lg px-3 py-2 flex items-center justify-between ${col.color}`}>
        <span className="text-[11px] font-semibold uppercase tracking-wider">
          {col.label}
        </span>
        <span className="text-[11px] font-bold">{posts.length}</span>
      </div>
      <div className="bg-paper-muted rounded-b-lg p-2 space-y-2 min-h-[120px]">
        <AnimatePresence initial={false}>
          {posts.map((p) => (
            <motion.div
              key={p.id}
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.18 }}
            >
              <KanbanCard
                post={p}
                pillarColor={pillarColor[p.pillar]}
                onOpen={onOpen}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        {posts.length === 0 && (
          <p className="text-[11px] text-ink-muted text-center py-6">empty</p>
        )}
      </div>
    </div>
  )
}

function KanbanCard({
  post,
  pillarColor,
  onOpen,
}: {
  post: Post
  pillarColor?: string
  onOpen?: (post: Post) => void
}) {
  const [copied, setCopied] = useState<string | null>(null)

  const sendCommand = (target: PostStatus) => {
    const cmd = telegramCommand(target, post.id)
    navigator.clipboard.writeText(cmd).catch(() => {})
    setCopied(target)
    setTimeout(() => setCopied(null), 1200)
    toast(`Telegram → Viktor`, {
      description: (
        <code className="font-mono text-xs">{cmd}</code>
      ),
      icon: <MessageSquare className="h-4 w-4" />,
    })
  }

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer group"
      onClick={() => onOpen?.(post)}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-1.5">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted">
            {post.id} · {fmtDateShort(post.date)}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-ink-muted">
                Send to Viktor on Telegram
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {COLUMNS.filter((c) => c.key !== post.status).map((c) => (
                <DropdownMenuItem
                  key={c.key}
                  onClick={() => sendCommand(c.key)}
                  className="text-xs flex items-center justify-between"
                >
                  <span>Move to {c.label}</span>
                  {copied === c.key ? (
                    <Check className="h-3 w-3 text-brand-green-500" />
                  ) : (
                    <Copy className="h-3 w-3 text-ink-muted" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <h4 className="text-sm font-semibold leading-snug line-clamp-2">
          {post.title}
        </h4>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Pillar name={post.pillar} color={pillarColor} />
          <Badge variant="outline" className="text-[10px] font-normal capitalize">
            {post.channel}
          </Badge>
        </div>

        {post.approval.blockerReason && (
          <p className="text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded">
            {post.approval.blockerReason}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

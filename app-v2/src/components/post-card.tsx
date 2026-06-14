import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Post } from '@/types'
import { fmtDate } from '@/lib/format'
import { Pillar } from './pillar'

const STATUS_STYLES: Record<string, string> = {
  idea:           'bg-neutral-100 text-neutral-700 border-neutral-200',
  drafting:       'bg-amber-50 text-amber-700 border-amber-200',
  in_review:      'bg-blue-50 text-blue-700 border-blue-200',
  needs_revision: 'bg-orange-50 text-orange-700 border-orange-200',
  approved:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  scheduled:      'bg-violet-50 text-violet-700 border-violet-200',
  published:      'bg-brand-green-100 text-brand-green-600 border-brand-green-200',
  rejected:       'bg-rose-50 text-rose-700 border-rose-200',
}

interface Props {
  post: Post
  pillarColor?: string
}

export function PostCard({ post, pillarColor }: Props) {
  const statusClass = STATUS_STYLES[post.status] ?? STATUS_STYLES.idea

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted">
              {fmtDate(post.date)} &middot; {post.channel} &middot; {post.format}
            </p>
            <h3 className="text-base font-semibold mt-1">{post.title}</h3>
          </div>
          <Badge variant="outline" className={statusClass}>
            {post.status.replace('_', ' ')}
          </Badge>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Pillar name={post.pillar} color={pillarColor} />
          {post.campaign && (
            <Badge variant="secondary" className="bg-paper-muted text-ink-muted font-normal">
              {post.campaign}
            </Badge>
          )}
        </div>

        <p className="text-sm whitespace-pre-line text-ink-muted line-clamp-4">
          {post.copy}
        </p>

        <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
          <span className="text-ink-muted">CTA</span>
          <span className="font-medium">{post.cta}</span>
        </div>
      </CardContent>
    </Card>
  )
}

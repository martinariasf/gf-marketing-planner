import { ThumbsUp, MessageSquare, Repeat2, Send, Files } from 'lucide-react'
import type { MockupPost } from './index'

interface Props {
  post: MockupPost
  clientName: string
  logoInitials: string
  /** Free-form subtitle under the company name (industry, follower count, etc.). Omit to hide. */
  subtitle?: string
  /** Real engagement totals. Omit (or pass zeros) and the engagement row is hidden. */
  metrics?: {
    likes?: number
    comments?: number
    shares?: number
  }
}

export function LinkedinMockup({
  post,
  clientName,
  logoInitials,
  subtitle,
  metrics,
}: Props) {
  const total = (metrics?.likes ?? 0) + (metrics?.comments ?? 0) + (metrics?.shares ?? 0)
  const hasMetrics = total > 0
  const slideCount = post.slides?.length ?? 0
  const isCarousel = slideCount > 1

  return (
    <div className="mx-auto max-w-[420px] rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="h-12 w-12 rounded-full bg-brand-blue flex items-center justify-center text-white font-bold text-sm">
          {logoInitials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight truncate">{clientName}</p>
          {subtitle && (
            <p className="text-[11px] text-neutral-500 truncate">{subtitle}</p>
          )}
          <p className="text-[11px] text-neutral-500">Preview · 🌐</p>
        </div>
      </div>

      <div className="px-3 pb-3 text-[13px] whitespace-pre-line text-neutral-800 leading-relaxed">
        <p className="font-semibold mb-1.5">{post.title}</p>
        {post.copy}
      </div>

      {post.image && (
        <div className="relative aspect-[1.91/1] bg-neutral-100 overflow-hidden">
          <img
            src={post.image}
            alt={post.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {isCarousel && (
            <span className="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/55 text-white text-[11px] font-medium px-2 py-0.5">
              <Files className="h-3 w-3" />
              1/{slideCount}
            </span>
          )}
        </div>
      )}

      {/* LinkedIn document/carousel affordance: a row of slide dots */}
      {isCarousel && (
        <div className="flex items-center justify-center gap-1 py-2">
          {Array.from({ length: slideCount }).map((_, i) => (
            <span
              key={i}
              className={
                'h-1.5 w-1.5 rounded-full ' + (i === 0 ? 'bg-brand-blue' : 'bg-neutral-300')
              }
            />
          ))}
        </div>
      )}

      {hasMetrics && (
        <div className="px-3 pt-2 pb-1 flex items-center justify-between border-b border-neutral-100">
          <p className="text-[11px] text-neutral-500">
            {(metrics!.likes ?? 0).toLocaleString()}
            {metrics!.comments ? ` · ${metrics!.comments} comments` : ''}
            {metrics!.shares ? ` · ${metrics!.shares} reposts` : ''}
          </p>
        </div>
      )}

      <div className="grid grid-cols-4 px-2 py-1">
        {[
          { icon: ThumbsUp, label: 'Like' },
          { icon: MessageSquare, label: 'Comment' },
          { icon: Repeat2, label: 'Repost' },
          { icon: Send, label: 'Send' },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            className="flex items-center justify-center gap-1.5 px-2 py-2 rounded hover:bg-neutral-100 text-neutral-600 text-[12px] font-medium"
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

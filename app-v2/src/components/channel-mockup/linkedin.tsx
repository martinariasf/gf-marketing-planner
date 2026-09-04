import { useState } from 'react'
import { ThumbsUp, MessageSquare, Repeat2, Send, Files, Film, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/lib/i18n'
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
  /** GF-65 — localized "AI generated" disclosure shown on the post media. */
  aiLabel?: string
  /** GF-103 — fires whenever the carousel's active slide changes. */
  onSlideChange?: (index: number) => void
}

export function LinkedinMockup({
  post,
  clientName,
  logoInitials,
  subtitle,
  metrics,
  aiLabel,
  onSlideChange,
}: Props) {
  const t = useT()
  const total = (metrics?.likes ?? 0) + (metrics?.comments ?? 0) + (metrics?.shares ?? 0)
  const hasMetrics = total > 0
  const slideCount = post.slides?.length ?? 0
  const isCarousel = slideCount > 1
  const video = post.media?.find((item) => item.type === 'video' && item.url)

  // GF-103 — uncontrolled active-slide index, reset whenever the post identity
  // changes. MockupPost has no id, so identity is the slide URLs (falling back
  // to the cover): two posts can share a cover image, since a carousel's cover
  // IS slides[0].image, and the cover alone would leave a stale index behind in
  // a container that does not remount. Adjusting state during render (react.dev
  // "Resetting state on prop change") rather than in a useEffect — no lint
  // suppression, and no extra pass that would briefly flash the old slide.
  const postKey = (post.slides ?? []).map((s) => s.image).join('|') || post.image
  const [idx, setIdx] = useState(0)
  const [seenPost, setSeenPost] = useState(postKey)
  if (seenPost !== postKey) {
    setSeenPost(postKey)
    setIdx(0)
  }

  const goTo = (next: number) => {
    const clamped = ((next % slideCount) + slideCount) % slideCount
    setIdx(clamped)
    onSlideChange?.(clamped)
  }

  // `|| post.image` — a slide entry can legitimately carry no image URL (GF-105
  // strips them on a strategy link), and blanking the frame would be worse than
  // falling back to the cover, which is what rendered here before GF-103.
  const activeImage = (isCarousel && !video ? post.slides![idx]?.image : post.image) || post.image

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

      {video ? (
        /* GF-72 — playable video with a native play control, plays the real
           .mp4. LinkedIn keeps its landscape frame (vertical reels are IG). */
        <div className="relative aspect-[1.91/1] bg-black overflow-hidden">
          <video
            src={video.url}
            poster={video.thumbnail}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
          <span className="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/55 text-white text-[11px] font-medium px-2 py-0.5 pointer-events-none">
            <Film className="h-3 w-3" />
            Video
          </span>
          {aiLabel && (
            <span className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/55 text-white text-[10px] font-medium px-2 py-0.5 pointer-events-none">
              <Sparkles className="h-3 w-3" />
              {aiLabel}
            </span>
          )}
        </div>
      ) : activeImage && (
        <div className="relative aspect-[1.91/1] bg-neutral-100 overflow-hidden">
          <img
            src={activeImage}
            alt={post.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {isCarousel && (
            <span className="absolute top-2 right-2 flex items-center gap-1 rounded bg-black/55 text-white text-[11px] font-medium px-2 py-0.5">
              <Files className="h-3 w-3" />
              {idx + 1}/{slideCount}
            </span>
          )}
          {isCarousel && (
            <>
              <button
                type="button"
                onClick={() => goTo(idx - 1)}
                aria-label={t('calendar.previousSlide')}
                className="absolute left-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/65"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goTo(idx + 1)}
                aria-label={t('calendar.nextSlide')}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/65"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}
          {/* GF-65 — AI-generated disclosure (all Viktor media is AI-made). */}
          {aiLabel && (
            <span className="absolute top-2 left-2 flex items-center gap-1 rounded bg-black/55 text-white text-[10px] font-medium px-2 py-0.5 pointer-events-none">
              <Sparkles className="h-3 w-3" />
              {aiLabel}
            </span>
          )}
        </div>
      )}

      {/* LinkedIn document/carousel affordance: a row of slide dots */}
      {!video && isCarousel && (
        <div className="flex items-center justify-center gap-1 py-2">
          {Array.from({ length: slideCount }).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t('calendar.goToSlide', { n: i + 1 })}
              // p-0.5/-m-0.5 grows the tap target from 6px to the row's full 10px pitch
                // without shifting a pixel; anything larger overlaps the next dot and
                // the later button would swallow clicks aimed at this one.
                className="relative p-0.5 -m-0.5"
            >
              <span
                className={
                  'block h-1.5 w-1.5 rounded-full ' + (i === idx ? 'bg-brand-blue' : 'bg-neutral-300')
                }
              />
            </button>
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

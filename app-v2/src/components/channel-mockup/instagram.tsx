import { useState } from 'react'
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Copy, Film, Sparkles, CircleDot, ChevronLeft, ChevronRight } from 'lucide-react'
import { isStoryFormat } from '@/lib/post-format'
import { useT } from '@/lib/i18n'
import type { MockupPost } from './index'

interface Props {
  post: MockupPost
  handle: string
  logoInitials: string
  /** GF-65 — localized "AI generated" disclosure shown on the post media. */
  aiLabel?: string
  /** GF-69 — localized "Story" badge shown on an Instagram story post. */
  storyLabel?: string
  /** GF-103 — fires whenever the carousel's active slide changes. */
  onSlideChange?: (index: number) => void
}

export function InstagramMockup({ post, handle, logoInitials, aiLabel, storyLabel, onSlideChange }: Props) {
  const t = useT()
  const slideCount = post.slides?.length ?? 0
  const isCarousel = slideCount > 1
  const video = post.media?.find((item) => item.type === 'video' && item.url)
  // GF-69 — a video post keeps its existing 9:16 reel rendering (unchanged);
  // a story is only recognized when there is no video attached.
  const isStory = !video && isStoryFormat(post.format)

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
  const activeImage =
    (isCarousel && !video && !isStory ? post.slides![idx]?.image : post.image) || post.image

  return (
    <div className="mx-auto max-w-[340px] rounded-[2.2rem] border-8 border-neutral-900 bg-white shadow-xl">
      <div className="rounded-[1.5rem] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-neutral-100">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-400 p-[2px]">
              <div className="h-full w-full rounded-full bg-white flex items-center justify-center text-[10px] font-bold text-brand-blue">
                {logoInitials}
              </div>
            </div>
            <div>
              <p className="text-[12px] font-semibold leading-tight">{handle.replace('@', '')}</p>
              <p className="text-[10px] text-neutral-500 leading-tight">Sponsored</p>
            </div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-neutral-500" />
        </div>

        {/* GF-72 — a video post renders as a playable 9:16 reel (real .mp4 with
            a native play control), not a static square thumbnail.
            GF-69 — a story post renders full-screen 9:16, same frame shape as a
            reel but with a "Story" badge instead of "Reel", no carousel dots,
            and no feed action bar (a story has no feed chrome). */}
        <div
          className={
            'relative overflow-hidden ' +
            (video || isStory ? 'aspect-[9/16] bg-black' : 'aspect-square bg-neutral-100')
          }
        >
          {video ? (
            <>
              <video
                src={video.url}
                poster={video.thumbnail}
                controls
                playsInline
                preload="metadata"
                className="h-full w-full object-cover bg-black"
              />
              <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/55 text-white text-[11px] font-medium px-2 py-0.5 pointer-events-none">
                <Film className="h-3 w-3" />
                Reel
              </span>
            </>
          ) : activeImage && (
            <img
              src={activeImage}
              alt={post.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
          {!video && !isStory && isCarousel && (
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
          {/* format is metadata-only (never mutates slides), so a post can
              legitimately be format:"story" AND carry >1 slides at the same
              time — !isStory keeps the slide counter from stacking on top of
              the story badge below (both use the same top-2 right-2 slot). */}
          {!video && !isStory && isCarousel && (
            <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/55 text-white text-[11px] font-medium px-2 py-0.5">
              <Copy className="h-3 w-3" />
              {idx + 1}/{slideCount}
            </span>
          )}
          {!video && isStory && storyLabel && (
            <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/55 text-white text-[11px] font-medium px-2 py-0.5 pointer-events-none">
              <CircleDot className="h-3 w-3" />
              {storyLabel}
            </span>
          )}
          {/* GF-65 — AI-generated disclosure (all Viktor media is AI-made). */}
          {aiLabel && (video || post.image) && (
            <span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-black/55 text-white text-[10px] font-medium px-2 py-0.5 pointer-events-none">
              <Sparkles className="h-3 w-3" />
              {aiLabel}
            </span>
          )}
        </div>

        {/* Carousel dots (IG shows them below the image) — never on a story, and
            never on a video post: `format`/`slides` are independent, so a video
            can legally carry >1 slides, and its media frame renders the reel
            rather than a slide. Same guard as the arrows and the counter. */}
        {!video && !isStory && isCarousel && (
          <div className="flex items-center justify-center gap-1 pt-2">
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

        {/* Feed action bar (heart/comment/send/bookmark) — a story has no feed chrome. */}
        {!isStory && (
          <div className="px-3 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
            </div>
            <Bookmark className="h-5 w-5" />
          </div>
        )}

        <div className="px-3 pb-3 text-[12px] leading-snug">
          <p className="font-semibold mb-1">{post.title}</p>
          <p className="whitespace-pre-line text-neutral-800">
            <span className="font-semibold">{handle.replace('@', '')} </span>
            {post.copy}
          </p>
          {post.hashtags.length > 0 && (
            <p className="mt-1 text-brand-blue text-[11px]">{post.hashtags.join(' ')}</p>
          )}
        </div>
      </div>
    </div>
  )
}

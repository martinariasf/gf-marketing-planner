import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Copy } from 'lucide-react'
import type { MockupPost } from './index'

interface Props {
  post: MockupPost
  handle: string
  logoInitials: string
}

export function InstagramMockup({ post, handle, logoInitials }: Props) {
  const slideCount = post.slides?.length ?? 0
  const isCarousel = slideCount > 1
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

        <div className="relative aspect-square bg-neutral-100 overflow-hidden">
          {post.image && (
            <img
              src={post.image}
              alt={post.title}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
          {isCarousel && (
            <span className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/55 text-white text-[11px] font-medium px-2 py-0.5">
              <Copy className="h-3 w-3" />
              1/{slideCount}
            </span>
          )}
        </div>

        {/* Carousel dots (IG shows them below the image) */}
        {isCarousel && (
          <div className="flex items-center justify-center gap-1 pt-2">
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

        <div className="px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Heart className="h-5 w-5" />
            <MessageCircle className="h-5 w-5" />
            <Send className="h-5 w-5" />
          </div>
          <Bookmark className="h-5 w-5" />
        </div>

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

import { ThumbsUp, MessageSquare, Repeat2, Send } from 'lucide-react'
import type { Post } from '@/types'

interface Props {
  post: Post
  clientName: string
  logoInitials: string
}

export function LinkedinMockup({ post, clientName, logoInitials }: Props) {
  return (
    <div className="mx-auto max-w-[420px] rounded-lg border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="h-12 w-12 rounded-full bg-brand-blue flex items-center justify-center text-white font-bold text-sm">
          {logoInitials}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold leading-tight">{clientName}</p>
          <p className="text-[11px] text-neutral-500">Boutique fitness · 12,400 followers</p>
          <p className="text-[11px] text-neutral-500">2h · 🌐</p>
        </div>
      </div>

      <div className="px-3 pb-3 text-[13px] whitespace-pre-line text-neutral-800 leading-relaxed">
        <p className="font-semibold mb-1.5">{post.title}</p>
        {post.copy}
      </div>

      {post.image && (
        <div className="aspect-[1.91/1] bg-neutral-100 overflow-hidden">
          <img
            src={post.image}
            alt={post.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      <div className="px-3 pt-2 pb-1 flex items-center justify-between border-b border-neutral-100">
        <p className="text-[11px] text-neutral-500">847 · 32 comments · 14 reposts</p>
      </div>

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

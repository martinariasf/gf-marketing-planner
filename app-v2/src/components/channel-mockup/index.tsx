import { InstagramMockup } from './instagram'
import { LinkedinMockup } from './linkedin'

// The structural subset of Post the mockups actually render. Sanitized
// external-review posts (PublicReviewPost) can be adapted into this shape too,
// so the code-gated reviewer page can reuse the same mockups.
export interface MockupPost {
  title: string
  copy: string
  hashtags: string[]
  image?: string
  slides?: Array<{ image: string; caption?: string }>
  media?: Array<{ type: 'image' | 'video'; url: string; thumbnail?: string; caption?: string }>
  channel: string
  // GF-69 — canonical post type ("single image" | "carousel" | "story" | …).
  // Optional so every existing caller (that never set it) keeps rendering the
  // square/carousel feed frame unchanged.
  format?: string
}

interface Props {
  post: MockupPost
  clientName: string
  handle: string
  logoInitials: string
  /** Free-form subtitle line (e.g. industry · "12.4k followers"). */
  subtitle?: string
  /** Real engagement totals from analytics. If absent or zero, no fake numbers are rendered. */
  metrics?: { likes?: number; comments?: number; shares?: number }
  /** GF-65 — localized "AI generated" disclosure shown on the post media. Omit to hide. */
  aiLabel?: string
  /** GF-69 — localized "Story" badge shown on an Instagram story post. Omit to hide. */
  storyLabel?: string
}

export function ChannelMockup({
  post,
  clientName,
  handle,
  logoInitials,
  subtitle,
  metrics,
  aiLabel,
  storyLabel,
}: Props) {
  if (post.channel === 'linkedin') {
    return (
      <LinkedinMockup
        post={post}
        clientName={clientName}
        logoInitials={logoInitials}
        subtitle={subtitle}
        metrics={metrics}
        aiLabel={aiLabel}
      />
    )
  }
  return (
    <InstagramMockup
      post={post}
      handle={handle}
      logoInitials={logoInitials}
      aiLabel={aiLabel}
      storyLabel={storyLabel}
    />
  )
}

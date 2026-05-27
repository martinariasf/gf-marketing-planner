import type { Post } from '@/types'
import { InstagramMockup } from './instagram'
import { LinkedinMockup } from './linkedin'

interface Props {
  post: Post
  clientName: string
  handle: string
  logoInitials: string
  /** Free-form subtitle line (e.g. industry · "12.4k followers"). */
  subtitle?: string
  /** Real engagement totals from analytics. If absent or zero, no fake numbers are rendered. */
  metrics?: { likes?: number; comments?: number; shares?: number }
}

export function ChannelMockup({
  post,
  clientName,
  handle,
  logoInitials,
  subtitle,
  metrics,
}: Props) {
  if (post.channel === 'linkedin') {
    return (
      <LinkedinMockup
        post={post}
        clientName={clientName}
        logoInitials={logoInitials}
        subtitle={subtitle}
        metrics={metrics}
      />
    )
  }
  return <InstagramMockup post={post} handle={handle} logoInitials={logoInitials} />
}

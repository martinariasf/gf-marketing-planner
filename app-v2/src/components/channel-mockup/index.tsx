import type { Post } from '@/types'
import { InstagramMockup } from './instagram'
import { LinkedinMockup } from './linkedin'

interface Props {
  post: Post
  clientName: string
  handle: string
  logoInitials: string
}

export function ChannelMockup({ post, clientName, handle, logoInitials }: Props) {
  if (post.channel === 'linkedin') {
    return <LinkedinMockup post={post} clientName={clientName} logoInitials={logoInitials} />
  }
  return <InstagramMockup post={post} handle={handle} logoInitials={logoInitials} />
}

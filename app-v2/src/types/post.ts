export type PostStatus =
  | 'idea'
  | 'drafting'
  | 'in_review'
  | 'needs_revision'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'

export type Channel = 'instagram' | 'linkedin' | 'tiktok' | 'x' | 'facebook'

export interface Post {
  id: string
  date: string
  channel: Channel
  format: string
  pillar: string
  campaign?: string
  title: string
  image?: string
  copy: string
  hashtags: string[]
  cta: string
  status: PostStatus
  approval: {
    status: PostStatus
    approvedBy: string | null
    approvedAt: string | null
    version: number
    blockerReason: string | null
  }
  publishing: {
    postizJobId: string | null
    publishedAt: string | null
    publicUrl: string | null
  }
}

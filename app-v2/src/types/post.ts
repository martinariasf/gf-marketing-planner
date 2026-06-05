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

// A carousel post carries 2–10 slides. `image` (full asset URL) is the visible
// slide; `caption` is an optional per-slide design-brief / on-image-text note —
// NOT a second post body (the whole post shares one `copy`). See CAR1 in
// STAGING_V3_PLAN.md.
export interface Slide {
  image: string
  caption?: string
}

export interface Post {
  id: string
  date: string
  channel: Channel
  format: string
  pillar: string
  campaign?: string
  title: string
  // Cover image. For a carousel this equals slides[0].image so every existing
  // thumbnail / calendar / performance path that reads post.image keeps working.
  image?: string
  // Present with length > 1 ⇒ carousel (IG caps at 10). Absent ⇒ single image.
  slides?: Slide[]
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

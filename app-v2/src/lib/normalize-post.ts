import type { Post } from '@/types'

const VALID_STATUS: Post['status'][] = [
  'idea',
  'drafting',
  'in_review',
  'needs_revision',
  'approved',
  'scheduled',
  'published',
  'rejected',
]

/**
 * Backstop the Post contract before any component dereferences it.
 *
 * The API already coalesces partial rows (see deploy-staging/api schemas/post.ts),
 * but this is the SPA's own last line of defense — it also covers file mode and
 * any future shape drift, so a single bad post can never white-screen a page
 * (the June 2026 incident: missing `status`/`approval`/`date` threw in the
 * calendar + approvals views). Never invents content, only structural fields.
 */
export function normalizePost(raw: unknown): Post {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const status = (
    typeof p.status === 'string' && (VALID_STATUS as string[]).includes(p.status)
      ? p.status
      : 'idea'
  ) as Post['status']
  const approvalRaw =
    p.approval && typeof p.approval === 'object' ? (p.approval as Record<string, unknown>) : {}
  const publishingRaw =
    p.publishing && typeof p.publishing === 'object' ? (p.publishing as Record<string, unknown>) : {}

  // CAR1: keep only well-formed slides; the cover image falls back to slides[0].
  const slides = Array.isArray(p.slides)
    ? (p.slides as unknown[])
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .filter((s) => typeof s.image === 'string' && (s.image as string).length > 0)
        .map((s) => ({
          image: s.image as string,
          ...(typeof s.caption === 'string' ? { caption: s.caption as string } : {}),
        }))
    : undefined
  const coverFromSlides = slides && slides.length > 0 ? slides[0].image : undefined

  return {
    id: typeof p.id === 'string' ? p.id : '',
    date: typeof p.date === 'string' ? p.date : '',
    channel: (typeof p.channel === 'string' ? p.channel : 'instagram') as Post['channel'],
    format: typeof p.format === 'string' ? p.format : '',
    pillar: typeof p.pillar === 'string' ? p.pillar : '',
    campaign: typeof p.campaign === 'string' ? p.campaign : undefined,
    title: typeof p.title === 'string' ? p.title : '',
    image: typeof p.image === 'string' && p.image.length > 0 ? p.image : coverFromSlides,
    ...(slides && slides.length > 0 ? { slides } : {}),
    copy: typeof p.copy === 'string' ? p.copy : '',
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.filter((h): h is string => typeof h === 'string') : [],
    cta: typeof p.cta === 'string' ? p.cta : '',
    status,
    approval: {
      status: (typeof approvalRaw.status === 'string' ? approvalRaw.status : status) as Post['status'],
      approvedBy: typeof approvalRaw.approvedBy === 'string' ? approvalRaw.approvedBy : null,
      approvedAt: typeof approvalRaw.approvedAt === 'string' ? approvalRaw.approvedAt : null,
      version: typeof approvalRaw.version === 'number' ? approvalRaw.version : 1,
      blockerReason: typeof approvalRaw.blockerReason === 'string' ? approvalRaw.blockerReason : null,
    },
    publishing: {
      postizJobId: typeof publishingRaw.postizJobId === 'string' ? publishingRaw.postizJobId : null,
      publishedAt: typeof publishingRaw.publishedAt === 'string' ? publishingRaw.publishedAt : null,
      publicUrl: typeof publishingRaw.publicUrl === 'string' ? publishingRaw.publicUrl : null,
    },
  }
}

export type SocialNetwork = 'linkedin' | 'instagram' | 'facebook' | 'x' | 'tiktok'

export const SOCIAL_NETWORKS: SocialNetwork[] = ['linkedin', 'instagram', 'facebook', 'x', 'tiktok']

export interface Brief {
  company: {
    name: string
    industry: string
    country: string
    website?: string
    contact: { name: string; email?: string; telegram?: string }
  }
  business: {
    model: string
    customerType: string
    mainOffer: string
    bestSeller?: string
    differentiators: string[]
  }
  audience: {
    segments: Array<{
      name: string
      demo: string
      psycho: string
      where: string
    }>
    painPoints: string[]
    desires: string[]
    competitors: string[]
    referenceBrands: string[]
  }
  voice: {
    tone: string[]
    wordsToUse: string[]
    wordsToAvoid: string[]
    do: string[]
    dont: string[]
  }
  channels: {
    primary: string[]
    cadence: string
    language: string
    profiles?: Array<{ network: SocialNetwork; url: string }>
  }
  boundaries: {
    viktorCanDoWithoutAsking: string[]
    viktorNeedsApprovalFor: string[]
    sensitiveTopics: string[]
    communityRules: {
      who_handles_dms: 'human' | 'viktor' | 'mixed'
      escalation_owner: string
    }
  }
  metricsThatMatter: string[]
  tools: {
    design?: string
    scheduler?: string
    analytics?: string
  }
  references: {
    drive_folder_url: string | null
    examples: string[]
  }
  branding?: {
    colors: Array<{ name: string; hex: string }>
    typography: {
      headingFont: string
      bodyFont: string
    }
    logos: Array<{ variant: string; url: string }>
    toneKeywords: string[]
  }
  // GF-34: free-text visual/brand guidelines (layout, text placement, colour
  // zones, font scale). Viktor pre-fills it; the human edits it afterwards.
  // Optional so existing briefs without the field still round-trip.
  visualGuidelines?: string
  expectations: string
}

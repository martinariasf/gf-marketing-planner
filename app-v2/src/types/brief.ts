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
  expectations: string
}

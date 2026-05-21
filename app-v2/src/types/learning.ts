export interface Learning {
  id: string
  title: string
  platform: string
  relatedPostId?: string
  relatedCampaign?: string
  whatHappened: string
  lesson: string
  recommendedBehaviorChange: string
  confidence: 'low' | 'medium' | 'high'
  createdAt: string
}

export interface Learnings {
  items: Learning[]
}

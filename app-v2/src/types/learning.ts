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
  // LE2 — hypothesis cycle
  hypothesis?: string
  newHypothesis?: string
  // LE1 — applied tracking
  applied?: boolean
  appliedAt?: string
}

export interface Learnings {
  items: Learning[]
}

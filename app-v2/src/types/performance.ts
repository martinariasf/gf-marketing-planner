export interface PostMetrics {
  reach: number
  impressions: number
  saves: number
  shares: number
  comments: number
  likes: number
  profileVisits: number
  clicks: number
  dms: number
}

export interface GoalProgress {
  target: number
  current: number
  pace: 'ahead' | 'on-track' | 'behind'
  deltaPct: number
}

export interface WeeklySummary {
  week: number
  wins: string[]
  losses: string[]
  nextTest: string
}

export interface Performance {
  lastSyncedAt: string
  source: 'postiz' | 'manual' | 'meta'
  posts: Record<string, PostMetrics>
  aggregates: {
    quarterly: { reach: number; followerDelta: number }
    monthly: Record<string, { reach: number; followerDelta: number }>
    weekly: Record<string, { reach: number; topPost?: string }>
  }
  vsGoals: Record<string, GoalProgress>
  weeklySummary: WeeklySummary | null
}

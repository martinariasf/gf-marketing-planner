export interface Pillar {
  name: string
  weight: number
  color: string
  description: string
}

export interface Campaign {
  name: string
  pillar: string
  startWeek: number
  endWeek: number
  color: string
}

export interface MonthlyFocus {
  month: string
  theme: string
  intent: string
  priorities: string[]
  keyMoments: string[]
  watch: string
}

export interface Quarter {
  label: string
  year: number
  theme?: string
  months: Array<{ key: string; name: string; weeks: number[] }>
}

export interface KeyDate {
  date: string
  title: string
  type: 'holiday' | 'industry' | 'seasonal' | 'brand' | 'observance'
  relevance: 'low' | 'medium' | 'high'
  angle: string
}

export interface PlatformStrategy {
  name: string
  channelKey: string
  role: string
  rationale: string
  cadence: string
  formatMix: Array<{ label: string; weight: string }>
  watch: string[]
}

export interface StrategicPriority {
  label: string
  description: string
}

export interface Plan {
  agency: { name: string; tagline: string }
  client: {
    name: string
    industry: string
    handle: string
    logoInitials: string
    primaryChannels: string[]
  }
  quarter: Quarter
  headline?: string
  positioningStatement?: string
  strategy?: string
  strategicPriorities: StrategicPriority[]
  kpis?: Array<{ label: string; value: string }>
  pillars: Pillar[]
  campaigns: Campaign[]
  monthlyFocus: MonthlyFocus[]
  keyDates: KeyDate[]
  platforms: PlatformStrategy[]
  lastModified?: Record<string, string>
}

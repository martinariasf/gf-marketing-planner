export interface QuarterlyGoal {
  id: string
  label: string
  target: number
  unit: string
}

export interface MonthlyGoalRef {
  ref: string
  target: number
}

export interface WeeklyFocus {
  week: number
  focus: string
  kpi: string
  channel?: string
  message?: string
  audience?: string
  kpiTarget?: number
}

export interface Goals {
  quarterly: QuarterlyGoal[]
  monthly: Array<{ month: string; goals: MonthlyGoalRef[] }>
  weekly: WeeklyFocus[]
}

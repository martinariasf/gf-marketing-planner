export interface QuarterlyGoal {
  id: string
  label: string
  target: number
  unit: string
  dueDate?: string      // ISO date e.g. "2026-09-30"
  current?: number      // current progress value, same unit as target (for the progress bar)
  kpiRef?: string       // optional id/label linking this objective to a KPI on the page
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

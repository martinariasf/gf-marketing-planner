export type ClientStatus = 'demo' | 'active' | 'paused' | 'onboarding' | 'archived'

export interface ClientIndexEntry {
  slug: string
  name: string
  industry: string
  logoInitials: string
  quarter?: string
  headline?: string
  status: ClientStatus
}

export interface ClientIndex {
  clients: ClientIndexEntry[]
}

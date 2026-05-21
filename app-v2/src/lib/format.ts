const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const FULL = new Intl.NumberFormat('en-US')

export function fmtNumber(n: number): string {
  return FULL.format(Math.round(n))
}

export function fmtCompact(n: number): string {
  return COMPACT.format(n)
}

export function fmtPct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`
}

export function fmtDelta(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(0)}%`
}

const DATE_LONG = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const DATE_SHORT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
})

export function fmtDate(iso: string): string {
  return DATE_LONG.format(new Date(iso))
}

export function fmtDateShort(iso: string): string {
  return DATE_SHORT.format(new Date(iso))
}

export function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

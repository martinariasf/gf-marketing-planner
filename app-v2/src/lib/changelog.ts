// Product changelog shown at /changelog and surfaced by the "What's new" link
// in the header. This is the single source of truth — append a new entry at the
// TOP for every promotion to production. The promote-staging-to-prod skill has a
// step for this.
//
// Entry prose is English-only on purpose: release notes are awkward to mirror
// across ES/DE and go stale fast. The surrounding UI chrome (link label, page
// title) IS translated via i18n-dict.ts.

export type ChangelogEntry = {
  /** ISO date (YYYY-MM-DD) the change went live in production. */
  date: string
  /** Short headline for the release. */
  title: string
  /** User-facing bullet points — what changed, in plain language. */
  items: string[]
}

// Newest first. The top entry drives the "What's new" dot.
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-06-15',
    title: 'Collaboration, exports & a full approval workflow',
    items: [
      'Shareable review links: send a protected link so an external reviewer can view the content calendar and leave feedback — no account needed.',
      'Export the content plan to PDF and Word straight from the dashboard.',
      'Multi-network scheduling with per-channel icons on the calendar.',
      'Full content-status workflow — Draft → Review → Approved → Programmed → Rechecked — plus a read-only Published lane and the option to delete posts with confirmation.',
      'Multi-session chat with Viktor in the dashboard.',
      'Integration credentials such as your Postiz API key are now encrypted at rest.',
    ],
  },
]

/** Identifier of the latest entry — used to track whether the user has seen it. */
export const latestEntryId = (): string => CHANGELOG[0]?.date ?? ''

const SEEN_KEY = 'gf-mp:changelog-seen'

/** True when there is a latest entry the user hasn't visited yet. */
export function hasUnseenChangelog(): boolean {
  const latest = latestEntryId()
  if (!latest) return false
  try {
    return localStorage.getItem(SEEN_KEY) !== latest
  } catch {
    return false
  }
}

/** Mark the latest entry as seen (called when the changelog page is opened). */
export function markChangelogSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, latestEntryId())
  } catch {
    /* ignore — private mode / storage disabled */
  }
}

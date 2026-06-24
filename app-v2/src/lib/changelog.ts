// Product changelog shown at /changelog and surfaced by the "What's new" link
// in the header. This is the single source of truth — append a new entry at the
// TOP for every staging deployment (the new-task-workflow skill has a step for
// this). The promote-staging-to-prod skill confirms the entry and updates its
// date to the production go-live when the change is promoted to main.
//
// Entry prose is English-only on purpose: release notes are awkward to mirror
// across ES/DE and go stale fast. The surrounding UI chrome (link label, page
// title) IS translated via i18n-dict.ts.

export type ChangelogEntry = {
  /** ISO date (YYYY-MM-DD) the change shipped to staging; updated to the
   *  production go-live date when promoted to main. */
  date: string
  /** Short headline for the release. */
  title: string
  /** User-facing bullet points — what changed, in plain language. */
  items: string[]
}

// Newest first. The top entry drives the "What's new" dot.
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: '2026-06-24',
    title: 'Friendlier post names & one-click jump to the calendar',
    items: [
      'Posts now show a simple running name like "Post 12" instead of a cryptic internal code, in Approvals and across the calendar.',
      'Click a post’s name in Approvals to jump straight to that post in the Content Calendar.',
    ],
  },
  {
    date: '2026-06-19',
    title: 'Real scheduling, a smarter Viktor & finer sharing controls',
    items: [
      'Programmed posts are now actually scheduled for publishing on your connected platform, and move to Published automatically once they go live.',
      'You can no longer accidentally schedule a post with a past date — the system asks you to pick a future date.',
      '"Add Post" now creates the post in the month you are viewing, not somewhere else.',
      'New "Visual Guidelines" field in Company Context — set your layout, colour and font rules once and Viktor applies them to every image for a consistent feed.',
      'Viktor now creates Instagram images in the correct vertical 4:5 format with larger, cleaner text, keeps visuals consistent across posts, and never invents logos.',
      'Choose exactly which months to include when you share an external review link.',
      'Simpler setup for connecting an external AI assistant — one-click copy of your integration details, with up-to-date API docs.',
      'Cleaner chat replies from Viktor, without internal status noise.',
      'Chat edits — including image changes — now appear automatically when Viktor finishes, with no manual page refresh.',
      'Rejected posts are hidden from the calendar (and kept in a collapsible, recoverable list) so your plan stays uncluttered.',
      'New Reload button refreshes the content calendar without reloading the whole page.',
      'Fixed the calendar post-navigation arrows so they stay put and are reliably clickable.',
      'Tidier Approvals board: cards are moved by dragging them between columns (the extra per-card buttons are gone), and the board is simply called "Kanban".',
    ],
  },
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

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
    date: '2026-08-06',
    title: 'New: a Configuration page with two per-client dashboard switches',
    items: [
      'A new "Configuration" tab lets you turn the "AI generated" label on posts on or off, and turn on auto-programming so an approved post is sent straight to your publishing tool instead of waiting for a separate "Programmed" step.',
      'If auto-programming a post fails (for example a past date, or no publishing tool connected), the approval still goes through — you just get a heads-up instead of the approval failing outright.',
    ],
  },
  {
    date: '2026-08-06',
    title: 'Fixed: approving a post to "Programmed" could leave it stuck in an earlier column',
    items: [
      'Moving a post to Programmed from the Approvals board now updates its status everywhere, so it reliably shows up in the Programmed lane instead of sometimes staying in Approved or Draft.',
      'A Programmed post now shows whether it was actually scheduled with the provider (with the date and provider name), and flags it clearly when the schedule could not be confirmed or failed.',
    ],
  },
  {
    date: '2026-08-06',
    title: 'Fixed garbled dashes and ellipses in the calendar export and placeholders',
    items: [
      'The export date-range label and the hashtag/CTA placeholder text in the calendar could show a garbled character sequence (mojibake) instead of a dash or ellipsis — those now render correctly.',
    ],
  },
  {
    date: '2026-08-06',
    title: 'Attach images and documents in chat',
    items: [
      'You can now attach images and text documents when chatting with Viktor — drag and drop them onto the chat composer or use the new paperclip button. Attached images can be used directly as a reference for image generation; attached documents (notes, transcripts, CSV, etc.) are read and used as context for the reply.',
    ],
  },
  {
    date: '2026-08-06',
    title: "You'll now be told when a limit is hit, instead of silence",
    items: [
      "If the AI hits today's usage limit, a rate limit, a provider auth problem, or its response gets cut off, you now get a clear message explaining what happened — in the dashboard chat and on Telegram — instead of the assistant just going quiet or replying with nothing.",
    ],
  },
  {
    date: '2026-07-08',
    title: 'Status changes made by Viktor now show up on reload',
    items: [
      'When Viktor moves a post to another status (for example into Review), the calendar and kanban now reflect it as soon as you press the reload button — previously his change could stay invisible on posts that had already been approved or reviewed in the dashboard.',
    ],
  },
  {
    date: '2026-07-08',
    title: 'Post media is now labelled as AI generated',
    items: [
      'Images and videos that Viktor generated now carry a small "AI generated" label in the Instagram and LinkedIn previews, so you can tell at a glance which media is AI-made before it goes out — and stay on the right side of the platforms\' disclosure rules.',
    ],
  },
  {
    date: '2026-07-08',
    title: 'Video posts play right in the preview',
    items: [
      'A video post used to look like a still image with no way to play it. The preview now plays the real clip in place, and Instagram shows it in a vertical reel frame while LinkedIn keeps its landscape frame without cropping your vertical clips.',
    ],
  },
  {
    date: '2026-07-08',
    title: 'General review comments are shown in full, next to every post',
    items: [
      'On the review link you share with clients and colleagues, a comment that applies to the whole set now appears in full underneath every post — not just once at the bottom, and no longer cut off mid-sentence. It is marked "Applies to all posts" so nobody mistakes it for feedback on a single item.',
    ],
  },
  {
    date: '2026-07-04',
    title: 'Every generated image and video now shows up in Assets',
    items: [
      'The Assets tab now also lists images and videos that are attached to your posts but were missing from the asset catalogue — nothing Viktor creates can silently disappear from the gallery anymore. This is what previously made some generated videos invisible.',
    ],
  },
  {
    date: '2026-07-04',
    title: 'Connect a Google Drive folder to Viktor',
    items: [
      'The Integration tab now shows Viktor’s own Google Drive address — the one you share your folders with so he can read your logos, briefs and reference files. Copy it with one click and share your folder with it as a Viewer in Google Drive.',
    ],
  },
  {
    date: '2026-07-02',
    title: 'Months, dates and more now follow your chosen language',
    items: [
      'Months and dates across the dashboard (calendar, goals, post dates) now appear in the language you pick — German and Spanish no longer showed English months.',
      'Completed the translations: the error screen, upload messages, the Videos page and the Information Sources panel are now fully available in English, German and Spanish.',
    ],
  },
  {
    date: '2026-07-01',
    title: 'Clearer "out of credits" and error messages in the chat',
    items: [
      'When the daily usage limit is reached, the chat now says so in plain language ("You\'ve reached today\'s usage limit — credits renew at midnight") in your client\'s language, instead of showing a raw English error code.',
      'Other automatic notices — a run that could not finish, timed out, or ended without a written reply — now appear as friendly, localized messages, and they read the same when you reload the conversation.',
      'The activity chips that show Viktor working no longer display internal tool names for actions without a friendly label — they show a neutral "Working…" instead.',
    ],
  },
  {
    date: '2026-06-26',
    title: 'Viktor speaks Spanish even in his automatic messages',
    items: [
      "Viktor's built-in system replies (command responses, confirmations, session notices) now appear in Spanish instead of English — previously only his written answers followed your language.",
      'Removed an internal technical note ("file-mutation verifier") that occasionally leaked into the chat and was never meant for you.',
    ],
  },
  {
    date: '2026-06-26',
    title: 'Carousels now keep all their slides',
    items: [
      'When Viktor builds an Instagram carousel, every slide is now saved to the post and shown in the calendar — previously only the cover image appeared.',
      'Each slide is attached the moment it is created, so a carousel is never left half-built if a generation is interrupted.',
    ],
  },
  {
    date: '2026-06-26',
    title: 'Sign in with your own account',
    items: [
      'You now sign in to the dashboard with your own email and password instead of a shared site password.',
      'You only see the clients your account is allowed to access, can switch between them, and can sign out cleanly — no more browser login pop-ups.',
    ],
  },
  {
    date: '2026-06-23',
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

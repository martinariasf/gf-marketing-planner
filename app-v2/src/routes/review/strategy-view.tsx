// GF-105 — the external "Share Strategy" page.
//
// The second kind of share link. Where routes/review/external.tsx reviews
// FINISHED creative (artwork, platform mockups, a swipeable deck), this one
// reviews the PLAN itself, before anything is produced: which topics, which
// formats, which networks, and how the posts are spread across the month.
//
// Deliberately a separate file. The content shell is ~1450 lines of deck /
// swipe / mockup / lightbox machinery that a text-only plan uses none of; the
// small presentational helpers it shares (comment row, decision badge, general
// note) are duplicated here rather than extracted, because extracting them
// would mean surgery on the deck. What is NOT duplicated is the contract: the
// same review* endpoints, the same postDecisions/comments plumbing, so every
// signal from this page lands in the dashboard Activity tab exactly as a
// content link's does.
//
// GF-106: the page now opens as a swipe DECK (the list stays behind a header
// toggle), the header names the company, a change request always carries a
// written reason (shared RejectSheet), and the post copy is labelled and
// expands in place. Dragging a card is presentation only — it never reorders
// the plan and never moves a post to another date.
//
// Hard rule: there is no image anywhere on this page — no <img>, no background
// image, no lightbox, no mockup. The API strips every image URL server-side for
// a strategy link, so nothing here may assume one exists.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion'
import {
  CheckCircle2,
  ChevronDown,
  GalleryHorizontalEnd,
  LayoutList,
  Loader2,
  MessageSquare,
  PenLine,
  Send,
  ThumbsUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { GFLogo } from '@/components/gf-logo'
import { ChannelIcon, CHANNEL_LABEL } from '@/components/channel-icon'
import { Pillar } from '@/components/pillar'
import { StrategyMonthGrid } from '@/components/strategy-month-grid'
import { RejectSheet } from '@/routes/review/reject-sheet'
import { useT } from '@/lib/i18n'
import { getFormatLocale } from '@/lib/format'
import { postFormatLabelKey } from '@/lib/post-format'
import { pillarColors } from '@/lib/section-accent'
import { cn } from '@/lib/utils'
import { parseIsoDay, monthKeyOfIsoDay } from '@/lib/calendar-date'
import {
  reviewComment,
  reviewDecision,
  reviewRefresh,
  type PublicPostDecision,
  type PublicReviewPayload,
  type PublicReviewPost,
  type ReviewComment,
} from '@/lib/api-client'
import type { Channel } from '@/types'

type T = (k: string, vars?: Record<string, string | number>) => string

// Swipe thresholds — same feel as the content deck (external.tsx).
const SWIPE_OFFSET_RATIO = 0.25
const SWIPE_OFFSET_MIN = 72
const SWIPE_VELOCITY = 500
const HINT_RANGE = 110

/**
 * Formats a post's calendar day. Only for date-only strings — a real timestamp
 * (a comment's createdAt) must go through fmtTimestamp instead.
 */
function fmtDate(iso: string): string {
  const d = parseIsoDay(iso)
  if (!d) return iso
  return d.toLocaleDateString(getFormatLocale(), { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Formats a genuine instant (comment createdAt), which DOES carry a timezone. */
function fmtTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(getFormatLocale(), { weekday: 'short', month: 'short', day: 'numeric' })
}

/** Every network a post targets. Prefer `channels`; fall back to `[channel]`. */
function channelsOf(post: PublicReviewPost): string[] {
  const list = post.channels && post.channels.length > 0 ? post.channels : post.channel ? [post.channel] : []
  return Array.from(new Set(list.filter(Boolean)))
}

function channelLabel(channel: string): string {
  return CHANNEL_LABEL[channel as Channel] ?? channel
}

/**
 * The visual description of a post, in the order the spec fixes:
 *   1. the slide captions (a carousel's per-slide design brief),
 *   2. the media captions,
 *   3. — nothing authored — the post copy, as a stand-in.
 *
 * The distinction matters and is preserved by the caller: (1) and (2) are a real
 * brief and get the "Visual description" label; (3) is a fallback — the copy is
 * still rendered (labelled as the copy, GF-106) but muted and italic, and the
 * "no visual description yet" line stays, so a missing brief still reads as
 * missing instead of masquerading as one.
 */
type VisualBrief =
  | { kind: 'brief'; lines: string[]; numbered: boolean }
  | { kind: 'fallback'; text: string }
  | { kind: 'none' }

function visualBrief(post: PublicReviewPost): VisualBrief {
  const slideCaptions = (post.slides ?? []).map((s) => s.caption?.trim() ?? '')
  if (slideCaptions.some(Boolean)) {
    return { kind: 'brief', lines: slideCaptions, numbered: slideCaptions.length > 1 }
  }
  const mediaCaptions = (post.media ?? []).map((m) => m.caption?.trim() ?? '').filter(Boolean)
  if (mediaCaptions.length > 0) {
    return { kind: 'brief', lines: mediaCaptions, numbered: mediaCaptions.length > 1 }
  }
  const copy = post.copy?.trim()
  if (copy) return { kind: 'fallback', text: copy }
  return { kind: 'none' }
}

/** How many frames a post has, when that is knowable without any image URL. */
function frameCount(post: PublicReviewPost): number {
  return Math.max(post.slides?.length ?? 0, post.media?.length ?? 0)
}

// ── Shell ────────────────────────────────────────────────────────────────────

export function StrategyReviewShell({
  publicId,
  token,
  payload,
  reviewerName,
  onRefreshed,
}: {
  publicId: string
  token: string
  payload: PublicReviewPayload
  reviewerName: string
  onRefreshed: (p: PublicReviewPayload) => void
}) {
  const t = useT()
  // GF-106: the deck is the default, exactly like the content link.
  const [mode, setMode] = useState<'deck' | 'list'>('deck')

  const decisionFor = useCallback(
    (postId: string) => payload.postDecisions?.find((d) => d.postId === postId),
    [payload.postDecisions],
  )

  const refresh = useCallback(async () => {
    try {
      onRefreshed(await reviewRefresh(publicId, token))
    } catch {
      /* keep the stale payload — the reviewer can retry */
    }
  }, [publicId, token, onRefreshed])

  const decide = useCallback(
    async (postId: string, decision: 'approved' | 'changes_requested', comment?: string) => {
      await reviewDecision(publicId, token, decision, { postId, name: reviewerName })
      if (comment && comment.trim()) {
        await reviewComment(publicId, token, comment.trim(), { postId, name: reviewerName })
      }
      await refresh()
    },
    [publicId, token, reviewerName, refresh],
  )

  const untagged = t('review.strategy.untagged')

  // Date order — a plan reads chronologically, whatever order the API returned.
  const posts = useMemo(
    () => [...payload.posts].sort((a, b) => a.date.localeCompare(b.date)),
    [payload.posts],
  )

  // One colour map over ALL shared posts, so a pillar keeps its colour in every
  // month grid and in every row chip.
  const colors = useMemo(
    () => pillarColors(posts.map((p) => p.pillar?.trim() || untagged)),
    [posts, untagged],
  )

  // Month buckets for the grids at the end, in chronological order.
  const months = useMemo(() => {
    const map = new Map<string, PublicReviewPost[]>()
    for (const p of posts) {
      const key = monthKeyOfIsoDay(p.date)
      if (!key) continue
      const bucket = map.get(key)
      if (bucket) bucket.push(p)
      else map.set(key, [p])
    }
    return Array.from(map, ([key, list]) => ({ key, list })).sort((a, b) => a.key.localeCompare(b.key))
  }, [posts])

  const generalComments = payload.comments.filter((c) => !c.postId)

  // GF-106: "Strategy Revision — «Company»" when the payload carries a brand;
  // otherwise the link's own title; otherwise the generic plan title. Never a
  // dangling dash. The eyebrow drops "Strategy review" when the H1 already
  // says it, so the word is not printed twice in a row.
  const company = payload.brand?.name?.trim()
  const heading = company
    ? t('review.strategy.titleFor', { company })
    : payload.link.title || t('review.strategy.title')
  const eyebrow = company ? t('review.strategy.eyebrowPlan') : t('review.strategy.eyebrow')

  return (
    <div className="min-h-screen bg-paper-muted flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-muted">{eyebrow}</p>
            <h1 className="truncate text-base font-semibold">{heading}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {posts.length > 0 && (
              <div className="flex rounded-lg border border-border-subtle bg-paper-muted/50 p-0.5 text-xs">
                <button
                  onClick={() => setMode('deck')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors',
                    mode === 'deck' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
                  )}
                  aria-label={t('review.ext.modeDeck')}
                >
                  <GalleryHorizontalEnd className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('review.ext.modeDeck')}</span>
                </button>
                <button
                  onClick={() => setMode('list')}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors',
                    mode === 'list' ? 'bg-paper text-ink shadow-sm' : 'text-ink-muted hover:text-ink',
                  )}
                  aria-label={t('review.ext.modeList')}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('review.ext.modeList')}</span>
                </button>
              </div>
            )}
            <GFLogo size="sm" />
          </div>
        </div>
      </header>

      {mode === 'deck' && posts.length > 0 ? (
        <StrategyDeckView
          t={t}
          publicId={publicId}
          token={token}
          posts={posts}
          months={months}
          colors={colors}
          untagged={untagged}
          payload={payload}
          reviewerName={reviewerName}
          decisionFor={decisionFor}
          decide={decide}
          onRefreshed={onRefreshed}
          onSwitchToList={() => setMode('list')}
        />
      ) : (
        <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6 sm:px-6">
          <p className="text-sm text-ink-muted">
            {t('review.strategy.welcome', { name: reviewerName })}
          </p>

          {posts.length === 0 ? (
            <div className="rounded-xl border border-border-subtle bg-paper p-10 text-center text-sm text-ink-muted">
              {t('review.strategy.noPosts')}
            </div>
          ) : (
            <>
              <section className="overflow-hidden rounded-xl border border-border-subtle bg-paper">
                <header className="flex items-baseline justify-between gap-3 border-b border-border-subtle px-4 py-3">
                  <h2 className="text-sm font-semibold">{t('review.strategy.planTitle')}</h2>
                  <span className="shrink-0 text-[11px] text-ink-muted">
                    {t('review.strategy.totalPosts', { n: posts.length })}
                  </span>
                </header>
                <div className="divide-y divide-border-subtle">
                  {posts.map((post) => (
                    <StrategyRow
                      key={post.id}
                      t={t}
                      post={post}
                      pillarColor={colors[post.pillar?.trim() || untagged]}
                      untagged={untagged}
                      decision={decisionFor(post.id)}
                      comments={payload.comments.filter((c) => c.postId === post.id)}
                      generalComments={generalComments}
                      publicId={publicId}
                      token={token}
                      reviewerName={reviewerName}
                      decide={decide}
                      onRefreshed={onRefreshed}
                    />
                  ))}
                </div>
              </section>

              {/* Plan overview — one grid + volume summary per shared month. */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold">{t('review.strategy.overviewTitle')}</h2>
                {months.map((m) => (
                  <StrategyMonthGrid
                    key={m.key}
                    monthKey={m.key}
                    posts={m.list}
                    pillarColorMap={colors}
                  />
                ))}
              </section>
            </>
          )}

          <OverallVerdict
            t={t}
            publicId={publicId}
            token={token}
            reviewerName={reviewerName}
            generalComments={generalComments}
            onRefreshed={onRefreshed}
          />

          <footer className="pb-6 text-center text-[11px] text-ink-muted">{t('review.ext.footer')}</footer>
        </main>
      )}
    </div>
  )
}

// ── Shared post fields (one source of truth for deck AND list) ───────────────

/**
 * Everything a reviewer reads about a single planned post: date, title,
 * networks, pillar, format, visual description and the copy. Rendered
 * identically in a list row and on a deck card so the two cannot drift.
 * Text only — no image of any kind (the page's hard rule).
 */
function StrategyPostFields({
  t,
  post,
  pillarColor,
  untagged,
}: {
  t: T
  post: PublicReviewPost
  pillarColor?: string
  untagged: string
}) {
  const channels = channelsOf(post)
  const brief = visualBrief(post)
  const frames = frameCount(post)
  const formatKey = post.format ? postFormatLabelKey(post.format) : undefined
  const formatLabel = formatKey ? t(formatKey) : post.format?.trim() || untagged

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            {fmtDate(post.date)}
          </p>
          <h3 className="mt-0.5 text-sm font-semibold leading-snug">{post.title}</h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {channels.map((c) => (
            <ChannelIcon key={c} channel={c} className="h-4 w-4" />
          ))}
        </div>
      </div>

      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[8.5rem_1fr]">
        <dt className="text-ink-muted">{t('review.strategy.fieldPillar')}</dt>
        <dd className="min-w-0">
          <Pillar name={post.pillar?.trim() || untagged} color={pillarColor} />
        </dd>

        <dt className="mt-1.5 text-ink-muted sm:mt-0">{t('review.strategy.fieldFormat')}</dt>
        <dd className="min-w-0 text-ink">
          {formatLabel}
          {frames > 1 && (
            <span className="text-ink-muted"> · {t('review.strategy.slidesCount', { n: frames })}</span>
          )}
        </dd>

        <dt className="mt-1.5 text-ink-muted sm:mt-0">{t('review.strategy.fieldPlatforms')}</dt>
        <dd className="min-w-0 text-ink">
          {channels.length > 0 ? channels.map(channelLabel).join(' · ') : untagged}
        </dd>

        {brief.kind === 'brief' && (
          <>
            <dt className="mt-1.5 text-ink-muted sm:mt-0">{t('review.strategy.fieldVisual')}</dt>
            <dd className="min-w-0 text-ink">
              {brief.numbered ? (
                <ol className="space-y-0.5">
                  {brief.lines.map((line, i) => (
                    <li key={i} className="flex gap-1.5">
                      <span className="shrink-0 text-ink-muted tabular-nums">
                        {t('review.strategy.slideN', { n: i + 1 })}
                      </span>
                      <span className="min-w-0 whitespace-pre-line">{line || '—'}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="whitespace-pre-line">{brief.lines[0]}</p>
              )}
            </dd>
          </>
        )}
      </dl>

      {/* No authored brief: say so plainly. The copy below then stands in for it,
          muted, so a missing brief reads as missing rather than as a real one. */}
      {brief.kind !== 'brief' && (
        <p className="mt-2 text-xs italic text-ink-muted">{t('review.strategy.noVisual')}</p>
      )}

      {post.copy && <CopyBlock t={t} post={post} muted={brief.kind === 'fallback'} />}
    </>
  )
}

/**
 * The post copy, labelled as such (GF-106 item 4) and expanding IN PLACE
 * (item 5): one paragraph node, `line-clamp-3` while collapsed and unclamped
 * when expanded, so the opening lines stay exactly where they were and the rest
 * simply continues below them. The label + toggle sit ABOVE the text, so
 * collapsing cannot move the block's top edge and jump the scroll position.
 */
function CopyBlock({ t, post, muted }: { t: T; post: PublicReviewPost; muted: boolean }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={cn('mt-2', muted && 'border-l-2 border-border-subtle pl-2.5')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
          {t('review.strategy.copyLabel')}
        </p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand-blue hover:underline"
        >
          <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
          {t(expanded ? 'review.strategy.copyLess' : 'review.strategy.copyMore')}
        </button>
      </div>
      <p
        className={cn(
          'mt-1 whitespace-pre-line text-xs leading-relaxed',
          muted ? 'italic text-ink-muted' : 'text-ink',
          !expanded && 'line-clamp-3',
        )}
      >
        {post.copy}
      </p>
      {expanded && (
        <>
          {post.hashtags && post.hashtags.length > 0 && (
            <p className="mt-1 text-[11px] font-medium text-brand-blue">{post.hashtags.join(' ')}</p>
          )}
          {post.cta && <p className="mt-1 text-[11px] font-semibold text-ink">{post.cta}</p>}
        </>
      )}
    </div>
  )
}

// ── One post = one text row ──────────────────────────────────────────────────

function StrategyRow({
  t,
  post,
  pillarColor,
  untagged,
  decision,
  comments,
  generalComments,
  publicId,
  token,
  reviewerName,
  decide,
  onRefreshed,
}: {
  t: T
  post: PublicReviewPost
  pillarColor?: string
  untagged: string
  decision?: PublicPostDecision
  comments: ReviewComment[]
  generalComments: ReviewComment[]
  publicId: string
  token: string
  reviewerName: string
  decide: (postId: string, d: 'approved' | 'changes_requested', comment?: string) => Promise<void>
  onRefreshed: (p: PublicReviewPayload) => void
}) {
  const [showBox, setShowBox] = useState(false)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [deciding, setDeciding] = useState(false)
  // GF-106: requesting changes always goes through the sheet, so it always
  // carries a written reason.
  const [sheetOpen, setSheetOpen] = useState(false)

  const send = async () => {
    if (!body.trim()) return
    setPosting(true)
    try {
      await reviewComment(publicId, token, body.trim(), { postId: post.id, name: reviewerName })
      setBody('')
      setShowBox(false)
      onRefreshed(await reviewRefresh(publicId, token))
    } catch {
      /* ignore — the reviewer can retry */
    } finally {
      setPosting(false)
    }
  }

  const onDecide = async (d: 'approved' | 'changes_requested', comment?: string) => {
    if (deciding || (decision?.decision === d && !comment)) return
    setDeciding(true)
    try {
      await decide(post.id, d, comment)
      setSheetOpen(false)
    } catch {
      /* ignore — the reviewer can retry */
    } finally {
      setDeciding(false)
    }
  }

  return (
    <article className="px-4 py-4 sm:px-5">
      <StrategyPostFields t={t} post={post} pillarColor={pillarColor} untagged={untagged} />

      {/* Feedback — the same endpoints and signals as a content link. */}
      <div className="mt-3 space-y-2">
        <DecisionBadge t={t} decision={decision} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={decision?.decision === 'approved' ? 'default' : 'outline'}
            onClick={() => void onDecide('approved')}
            disabled={deciding}
          >
            <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
            {t('review.ext.acceptPost')}
          </Button>
          <Button
            size="sm"
            variant={decision?.decision === 'changes_requested' ? 'default' : 'outline'}
            onClick={() => setSheetOpen(true)}
            disabled={deciding}
          >
            <PenLine className="mr-1.5 h-3.5 w-3.5" />
            {t('review.ext.rejectPost')}
          </Button>
          {!showBox && (
            <Button size="sm" variant="ghost" onClick={() => setShowBox(true)}>
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              {t('review.ext.addComment')}
            </Button>
          )}
          {deciding && <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />}
        </div>

        {comments.length > 0 && (
          <div className="space-y-1.5">
            {comments.map((c) => (
              <CommentRow key={c.id} c={c} t={t} />
            ))}
          </div>
        )}

        <GeneralCommentsNote t={t} comments={generalComments} />

        {showBox && (
          <div className="space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              autoFocus
              placeholder={t('review.ext.commentPlaceholder')}
              className="w-full resize-y rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={send} disabled={posting || !body.trim()}>
                {posting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('review.ext.sendComment')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowBox(false)} disabled={posting}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <RejectSheet
        t={t}
        open={sheetOpen}
        busy={deciding}
        onCancel={() => setSheetOpen(false)}
        onSubmit={(comment) => void onDecide('changes_requested', comment)}
      />
    </article>
  )
}

// ── Deck view: one plan card at a time, swipe or buttons ─────────────────────

type MonthBucket = { key: string; list: PublicReviewPost[] }

/**
 * The plan résumé: one calendar grid + volume summary per shared month.
 *
 * In deck mode this sits at the TOP — above the first card and above the
 * end-of-deck recap — so the reviewer sees how the month is laid out before
 * judging any single post, instead of discovering it only after the last card.
 * It is collapsible because the grids are tall on a phone; `open` is owned by
 * the deck, so collapsing it once holds for every card AND for the summary
 * screen rather than springing back open on each render.
 *
 * List mode keeps its own overview at the end — there the whole plan is already
 * on screen above it, so the grids read as a closing summary, not as context.
 */
function StrategyPlanOverview({
  t,
  months,
  colors,
  open,
  onToggle,
}: {
  t: T
  months: MonthBucket[]
  colors: Record<string, string>
  open: boolean
  onToggle: () => void
}) {
  if (months.length === 0) return null
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('review.strategy.overviewTitle')}</h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-brand-blue hover:underline"
        >
          <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
          {t(open ? 'review.strategy.overviewHide' : 'review.strategy.overviewShow')}
        </button>
      </div>
      {open && (
        <div className="space-y-3">
          {months.map((m) => (
            <StrategyMonthGrid key={m.key} monthKey={m.key} posts={m.list} pillarColorMap={colors} />
          ))}
        </div>
      )}
    </section>
  )
}

function StrategyDeckView({
  t,
  publicId,
  token,
  posts,
  months,
  colors,
  untagged,
  payload,
  reviewerName,
  decisionFor,
  decide,
  onRefreshed,
  onSwitchToList,
}: {
  t: T
  publicId: string
  token: string
  posts: PublicReviewPost[]
  months: MonthBucket[]
  colors: Record<string, string>
  untagged: string
  payload: PublicReviewPayload
  reviewerName: string
  decisionFor: (postId: string) => PublicPostDecision | undefined
  decide: (postId: string, d: 'approved' | 'changes_requested', comment?: string) => Promise<void>
  onRefreshed: (p: PublicReviewPayload) => void
  onSwitchToList: () => void
}) {
  const generalComments = payload.comments.filter((c) => !c.postId)
  const [index, setIndex] = useState(0)
  const [exitDir, setExitDir] = useState(0)
  const [busy, setBusy] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  // Owned here, not by StrategyPlanOverview, so the reviewer's choice survives
  // every card change and carries into the end-of-deck summary screen.
  const [overviewOpen, setOverviewOpen] = useState(true)
  const toggleOverview = useCallback(() => setOverviewOpen((v) => !v), [])

  const post = posts[index]
  const done = index >= posts.length

  const advance = useCallback(() => {
    setSheetOpen(false)
    setIndex((i) => i + 1)
  }, [])

  const accept = useCallback(async () => {
    if (!post || busy) return
    setBusy(true)
    setExitDir(1)
    try {
      await decide(post.id, 'approved')
      advance()
    } catch {
      setExitDir(0)
    } finally {
      setBusy(false)
    }
  }, [post, busy, decide, advance])

  // Always called with a reason — the sheet cannot submit an empty one.
  const requestChanges = useCallback(
    async (comment: string) => {
      if (!post || busy) return
      setBusy(true)
      setExitDir(-1)
      try {
        await decide(post.id, 'changes_requested', comment)
        advance()
      } catch {
        setExitDir(0)
      } finally {
        setBusy(false)
      }
    },
    [post, busy, decide, advance],
  )

  const skip = useCallback(() => {
    if (busy) return
    setExitDir(0)
    advance()
  }, [busy, advance])

  // Keyboard parity with the content deck: → accept, ← open the changes sheet.
  useEffect(() => {
    if (done) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (sheetOpen) return
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        void accept()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setSheetOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [done, sheetOpen, accept])

  if (done || !post) {
    return (
      <StrategySummaryScreen
        t={t}
        publicId={publicId}
        token={token}
        posts={posts}
        months={months}
        colors={colors}
        reviewerName={reviewerName}
        generalComments={generalComments}
        decisionFor={decisionFor}
        onRefreshed={onRefreshed}
        onRevisit={(i) => {
          setExitDir(0)
          setIndex(i)
        }}
        onSwitchToList={onSwitchToList}
        overviewOpen={overviewOpen}
        onToggleOverview={toggleOverview}
      />
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
      {/* Plan résumé first: the month at a glance, before any single card. */}
      <StrategyPlanOverview
        t={t}
        months={months}
        colors={colors}
        open={overviewOpen}
        onToggle={toggleOverview}
      />

      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{t('review.ext.progress', { n: index + 1, total: posts.length })}</span>
          <span className="hidden sm:inline">{t('review.ext.swipeHint')}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border-subtle">
          <motion.div
            className="h-full rounded-full bg-brand-blue"
            animate={{ width: `${(index / posts.length) * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Card stack */}
      <div className="relative min-h-[420px] flex-1">
        {posts[index + 1] && (
          <div className="absolute inset-x-2 bottom-0 top-2 -z-10 rounded-xl border border-border-subtle bg-paper/70" />
        )}
        <AnimatePresence custom={exitDir} mode="popLayout">
          <StrategyDeckCard
            key={post.id}
            t={t}
            post={post}
            pillarColor={colors[post.pillar?.trim() || untagged]}
            untagged={untagged}
            decision={decisionFor(post.id)}
            comments={payload.comments.filter((c) => c.postId === post.id)}
            generalComments={generalComments}
            exitDir={exitDir}
            busy={busy}
            onAccept={() => void accept()}
            onReject={() => setSheetOpen(true)}
          />
        </AnimatePresence>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-center gap-3">
        <Button
          size="lg"
          variant="outline"
          disabled={busy}
          onClick={() => setSheetOpen(true)}
          className="rounded-full border-amber-300 px-5 text-amber-700 hover:bg-amber-50"
        >
          <PenLine className="mr-2 h-4 w-4" />
          {t('review.ext.rejectPost')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={skip} className="text-ink-muted">
          {t('review.ext.skip')}
        </Button>
        <Button
          size="lg"
          disabled={busy}
          onClick={() => void accept()}
          className="rounded-full bg-emerald-600 px-5 hover:bg-emerald-700"
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ThumbsUp className="mr-2 h-4 w-4" />}
          {t('review.ext.acceptPost')}
        </Button>
      </div>

      <RejectSheet
        t={t}
        open={sheetOpen}
        busy={busy}
        onCancel={() => setSheetOpen(false)}
        onSubmit={(comment) => void requestChanges(comment)}
      />
    </main>
  )
}

/**
 * One plan card. The drag is PRESENTATION ONLY: it animates the card and, past
 * the threshold, triggers the same accept / request-changes actions the buttons
 * do. It never reorders the plan and never changes a post's date.
 */
function StrategyDeckCard({
  t,
  post,
  pillarColor,
  untagged,
  decision,
  comments,
  generalComments,
  exitDir,
  busy,
  onAccept,
  onReject,
}: {
  t: T
  post: PublicReviewPost
  pillarColor?: string
  untagged: string
  decision?: PublicPostDecision
  comments: ReviewComment[]
  generalComments: ReviewComment[]
  exitDir: number
  busy: boolean
  onAccept: () => void
  onReject: () => void
}) {
  const reduced = useReducedMotion()
  const cardRef = useRef<HTMLElement | null>(null)

  const x = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-11, 11])
  const acceptTint = useTransform(x, [0, HINT_RANGE], [0, 0.22])
  const rejectTint = useTransform(x, [-HINT_RANGE, 0], [0.22, 0])
  const acceptHint = useTransform(x, [20, HINT_RANGE], [0, 1])
  const rejectHint = useTransform(x, [-HINT_RANGE, -20], [1, 0])
  const acceptScale = useTransform(x, [20, HINT_RANGE], [0.7, 1.15])
  const rejectScale = useTransform(x, [-HINT_RANGE, -20], [1.15, 0.7])

  return (
    <motion.article
      ref={cardRef}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{
        x: exitDir === 0 ? 0 : exitDir * 560,
        opacity: 0,
        rotate: exitDir * 10,
        transition: { duration: 0.28, ease: 'easeIn' },
      }}
      drag={busy ? false : 'x'}
      dragSnapToOrigin
      dragElastic={0.65}
      whileDrag={reduced ? undefined : { scale: 1.02 }}
      style={reduced ? { x } : { x, rotate }}
      onDragEnd={(_, info) => {
        const width = cardRef.current?.offsetWidth ?? 320
        const threshold = Math.max(SWIPE_OFFSET_MIN, width * SWIPE_OFFSET_RATIO)
        if (info.offset.x > threshold || info.velocity.x > SWIPE_VELOCITY) onAccept()
        else if (info.offset.x < -threshold || info.velocity.x < -SWIPE_VELOCITY) onReject()
      }}
      className="absolute inset-0 flex cursor-grab flex-col overflow-hidden rounded-xl border border-border-subtle bg-paper touch-pan-y active:cursor-grabbing"
    >
      {!reduced && (
        <>
          <motion.div
            style={{ opacity: acceptTint }}
            className="pointer-events-none absolute inset-0 z-[5] bg-emerald-500"
          />
          <motion.div
            style={{ opacity: rejectTint }}
            className="pointer-events-none absolute inset-0 z-[5] bg-amber-500"
          />
        </>
      )}

      <motion.div
        style={{ opacity: acceptHint, scale: acceptScale }}
        className="pointer-events-none absolute left-5 top-5 z-10 rotate-[-12deg] rounded-xl border-[3px] border-emerald-500 bg-paper/85 px-4 py-1.5 text-lg font-extrabold uppercase tracking-wide text-emerald-600 shadow-sm"
      >
        {t('review.ext.acceptPost')}
      </motion.div>
      <motion.div
        style={{ opacity: rejectHint, scale: rejectScale }}
        className="pointer-events-none absolute right-5 top-5 z-10 rotate-[12deg] rounded-xl border-[3px] border-amber-500 bg-paper/85 px-4 py-1.5 text-lg font-extrabold uppercase tracking-wide text-amber-600 shadow-sm"
      >
        {t('review.ext.rejectPost')}
      </motion.div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <StrategyPostFields t={t} post={post} pillarColor={pillarColor} untagged={untagged} />
        {(decision || comments.length > 0 || generalComments.length > 0) && (
          <div className="mt-3 space-y-2 border-t border-border-subtle pt-3">
            <DecisionBadge t={t} decision={decision} />
            {comments.map((c) => (
              <CommentRow key={c.id} c={c} t={t} />
            ))}
            <GeneralCommentsNote t={t} comments={generalComments} />
          </div>
        )}
      </div>
    </motion.article>
  )
}

// ── End of deck: recap, month grids, overall verdict ─────────────────────────

function StrategySummaryScreen({
  t,
  publicId,
  token,
  posts,
  months,
  colors,
  reviewerName,
  generalComments,
  decisionFor,
  onRefreshed,
  onRevisit,
  onSwitchToList,
  overviewOpen,
  onToggleOverview,
}: {
  t: T
  publicId: string
  token: string
  posts: PublicReviewPost[]
  months: MonthBucket[]
  colors: Record<string, string>
  reviewerName: string
  generalComments: ReviewComment[]
  decisionFor: (postId: string) => PublicPostDecision | undefined
  onRefreshed: (p: PublicReviewPayload) => void
  onRevisit: (index: number) => void
  onSwitchToList: () => void
  overviewOpen: boolean
  onToggleOverview: () => void
}) {
  const counts = useMemo(() => {
    let approved = 0
    let changes = 0
    let skipped = 0
    for (const p of posts) {
      const d = decisionFor(p.id)
      if (!d) skipped++
      else if (d.decision === 'approved') approved++
      else changes++
    }
    return { approved, changes, skipped }
  }, [posts, decisionFor])

  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-5 px-4 py-6 sm:px-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <h2 className="text-lg font-semibold">{t('review.ext.summaryTitle')}</h2>
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
            {t('review.ext.summaryAccepted', { n: counts.approved })}
          </span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
            {t('review.ext.summaryChanges', { n: counts.changes })}
          </span>
          {counts.skipped > 0 && (
            <span className="rounded-full bg-paper-muted px-2.5 py-1 font-medium text-ink-muted">
              {t('review.ext.summarySkipped', { n: counts.skipped })}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted">{t('review.ext.summaryRevisit')}</p>
      </motion.div>

      {/* Plan résumé, above the per-post recap: the reviewer reads how the plan
          is spread across each month first, then the post-by-post outcome. */}
      <StrategyPlanOverview
        t={t}
        months={months}
        colors={colors}
        open={overviewOpen}
        onToggle={onToggleOverview}
      />

      {/* Recap — text only, no cover thumbnails: this page never shows images. */}
      <div className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-paper">
        {posts.map((p, i) => {
          const d = decisionFor(p.id)
          return (
            <button
              key={p.id}
              onClick={() => onRevisit(i)}
              className="flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-paper-muted/50"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{p.title}</span>
                <span className="block text-[10px] text-ink-muted">{fmtDate(p.date)}</span>
              </span>
              {!d ? (
                <span className="shrink-0 text-[10px] text-ink-muted">{t('review.ext.notReviewed')}</span>
              ) : d.decision === 'approved' ? (
                <ThumbsUp className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <PenLine className="h-4 w-4 shrink-0 text-amber-600" />
              )}
            </button>
          )
        })}
      </div>

      <OverallVerdict
        t={t}
        publicId={publicId}
        token={token}
        reviewerName={reviewerName}
        generalComments={generalComments}
        onRefreshed={onRefreshed}
      />

      <div className="text-center">
        <Button variant="ghost" size="sm" onClick={onSwitchToList} className="text-ink-muted">
          <LayoutList className="mr-1.5 h-3.5 w-3.5" />
          {t('review.ext.modeList')}
        </Button>
      </div>

      <footer className="pb-6 text-center text-[11px] text-ink-muted">{t('review.ext.footer')}</footer>
    </main>
  )
}

// ── Overall verdict ──────────────────────────────────────────────────────────

function OverallVerdict({
  t,
  publicId,
  token,
  reviewerName,
  generalComments,
  onRefreshed,
}: {
  t: T
  publicId: string
  token: string
  reviewerName: string
  generalComments: ReviewComment[]
  onRefreshed: (p: PublicReviewPayload) => void
}) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [decisionDone, setDecisionDone] = useState<null | 'approved' | 'changes_requested'>(null)

  const submitDecision = async (decision: 'approved' | 'changes_requested') => {
    setSubmitting(true)
    try {
      await reviewDecision(publicId, token, decision, { note: note.trim() || undefined, name: reviewerName })
      setDecisionDone(decision)
      setNote('')
      onRefreshed(await reviewRefresh(publicId, token))
    } catch {
      /* the reviewer can retry — decisionDone stays null */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border-subtle bg-paper p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-brand-blue" />
        {t('review.ext.overallTitle')}
      </h2>

      {generalComments.length > 0 && (
        <div className="space-y-2">
          {generalComments.map((c) => (
            <CommentRow key={c.id} c={c} t={t} />
          ))}
        </div>
      )}

      {decisionDone ? (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {t(decisionDone === 'approved' ? 'review.ext.thanksApproved' : 'review.ext.thanksChanges')}
        </div>
      ) : (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={t('review.ext.notePlaceholder')}
            className="w-full resize-y rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void submitDecision('approved')} disabled={submitting}>
              <ThumbsUp className="mr-2 h-4 w-4" />
              {t('review.ext.approve')}
            </Button>
            <Button
              variant="outline"
              onClick={() => void submitDecision('changes_requested')}
              disabled={submitting}
            >
              <PenLine className="mr-2 h-4 w-4" />
              {t('review.ext.requestChanges')}
            </Button>
            {submitting && <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />}
          </div>
          <p className="text-[11px] text-ink-muted">{t('review.ext.decisionHint')}</p>
        </>
      )}
    </section>
  )
}

// ── Small presentational helpers (mirrors of external.tsx's) ─────────────────

function DecisionBadge({ t, decision }: { t: T; decision?: PublicPostDecision }) {
  if (!decision) return null
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
        decision.decision === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
      )}
    >
      {decision.decision === 'approved' ? (
        <CheckCircle2 className="h-4 w-4 shrink-0" />
      ) : (
        <PenLine className="h-4 w-4 shrink-0" />
      )}
      {t(decision.decision === 'approved' ? 'review.ext.youAccepted' : 'review.ext.youRequested')}
    </div>
  )
}

function CommentRow({ c, t }: { c: ReviewComment; t: T }) {
  return (
    <div
      className={cn(
        'rounded-md px-2.5 py-1.5 text-xs',
        c.source === 'dashboard' ? 'bg-brand-blue/5' : 'bg-paper-muted/60',
      )}
    >
      <span className="font-medium">
        {c.source === 'dashboard' ? t('review.ext.team') : c.reviewerName || t('review.guest')}
      </span>
      <span className="text-ink-muted"> · {fmtTimestamp(c.createdAt)}</span>
      <p className="mt-0.5 whitespace-pre-line text-ink">{c.body}</p>
    </div>
  )
}

function GeneralCommentsNote({ t, comments }: { t: T; comments: ReviewComment[] }) {
  if (comments.length === 0) return null
  return (
    <div className="space-y-1 rounded-md border border-brand-blue/20 bg-brand-blue/5 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-blue">
        {t('review.ext.appliesToAll')}
      </p>
      {comments.map((c) => (
        <p key={c.id} className="whitespace-pre-line text-xs text-ink">
          {c.body}
        </p>
      ))}
    </div>
  )
}

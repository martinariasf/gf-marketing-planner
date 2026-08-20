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
// Hard rule: there is no image anywhere on this page — no <img>, no background
// image, no lightbox, no mockup. The API strips every image URL server-side for
// a strategy link, so nothing here may assume one exists.

import { useCallback, useMemo, useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
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
import { useT } from '@/lib/i18n'
import { getFormatLocale } from '@/lib/format'
import { postFormatLabelKey } from '@/lib/post-format'
import { pillarColors } from '@/lib/section-accent'
import { cn } from '@/lib/utils'
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

/**
 * A post date is a plain calendar day, so it is parsed field-by-field and
 * rebuilt in LOCAL time. `new Date('2026-09-01')` would parse as UTC midnight
 * and read back as Aug 31 for any client west of Greenwich (Parque Biomas is
 * UTC-3) — wrong weekday, wrong day, wrong month bucket.
 */
function parseIsoDay(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** YYYY-MM bucket for a post, taken straight off the string. */
function monthKeyOfIsoDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso)
  return m ? `${m[1]}-${m[2]}` : ''
}

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
 * brief and get the "Visual description" label; (3) is a fallback and is rendered
 * muted and UNLABELLED, so a missing brief still reads as missing instead of
 * masquerading as one.
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

  return (
    <div className="min-h-screen bg-paper-muted flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border-subtle bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-muted">
              {t('review.strategy.eyebrow')}
            </p>
            <h1 className="truncate text-base font-semibold">
              {payload.link.title || t('review.strategy.title')}
            </h1>
          </div>
          <GFLogo size="sm" />
        </div>
      </header>

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
  const [showCopy, setShowCopy] = useState(false)
  const [showBox, setShowBox] = useState(false)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [deciding, setDeciding] = useState(false)

  const channels = channelsOf(post)
  const brief = visualBrief(post)
  const frames = frameCount(post)
  const formatKey = post.format ? postFormatLabelKey(post.format) : undefined
  const formatLabel = formatKey ? t(formatKey) : post.format?.trim() || untagged

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

  const onDecide = async (d: 'approved' | 'changes_requested') => {
    if (deciding || decision?.decision === d) return
    setDeciding(true)
    try {
      await decide(post.id, d)
    } catch {
      /* ignore — the reviewer can retry */
    } finally {
      setDeciding(false)
    }
  }

  return (
    <article className="px-4 py-4 sm:px-5">
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

      {/* No authored brief: the copy stands in, muted and unlabelled, so a
          missing brief reads as missing rather than as a real description. */}
      {brief.kind === 'fallback' && (
        <p className="mt-2 line-clamp-3 border-l-2 border-border-subtle pl-2.5 text-xs italic leading-relaxed text-ink-muted">
          {brief.text}
        </p>
      )}
      {brief.kind === 'none' && (
        <p className="mt-2 text-xs italic text-ink-muted">{t('review.strategy.noVisual')}</p>
      )}

      {post.copy && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowCopy((v) => !v)}
            aria-expanded={showCopy}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-blue hover:underline"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', showCopy && 'rotate-180')} />
            {t(showCopy ? 'review.strategy.hideCopy' : 'review.strategy.showCopy')}
          </button>
          {showCopy && (
            <div className="mt-1.5 space-y-1 rounded-md bg-paper-muted/60 px-3 py-2">
              <p className="whitespace-pre-line text-xs leading-relaxed text-ink">{post.copy}</p>
              {post.hashtags && post.hashtags.length > 0 && (
                <p className="text-[11px] font-medium text-brand-blue">{post.hashtags.join(' ')}</p>
              )}
              {post.cta && <p className="text-[11px] font-semibold text-ink">{post.cta}</p>}
            </div>
          )}
        </div>
      )}

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
            onClick={() => void onDecide('changes_requested')}
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
    </article>
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

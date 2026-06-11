// GF-4 — the external reviewer page (TASK-007).
//
// A standalone, code-gated route mounted OUTSIDE the client dashboard layout.
// The reviewer is NOT logged into the platform: they enter an access code, get
// a short-lived review session, and can see ONLY the sanitized posts of the
// shared calendar range, comment, and submit a review decision. There is no way
// to reach the client list, chat, settings, assets or any other client's data —
// every call here uses the public /review/* client, never a dashboard token.

import { useCallback, useState } from 'react'
import { useParams } from 'react-router'
import { motion } from 'framer-motion'
import {
  Lock,
  Loader2,
  MessageSquare,
  ThumbsUp,
  PenLine,
  Send,
  ImageIcon,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GFLogo } from '@/components/gf-logo'
import { ChannelMockup } from '@/components/channel-mockup'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  reviewOpen,
  reviewComment,
  reviewDecision,
  ReviewGateError,
  type PublicReviewPayload,
  type PublicReviewPost,
  type PublicReviewBrand,
  type PublicPostDecision,
  type ReviewComment,
} from '@/lib/api-client'

// Channels with a platform-accurate mockup. Anything else (or no channel)
// falls back to the plain details card.
const MOCKUP_CHANNELS = new Set(['instagram', 'linkedin'])

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ExternalReviewPage() {
  const t = useT()
  const { publicId = '' } = useParams<{ publicId: string }>()

  const [token, setToken] = useState<string | null>(null)
  const [payload, setPayload] = useState<PublicReviewPayload | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [opening, setOpening] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)

  const open = async (e: React.FormEvent) => {
    e.preventDefault()
    setOpening(true)
    setGateError(null)
    try {
      const data = await reviewOpen(publicId, code.trim(), name.trim() || undefined)
      setPayload(data)
      setToken(data.token ?? null)
    } catch (err) {
      setGateError(
        err instanceof ReviewGateError
          ? err.message
          : err instanceof Error
            ? err.message
            : t('review.ext.openFailed'),
      )
    } finally {
      setOpening(false)
    }
  }

  if (!payload || !token) {
    return (
      <GateScreen
        t={t}
        name={name}
        code={code}
        opening={opening}
        error={gateError}
        onName={setName}
        onCode={setCode}
        onSubmit={open}
      />
    )
  }

  return (
    <ReviewBody
      t={t}
      publicId={publicId}
      token={token}
      payload={payload}
      reviewerName={payload.reviewerName}
      onRefreshed={setPayload}
    />
  )
}

function GateScreen({
  t,
  name,
  code,
  opening,
  error,
  onName,
  onCode,
  onSubmit,
}: {
  t: (k: string) => string
  name: string
  code: string
  opening: boolean
  error: string | null
  onName: (v: string) => void
  onCode: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  return (
    <div className="min-h-screen bg-paper-muted flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm rounded-2xl border border-border-subtle bg-paper p-7 shadow-sm space-y-5"
      >
        <div className="flex flex-col items-center text-center gap-2">
          <div className="h-12 w-12 rounded-xl bg-brand-blue/10 flex items-center justify-center">
            <Lock className="h-5 w-5 text-brand-blue" />
          </div>
          <h1 className="text-lg font-semibold text-brand-blue">{t('review.ext.title')}</h1>
          <p className="text-sm text-ink-muted">{t('review.ext.gateHint')}</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wider text-ink-muted">
              {t('review.ext.yourName')}
            </span>
            <input
              value={name}
              onChange={(e) => onName(e.target.value)}
              placeholder={t('review.ext.namePlaceholder')}
              className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs uppercase tracking-wider text-ink-muted">
              {t('review.ext.accessCode')}
            </span>
            <input
              value={code}
              onChange={(e) => onCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXXXXXX"
              className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-base font-mono tracking-widest text-center outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          </label>
          {error && <p className="text-xs text-rose-700 bg-rose-50 rounded-md px-3 py-2">{error}</p>}
          <Button type="submit" className="w-full" disabled={opening || !code.trim()}>
            {opening ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Lock className="h-4 w-4 mr-2" />}
            {t('review.ext.openButton')}
          </Button>
        </form>
        <div className="flex justify-center pt-1 opacity-60">
          <GFLogo size="sm" />
        </div>
      </motion.div>
    </div>
  )
}

function ReviewBody({
  t,
  publicId,
  token,
  payload,
  reviewerName,
  onRefreshed,
}: {
  t: (k: string, vars?: Record<string, string | number>) => string
  publicId: string
  token: string
  payload: PublicReviewPayload
  reviewerName: string
  onRefreshed: (p: PublicReviewPayload) => void
}) {
  const [decisionDone, setDecisionDone] = useState<null | 'approved' | 'changes_requested'>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const commentsByPost = (postId: string) =>
    payload.comments.filter((c) => c.postId === postId)
  const generalComments = payload.comments.filter((c) => !c.postId)

  const refresh = useCallback(
    async (next: PublicReviewPayload) => onRefreshed(next),
    [onRefreshed],
  )

  const submitDecision = async (decision: 'approved' | 'changes_requested') => {
    setSubmitting(true)
    try {
      await reviewDecision(publicId, token, decision, { note: note.trim() || undefined, name: reviewerName })
      setDecisionDone(decision)
      setNote('')
      const { reviewRefresh } = await import('@/lib/api-client')
      onRefreshed(await reviewRefresh(publicId, token))
    } catch {
      /* surfaced inline below via decisionDone staying null */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper-muted">
      <header className="border-b border-border-subtle bg-paper sticky top-0 z-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-muted">
              {t('review.ext.eyebrow')}
            </p>
            <h1 className="text-base font-semibold truncate">{payload.link.title || t('review.ext.title')}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {payload.link.rangeStart} – {payload.link.rangeEnd}
            </Badge>
            <GFLogo size="sm" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-6 space-y-6">
        <p className="text-sm text-ink-muted">
          {t('review.ext.welcome', { name: reviewerName })}
        </p>

        {payload.posts.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-paper p-10 text-center text-ink-muted text-sm">
            {t('review.ext.noPosts')}
          </div>
        ) : (
          payload.posts.map((post) => (
            <PostReviewCard
              key={post.id}
              t={t}
              post={post}
              brand={payload.brand}
              decision={payload.postDecisions?.find((d) => d.postId === post.id)}
              comments={commentsByPost(post.id)}
              publicId={publicId}
              token={token}
              reviewerName={reviewerName}
              onPosted={refresh}
            />
          ))
        )}

        {/* General comments + overall decision */}
        <section className="rounded-xl border border-border-subtle bg-paper p-5 space-y-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
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
            <div className="flex items-center gap-2 rounded-md bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">
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
                className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={() => submitDecision('approved')} disabled={submitting}>
                  <ThumbsUp className="h-4 w-4 mr-2" />
                  {t('review.ext.approve')}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => submitDecision('changes_requested')}
                  disabled={submitting}
                >
                  <PenLine className="h-4 w-4 mr-2" />
                  {t('review.ext.requestChanges')}
                </Button>
                {submitting && <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />}
              </div>
              <p className="text-[11px] text-ink-muted">{t('review.ext.decisionHint')}</p>
            </>
          )}
        </section>

        <footer className="text-center text-[11px] text-ink-muted pb-6">
          {t('review.ext.footer')}
        </footer>
      </main>
    </div>
  )
}

function PostReviewCard({
  t,
  post,
  brand,
  decision,
  comments,
  publicId,
  token,
  reviewerName,
  onPosted,
}: {
  t: (k: string, vars?: Record<string, string | number>) => string
  post: PublicReviewPost
  brand?: PublicReviewBrand
  decision?: PublicPostDecision
  comments: ReviewComment[]
  publicId: string
  token: string
  reviewerName: string
  onPosted: (p: PublicReviewPayload) => void
}) {
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [showBox, setShowBox] = useState(false)
  const [deciding, setDeciding] = useState(false)

  const hasMockup = !!post.channel && MOCKUP_CHANNELS.has(post.channel)
  const [tab, setTab] = useState<'preview' | 'details'>(hasMockup ? 'preview' : 'details')

  const send = async () => {
    if (!body.trim()) return
    setPosting(true)
    try {
      await reviewComment(publicId, token, body.trim(), { postId: post.id, name: reviewerName })
      setBody('')
      setShowBox(false)
      const { reviewRefresh } = await import('@/lib/api-client')
      onPosted(await reviewRefresh(publicId, token))
    } catch {
      /* ignore — reviewer can retry */
    } finally {
      setPosting(false)
    }
  }

  const decide = async (d: 'approved' | 'changes_requested') => {
    if (deciding || decision?.decision === d) return
    setDeciding(true)
    try {
      await reviewDecision(publicId, token, d, { postId: post.id, name: reviewerName })
      const { reviewRefresh } = await import('@/lib/api-client')
      onPosted(await reviewRefresh(publicId, token))
    } catch {
      /* ignore — reviewer can retry */
    } finally {
      setDeciding(false)
    }
  }

  const cover = post.image || post.slides?.[0]?.image

  const details = (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
      <div className="bg-paper-muted/40 flex items-center justify-center p-3 min-h-[140px]">
        {cover ? (
          <img src={cover} alt={post.title} className="max-h-48 w-full object-contain rounded-md" />
        ) : (
          <div className="text-ink-muted flex flex-col items-center gap-1">
            <ImageIcon className="h-7 w-7 opacity-40" />
            <span className="text-[11px]">{t('review.ext.noImage')}</span>
          </div>
        )}
      </div>
      <div className="p-4 space-y-2">
        <h3 className="text-base font-semibold leading-tight">{post.title}</h3>
        {post.copy && <p className="text-sm whitespace-pre-line leading-relaxed text-ink-muted">{post.copy}</p>}
        {post.hashtags && post.hashtags.length > 0 && (
          <p className="text-xs text-brand-blue font-medium">{post.hashtags.join(' ')}</p>
        )}
        {post.cta && <p className="text-xs font-semibold">{post.cta}</p>}
      </div>
    </div>
  )

  return (
    <article className="rounded-xl border border-border-subtle bg-paper overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-muted">
          <span className="font-medium text-ink">{fmtDate(post.date)}</span>
          {post.channel && <span>· {post.channel}</span>}
          {post.format && <span>· {post.format}</span>}
          {post.pillar && <Badge variant="outline" className="text-[10px]">{post.pillar}</Badge>}
          {post.statusLabel && (
            <Badge variant="secondary" className="text-[10px]">{post.statusLabel.replace('_', ' ')}</Badge>
          )}
        </div>
        {hasMockup && (
          <div className="flex rounded-lg border border-border-subtle p-0.5 bg-paper-muted/50 text-xs">
            {(['preview', 'details'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                className={cn(
                  'px-2.5 py-1 rounded-md font-medium transition-colors',
                  tab === k ? 'bg-paper shadow-sm text-ink' : 'text-ink-muted hover:text-ink',
                )}
              >
                {t(k === 'preview' ? 'review.ext.tabPreview' : 'review.ext.tabDetails')}
              </button>
            ))}
          </div>
        )}
      </div>

      {hasMockup && tab === 'preview' ? (
        <div className="bg-paper-muted/40 px-4 py-5">
          <ChannelMockup
            post={{
              title: post.title,
              copy: post.copy ?? '',
              hashtags: post.hashtags ?? [],
              image: post.image,
              slides: post.slides,
              channel: post.channel ?? '',
            }}
            clientName={brand?.name ?? ''}
            handle={brand?.handle ?? ''}
            logoInitials={brand?.logoInitials ?? ''}
          />
        </div>
      ) : (
        details
      )}

      <div className="p-4 pt-3 space-y-2 border-t border-border-subtle">
        {decision && (
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
              decision.decision === 'approved'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700',
            )}
          >
            {decision.decision === 'approved' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <PenLine className="h-4 w-4 shrink-0" />
            )}
            {t(decision.decision === 'approved' ? 'review.ext.youAccepted' : 'review.ext.youRequested')}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={decision?.decision === 'approved' ? 'default' : 'outline'}
            onClick={() => decide('approved')}
            disabled={deciding}
          >
            <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
            {t('review.ext.acceptPost')}
          </Button>
          <Button
            size="sm"
            variant={decision?.decision === 'changes_requested' ? 'default' : 'outline'}
            onClick={() => decide('changes_requested')}
            disabled={deciding}
          >
            <PenLine className="h-3.5 w-3.5 mr-1.5" />
            {t('review.ext.rejectPost')}
          </Button>
          {!showBox && (
            <Button size="sm" variant="ghost" onClick={() => setShowBox(true)}>
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              {t('review.ext.addComment')}
            </Button>
          )}
          {deciding && <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />}
        </div>

        {comments.length > 0 && (
          <div className="pt-1 space-y-1.5">
            {comments.map((c) => (
              <CommentRow key={c.id} c={c} t={t} />
            ))}
          </div>
        )}

        {showBox && (
          <div className="pt-1 space-y-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              autoFocus
              placeholder={t('review.ext.commentPlaceholder')}
              className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={send} disabled={posting || !body.trim()}>
                {posting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
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

function CommentRow({
  c,
  t,
}: {
  c: ReviewComment
  t: (k: string, vars?: Record<string, string | number>) => string
}) {
  return (
    <div
      className={cn(
        'text-xs rounded-md px-2.5 py-1.5',
        c.source === 'dashboard' ? 'bg-brand-blue/5' : 'bg-paper-muted/60',
      )}
    >
      <span className="font-medium">
        {c.source === 'dashboard' ? t('review.ext.team') : c.reviewerName || t('review.guest')}
      </span>
      <span className="text-ink-muted"> · {fmtDate(c.createdAt)}</span>
      <p className="text-ink mt-0.5 whitespace-pre-line">{c.body}</p>
    </div>
  )
}

// GF-4 — the external reviewer page (v3: swipe deck).
//
// A standalone, code-gated route mounted OUTSIDE the client dashboard layout.
// The reviewer is NOT logged into the platform: they enter an access code, get
// a short-lived review session, and can see ONLY the sanitized posts of the
// shared calendar range, comment, and submit review decisions. There is no way
// to reach the client list, chat, settings, assets or any other client's data —
// every call here uses the public /review/* client, never a dashboard token.
//
// v3 reviewer flow (Martin, 2026-06-12): the DEFAULT view is a card deck — one
// post at a time, swipe right to accept, swipe left to request changes (with an
// optional quick comment), progress on top, summary + overall verdict at the
// end. The classic scroll list stays available behind a header toggle. All
// decisions remain signals only (review_events) — the team approves internally.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import {
  Lock,
  Loader2,
  MessageSquare,
  ThumbsUp,
  PenLine,
  Send,
  ImageIcon,
  CheckCircle2,
  LayoutList,
  GalleryHorizontalEnd,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { GFLogo } from '@/components/gf-logo'
import { ChannelMockup } from '@/components/channel-mockup'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import {
  reviewOpen,
  reviewComment,
  reviewDecision,
  reviewRefresh,
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

// Swipe commits past this drag distance (px) or fling velocity (px/s).
const SWIPE_OFFSET = 120
const SWIPE_VELOCITY = 600

type T = (k: string, vars?: Record<string, string | number>) => string

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
    <ReviewShell
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
  t: T
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

// ── Shared bits ───────────────────────────────────────────────────────────────

/** Image (or carousel slide) the lightbox should show. */
interface LightboxTarget {
  post: PublicReviewPost
  slide: number
}

function slidesOf(post: PublicReviewPost): Array<{ image: string; caption?: string }> {
  if (post.slides && post.slides.length > 0) return post.slides
  if (post.image) return [{ image: post.image }]
  return []
}

function ImageLightbox({
  t,
  target,
  onClose,
  onSlide,
}: {
  t: T
  target: LightboxTarget | null
  onClose: () => void
  onSlide: (i: number) => void
}) {
  if (!target) return null
  const slides = slidesOf(target.post)
  const total = slides.length
  const idx = Math.min(Math.max(target.slide, 0), Math.max(total - 1, 0))
  const slide = slides[idx]
  const go = (next: number) => onSlide((next + total) % total)

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-4xl p-2 bg-black/95 border-none">
        <DialogTitle className="sr-only">{target.post.title}</DialogTitle>
        {slide ? (
          <div className="relative flex flex-col items-center gap-2">
            <img
              src={slide.image}
              alt={slide.caption || target.post.title}
              className="w-full max-h-[80vh] object-contain rounded"
            />
            {total > 1 && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => go(idx - 1)}
                  aria-label={t('review.ext.prevSlide')}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-paper/90 shadow"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => go(idx + 1)}
                  aria-label={t('review.ext.nextSlide')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-paper/90 shadow"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
                <span className="absolute top-2 left-2 rounded-full bg-black/55 text-white text-xs font-medium px-2.5 py-1">
                  {idx + 1} / {total}
                </span>
              </>
            )}
            {slide.caption && (
              <p className="text-white/80 text-xs text-center max-w-prose px-2 pb-1">{slide.caption}</p>
            )}
          </div>
        ) : (
          <div className="h-64 flex items-center justify-center text-white/70 text-sm">
            {t('review.ext.noImage')}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CommentRow({ c, t }: { c: ReviewComment; t: T }) {
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

/** The post content (mockup or details) shared by deck cards and list cards. */
function PostContent({
  t,
  post,
  brand,
  tab,
  onZoom,
}: {
  t: T
  post: PublicReviewPost
  brand?: PublicReviewBrand
  tab: 'preview' | 'details'
  onZoom: () => void
}) {
  const hasMockup = !!post.channel && MOCKUP_CHANNELS.has(post.channel)
  const cover = post.image || post.slides?.[0]?.image

  if (hasMockup && tab === 'preview') {
    return (
      <div className="bg-paper-muted/40 px-4 py-5 relative">
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
        {cover && (
          <button
            onClick={onZoom}
            title={t('review.ext.viewLarger')}
            className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/55 text-white flex items-center justify-center hover:bg-black/75 transition-colors"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
      <div className="bg-paper-muted/40 flex items-center justify-center p-3 min-h-[140px]">
        {cover ? (
          <button onClick={onZoom} title={t('review.ext.viewLarger')} className="group relative w-full">
            <img src={cover} alt={post.title} className="max-h-48 w-full object-contain rounded-md" />
            <span className="absolute top-1 right-1 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="h-3.5 w-3.5" />
            </span>
          </button>
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
}

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

// ── Shell: mode switching, shared decision/comment plumbing ──────────────────

function ReviewShell({
  t,
  publicId,
  token,
  payload,
  reviewerName,
  onRefreshed,
}: {
  t: T
  publicId: string
  token: string
  payload: PublicReviewPayload
  reviewerName: string
  onRefreshed: (p: PublicReviewPayload) => void
}) {
  const [mode, setMode] = useState<'deck' | 'list'>('deck')
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null)

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

  return (
    <div className="min-h-screen bg-paper-muted flex flex-col">
      <header className="border-b border-border-subtle bg-paper sticky top-0 z-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-ink-muted">
              {t('review.ext.eyebrow')}
            </p>
            <h1 className="text-base font-semibold truncate">{payload.link.title || t('review.ext.title')}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {payload.posts.length > 0 && (
              <div className="flex rounded-lg border border-border-subtle p-0.5 bg-paper-muted/50 text-xs">
                <button
                  onClick={() => setMode('deck')}
                  className={cn(
                    'px-2 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
                    mode === 'deck' ? 'bg-paper shadow-sm text-ink' : 'text-ink-muted hover:text-ink',
                  )}
                  aria-label={t('review.ext.modeDeck')}
                >
                  <GalleryHorizontalEnd className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('review.ext.modeDeck')}</span>
                </button>
                <button
                  onClick={() => setMode('list')}
                  className={cn(
                    'px-2 py-1 rounded-md font-medium transition-colors flex items-center gap-1',
                    mode === 'list' ? 'bg-paper shadow-sm text-ink' : 'text-ink-muted hover:text-ink',
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

      {mode === 'deck' && payload.posts.length > 0 ? (
        <DeckView
          t={t}
          publicId={publicId}
          token={token}
          payload={payload}
          reviewerName={reviewerName}
          decisionFor={decisionFor}
          decide={decide}
          onZoom={setLightbox}
          onRefreshed={onRefreshed}
          onSwitchToList={() => setMode('list')}
        />
      ) : (
        <ListView
          t={t}
          publicId={publicId}
          token={token}
          payload={payload}
          reviewerName={reviewerName}
          decisionFor={decisionFor}
          decide={decide}
          onZoom={setLightbox}
          onRefreshed={onRefreshed}
        />
      )}

      <ImageLightbox
        t={t}
        target={lightbox}
        onClose={() => setLightbox(null)}
        onSlide={(i) => setLightbox((cur) => (cur ? { ...cur, slide: i } : cur))}
      />
    </div>
  )
}

// ── Deck view: one card at a time, swipe or buttons ──────────────────────────

function DeckView({
  t,
  publicId,
  token,
  payload,
  reviewerName,
  decisionFor,
  decide,
  onZoom,
  onRefreshed,
  onSwitchToList,
}: {
  t: T
  publicId: string
  token: string
  payload: PublicReviewPayload
  reviewerName: string
  decisionFor: (postId: string) => PublicPostDecision | undefined
  decide: (postId: string, d: 'approved' | 'changes_requested', comment?: string) => Promise<void>
  onZoom: (target: LightboxTarget) => void
  onRefreshed: (p: PublicReviewPayload) => void
  onSwitchToList: () => void
}) {
  const posts = payload.posts
  const [index, setIndex] = useState(0)
  const [exitDir, setExitDir] = useState(0)
  const [busy, setBusy] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

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

  const requestChanges = useCallback(
    async (comment?: string) => {
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

  // Keyboard parity: → accept, ← open the changes sheet.
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

  if (done) {
    return (
      <SummaryScreen
        t={t}
        publicId={publicId}
        token={token}
        payload={payload}
        reviewerName={reviewerName}
        decisionFor={decisionFor}
        onRefreshed={onRefreshed}
        onRevisit={(i) => {
          setExitDir(0)
          setIndex(i)
        }}
        onSwitchToList={onSwitchToList}
      />
    )
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-xl px-4 sm:px-6 py-5 flex flex-col gap-4">
      {/* Progress */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>{t('review.ext.progress', { n: index + 1, total: posts.length })}</span>
          <span className="hidden sm:inline">{t('review.ext.swipeHint')}</span>
        </div>
        <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
          <motion.div
            className="h-full bg-brand-blue rounded-full"
            animate={{ width: `${(index / posts.length) * 100}%` }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Card stack */}
      <div className="relative flex-1 min-h-[420px]">
        {posts[index + 1] && (
          <div className="absolute inset-x-2 top-2 bottom-0 rounded-xl border border-border-subtle bg-paper/70 -z-10" />
        )}
        <AnimatePresence custom={exitDir} mode="popLayout">
          <DeckCard
            key={post.id}
            t={t}
            post={post}
            brand={payload.brand}
            decision={decisionFor(post.id)}
            comments={payload.comments.filter((c) => c.postId === post.id)}
            exitDir={exitDir}
            busy={busy}
            onAccept={() => void accept()}
            onReject={() => setSheetOpen(true)}
            onZoom={() => onZoom({ post, slide: 0 })}
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
          className="rounded-full px-5 border-amber-300 text-amber-700 hover:bg-amber-50"
        >
          <PenLine className="h-4 w-4 mr-2" />
          {t('review.ext.rejectPost')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={skip} className="text-ink-muted">
          {t('review.ext.skip')}
        </Button>
        <Button
          size="lg"
          disabled={busy}
          onClick={() => void accept()}
          className="rounded-full px-5 bg-emerald-600 hover:bg-emerald-700"
        >
          {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-2" />}
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

function DeckCard({
  t,
  post,
  brand,
  decision,
  comments,
  exitDir,
  busy,
  onAccept,
  onReject,
  onZoom,
}: {
  t: T
  post: PublicReviewPost
  brand?: PublicReviewBrand
  decision?: PublicPostDecision
  comments: ReviewComment[]
  exitDir: number
  busy: boolean
  onAccept: () => void
  onReject: () => void
  onZoom: () => void
}) {
  const hasMockup = !!post.channel && MOCKUP_CHANNELS.has(post.channel)
  const [tab, setTab] = useState<'preview' | 'details'>(hasMockup ? 'preview' : 'details')

  const x = useMotionValue(0)
  const rotate = useTransform(x, [-240, 240], [-9, 9])
  const acceptHint = useTransform(x, [40, SWIPE_OFFSET], [0, 1])
  const rejectHint = useTransform(x, [-SWIPE_OFFSET, -40], [1, 0])

  return (
    <motion.article
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{
        x: exitDir === 0 ? 0 : exitDir * 560,
        opacity: 0,
        rotate: exitDir * 10,
        transition: { duration: 0.28, ease: 'easeIn' },
      }}
      drag={busy ? false : 'x'}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      style={{ x, rotate }}
      onDragEnd={(_, info) => {
        if (info.offset.x > SWIPE_OFFSET || info.velocity.x > SWIPE_VELOCITY) onAccept()
        else if (info.offset.x < -SWIPE_OFFSET || info.velocity.x < -SWIPE_VELOCITY) onReject()
      }}
      className="absolute inset-0 rounded-xl border border-border-subtle bg-paper overflow-hidden flex flex-col cursor-grab active:cursor-grabbing touch-pan-y"
    >
      {/* Swipe hints */}
      <motion.div
        style={{ opacity: acceptHint }}
        className="pointer-events-none absolute top-4 left-4 z-10 rounded-lg border-2 border-emerald-500 text-emerald-600 px-3 py-1 text-sm font-bold rotate-[-8deg] bg-paper/80"
      >
        {t('review.ext.acceptPost')}
      </motion.div>
      <motion.div
        style={{ opacity: rejectHint }}
        className="pointer-events-none absolute top-4 right-4 z-10 rounded-lg border-2 border-amber-500 text-amber-600 px-3 py-1 text-sm font-bold rotate-[8deg] bg-paper/80"
      >
        {t('review.ext.rejectPost')}
      </motion.div>

      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-muted">
          <span className="font-medium text-ink">{fmtDate(post.date)}</span>
          {post.channel && <span>· {post.channel}</span>}
          {post.format && <span>· {post.format}</span>}
          {post.pillar && <Badge variant="outline" className="text-[10px]">{post.pillar}</Badge>}
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

      <div className="flex-1 overflow-y-auto">
        <PostContent t={t} post={post} brand={brand} tab={tab} onZoom={onZoom} />
        {(decision || comments.length > 0) && (
          <div className="px-4 py-3 space-y-2 border-t border-border-subtle">
            <DecisionBadge t={t} decision={decision} />
            {comments.map((c) => (
              <CommentRow key={c.id} c={c} t={t} />
            ))}
          </div>
        )}
      </div>
    </motion.article>
  )
}

/** Bottom sheet asking what should change. Comment is optional by design. */
function RejectSheet({
  t,
  open,
  busy,
  onCancel,
  onSubmit,
}: {
  t: T
  open: boolean
  busy: boolean
  onCancel: () => void
  onSubmit: (comment?: string) => void
}) {
  const [text, setText] = useState('')
  const [reasons, setReasons] = useState<string[]>([])

  const reasonKeys = ['review.ext.reasonWording', 'review.ext.reasonImage', 'review.ext.reasonTiming']

  useEffect(() => {
    if (!open) {
      setText('')
      setReasons([])
    }
  }, [open])

  const submit = () => {
    const parts = [...reasons, text.trim()].filter(Boolean)
    onSubmit(parts.length > 0 ? parts.join(' — ') : undefined)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCancel}
            className="fixed inset-0 z-40 bg-black/40"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl rounded-t-2xl border border-border-subtle bg-paper p-5 space-y-3 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <PenLine className="h-4 w-4 text-amber-600" />
                {t('review.ext.sheetTitle')}
              </h3>
              <button onClick={onCancel} aria-label={t('common.cancel')} className="text-ink-muted hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-ink-muted">{t('review.ext.sheetHint')}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {reasonKeys.map((k) => {
                const label = t(k)
                const active = reasons.includes(label)
                return (
                  <button
                    key={k}
                    onClick={() =>
                      setReasons((r) => (active ? r.filter((x) => x !== label) : [...r, label]))
                    }
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-border-subtle text-ink-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              autoFocus
              placeholder={t('review.ext.commentPlaceholder')}
              className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={submit} disabled={busy} className="bg-amber-600 hover:bg-amber-700">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                {t('review.ext.sheetSend')}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => onSubmit(undefined)}>
                {t('review.ext.sheetNoComment')}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ── Summary screen: recap + overall verdict ──────────────────────────────────

function SummaryScreen({
  t,
  publicId,
  token,
  payload,
  reviewerName,
  decisionFor,
  onRefreshed,
  onRevisit,
  onSwitchToList,
}: {
  t: T
  publicId: string
  token: string
  payload: PublicReviewPayload
  reviewerName: string
  decisionFor: (postId: string) => PublicPostDecision | undefined
  onRefreshed: (p: PublicReviewPayload) => void
  onRevisit: (index: number) => void
  onSwitchToList: () => void
}) {
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [decisionDone, setDecisionDone] = useState<null | 'approved' | 'changes_requested'>(null)

  const counts = useMemo(() => {
    let approved = 0
    let changes = 0
    let skipped = 0
    for (const p of payload.posts) {
      const d = decisionFor(p.id)
      if (!d) skipped++
      else if (d.decision === 'approved') approved++
      else changes++
    }
    return { approved, changes, skipped }
  }, [payload.posts, decisionFor])

  const submitDecision = async (decision: 'approved' | 'changes_requested') => {
    setSubmitting(true)
    try {
      await reviewDecision(publicId, token, decision, { note: note.trim() || undefined, name: reviewerName })
      setDecisionDone(decision)
      setNote('')
      onRefreshed(await reviewRefresh(publicId, token))
    } catch {
      /* reviewer can retry */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-xl px-4 sm:px-6 py-6 space-y-5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <h2 className="text-lg font-semibold">{t('review.ext.summaryTitle')}</h2>
        <div className="flex items-center justify-center gap-2 flex-wrap text-xs">
          <span className="rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 font-medium">
            {t('review.ext.summaryAccepted', { n: counts.approved })}
          </span>
          <span className="rounded-full bg-amber-50 text-amber-700 px-2.5 py-1 font-medium">
            {t('review.ext.summaryChanges', { n: counts.changes })}
          </span>
          {counts.skipped > 0 && (
            <span className="rounded-full bg-paper-muted text-ink-muted px-2.5 py-1 font-medium">
              {t('review.ext.summarySkipped', { n: counts.skipped })}
            </span>
          )}
        </div>
        <p className="text-xs text-ink-muted">{t('review.ext.summaryRevisit')}</p>
      </motion.div>

      <div className="rounded-xl border border-border-subtle bg-paper divide-y divide-border-subtle overflow-hidden">
        {payload.posts.map((p, i) => {
          const d = decisionFor(p.id)
          const cover = p.image || p.slides?.[0]?.image
          return (
            <button
              key={p.id}
              onClick={() => onRevisit(i)}
              className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-paper-muted/50 transition-colors"
            >
              <span className="h-10 w-10 rounded-md overflow-hidden bg-paper-muted shrink-0 flex items-center justify-center">
                {cover ? (
                  <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-4 w-4 text-ink-muted opacity-50" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium truncate">{p.title}</span>
                <span className="block text-[10px] text-ink-muted">
                  {fmtDate(p.date)}
                  {p.channel ? ` · ${p.channel}` : ''}
                </span>
              </span>
              {!d ? (
                <span className="text-[10px] text-ink-muted shrink-0">{t('review.ext.notReviewed')}</span>
              ) : d.decision === 'approved' ? (
                <ThumbsUp className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <PenLine className="h-4 w-4 text-amber-600 shrink-0" />
              )}
            </button>
          )
        })}
      </div>

      {/* Overall verdict */}
      <section className="rounded-xl border border-border-subtle bg-paper p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand-blue" />
          {t('review.ext.overallTitle')}
        </h3>
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
              <Button onClick={() => void submitDecision('approved')} disabled={submitting}>
                <ThumbsUp className="h-4 w-4 mr-2" />
                {t('review.ext.approve')}
              </Button>
              <Button
                variant="outline"
                onClick={() => void submitDecision('changes_requested')}
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

      <div className="text-center">
        <Button variant="ghost" size="sm" onClick={onSwitchToList} className="text-ink-muted">
          <LayoutList className="h-3.5 w-3.5 mr-1.5" />
          {t('review.ext.modeList')}
        </Button>
      </div>

      <footer className="text-center text-[11px] text-ink-muted pb-6">
        {t('review.ext.footer')}
      </footer>
    </main>
  )
}

// ── List view: the v2 scroll experience, kept as the secondary mode ──────────

function ListView({
  t,
  publicId,
  token,
  payload,
  reviewerName,
  decisionFor,
  decide,
  onZoom,
  onRefreshed,
}: {
  t: T
  publicId: string
  token: string
  payload: PublicReviewPayload
  reviewerName: string
  decisionFor: (postId: string) => PublicPostDecision | undefined
  decide: (postId: string, d: 'approved' | 'changes_requested', comment?: string) => Promise<void>
  onZoom: (target: LightboxTarget) => void
  onRefreshed: (p: PublicReviewPayload) => void
}) {
  const [decisionDone, setDecisionDone] = useState<null | 'approved' | 'changes_requested'>(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const generalComments = payload.comments.filter((c) => !c.postId)

  const submitDecision = async (decision: 'approved' | 'changes_requested') => {
    setSubmitting(true)
    try {
      await reviewDecision(publicId, token, decision, { note: note.trim() || undefined, name: reviewerName })
      setDecisionDone(decision)
      setNote('')
      onRefreshed(await reviewRefresh(publicId, token))
    } catch {
      /* surfaced inline below via decisionDone staying null */
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 space-y-6">
      <p className="text-sm text-ink-muted">{t('review.ext.welcome', { name: reviewerName })}</p>

      {payload.posts.length === 0 ? (
        <div className="rounded-xl border border-border-subtle bg-paper p-10 text-center text-ink-muted text-sm">
          {t('review.ext.noPosts')}
        </div>
      ) : (
        payload.posts.map((post) => (
          <ListPostCard
            key={post.id}
            t={t}
            post={post}
            brand={payload.brand}
            decision={decisionFor(post.id)}
            comments={payload.comments.filter((c) => c.postId === post.id)}
            publicId={publicId}
            token={token}
            reviewerName={reviewerName}
            decide={decide}
            onZoom={() => onZoom({ post, slide: 0 })}
            onRefreshed={onRefreshed}
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
              <Button onClick={() => void submitDecision('approved')} disabled={submitting}>
                <ThumbsUp className="h-4 w-4 mr-2" />
                {t('review.ext.approve')}
              </Button>
              <Button
                variant="outline"
                onClick={() => void submitDecision('changes_requested')}
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
  )
}

function ListPostCard({
  t,
  post,
  brand,
  decision,
  comments,
  publicId,
  token,
  reviewerName,
  decide,
  onZoom,
  onRefreshed,
}: {
  t: T
  post: PublicReviewPost
  brand?: PublicReviewBrand
  decision?: PublicPostDecision
  comments: ReviewComment[]
  publicId: string
  token: string
  reviewerName: string
  decide: (postId: string, d: 'approved' | 'changes_requested', comment?: string) => Promise<void>
  onZoom: () => void
  onRefreshed: (p: PublicReviewPayload) => void
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
      onRefreshed(await reviewRefresh(publicId, token))
    } catch {
      /* ignore — reviewer can retry */
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
      /* ignore — reviewer can retry */
    } finally {
      setDeciding(false)
    }
  }

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

      <PostContent t={t} post={post} brand={brand} tab={tab} onZoom={onZoom} />

      <div className="p-4 pt-3 space-y-2 border-t border-border-subtle">
        <DecisionBadge t={t} decision={decision} />
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={decision?.decision === 'approved' ? 'default' : 'outline'}
            onClick={() => void onDecide('approved')}
            disabled={deciding}
          >
            <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
            {t('review.ext.acceptPost')}
          </Button>
          <Button
            size="sm"
            variant={decision?.decision === 'changes_requested' ? 'default' : 'outline'}
            onClick={() => void onDecide('changes_requested')}
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

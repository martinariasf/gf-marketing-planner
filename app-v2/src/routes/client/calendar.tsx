import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useOutletContext, useParams, useSearchParams } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ChannelMockup } from '@/components/channel-mockup'
import { ChannelIcon, CHANNEL_LABEL, CHANNEL_ORDER, effectiveChannels } from '@/components/channel-icon'
import { Pillar } from '@/components/pillar'
import { ReviewShareDialog } from '@/components/review-share-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { fmtDate } from '@/lib/format'
import {
  apiCreatePost,
  apiDeletePost,
  apiLoadCalendarRange,
  apiLoadReviewActivity,
  apiLoadReviewFeedback,
  apiPatchPost,
  apiReplyReviewComment,
  apiSaveCalendarRange,
  apiSetApproval,
  apiUploadInspiration,
  isApiEnabled,
  type ApprovalDecision,
  type ReviewFeedback,
  type ReviewPostFeedback,
} from '@/lib/api-client'
import { WORKFLOW, isPublished, laneFor, publishedUrl, postSeqMap } from '@/lib/post-status'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts'
import { exportCalendarPdf, exportCalendarWord } from '@/lib/calendar-export'
import { toast } from 'sonner'
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Tag,
  ImageIcon,
  Maximize2,
  Wand2,
  Save,
  Loader2,
  Eye,
  Upload,
  LayoutGrid,
  Rows3,
  Images,
  Settings2,
  Share2,
  Download,
  FileText,
  FileType2,
  Film,
  Plus,
  PieChart as PieChartIcon,
  Check,
  ThumbsUp,
  PenLine,
  MessageSquare,
  Send,
  Trash2,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import {
  addMonths,
  dateTiming,
  defaultCalendarRange,
  monthDiff,
  monthKeyFromDate,
  monthKeyFromIso,
  monthsInRange,
  normalizeCalendarRange,
  parseMonthKey,
  type CalendarRangeConfig,
} from '@/lib/planning-range'
import type { ClientBundle } from '@/lib/client-data'
import type { Post, Channel } from '@/types'
import type { Slide } from '@/types/post'

const STATUS_STYLES: Record<string, string> = {
  idea:           'bg-neutral-100 text-neutral-700',
  drafting:       'bg-amber-50 text-amber-700',
  in_review:      'bg-blue-50 text-blue-700',
  needs_revision: 'bg-orange-50 text-orange-700',
  approved:       'bg-emerald-50 text-emerald-700',
  scheduled:      'bg-violet-50 text-violet-700',
  published:      'bg-brand-green-100 text-brand-green-600',
  rejected:       'bg-rose-50 text-rose-700',
}

/** A post is a carousel when it carries more than one slide. */
function isCarousel(post: Post): post is Post & { slides: Slide[] } {
  return Array.isArray(post.slides) && post.slides.length > 1
}

function postVideo(post: Post) {
  return post.media?.find((item) => item.type === 'video' && item.url)
}

/** Week bucket within a month: 1-based, by day-of-month (Math.ceil(day / 7)). */
function weekOfMonth(iso: string) {
  return Math.ceil(new Date(iso).getDate() / 7)
}

/**
 * GF-16 — normalize a stored post date (full ISO or plain YYYY-MM-DD) to the
 * `YYYY-MM-DD` value an `<input type="date">` expects. Empty string if unparseable.
 */
function toDateInputValue(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso ?? '')
  if (m) return m[1]
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/** Open the right-side chat pre-filled with a "change this post's image" prompt. */
function requestPictureChange(message: string) {
  window.dispatchEvent(new CustomEvent('mp:open-chat', { detail: { message } }))
}

export default function CalendarView() {
  const t = useT()
  const { plan, posts, brief, refetch } = useOutletContext<
    ClientBundle & { refetch: () => void }
  >()
  const { slug = '' } = useParams<{ slug: string }>()

  const pillarColor = useMemo(() => {
    const m: Record<string, string> = {}
    plan.pillars.forEach((p) => (m[p.name] = p.color))
    return m
  }, [plan.pillars])

  // GF-44 — friendly per-client post names ("Post 12") for user-facing strings
  // (delete dialog, status/delete toasts) instead of the raw c-…/pNNN id.
  const seqMap = useMemo(() => postSeqMap(posts), [posts])
  const nameOf = useCallback(
    (post: Post) => {
      const n = seqMap.get(post.id)
      return n ? t('post.nameN', { n }) : post.id
    },
    [seqMap, t],
  )

  const defaultRange = useMemo(() => defaultCalendarRange(), [])
  const [calendarRange, setCalendarRange] = useState<CalendarRangeConfig>(defaultRange)
  const [rangeDraft, setRangeDraft] = useState<CalendarRangeConfig>(defaultRange)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [savingRange, setSavingRange] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  // GF-22 — post pending delete-confirmation, and the in-flight delete state.
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null)
  const [deleting, setDeleting] = useState(false)
  // GF-15 — manual post creation from the calendar.
  const [creating, setCreating] = useState(false)
  // Post id to focus once `posts` refreshes after a create (jump to the new post).
  const [pendingSelectId, setPendingSelectId] = useState<string | null>(null)
  // GF-4 — review share dialog + unread external-review activity badge.
  const [shareOpen, setShareOpen] = useState(false)
  const [reviewUnread, setReviewUnread] = useState(0)
  // GF-4 v3 — per-post external reviewer feedback (decisions + comments),
  // loaded once for the whole calendar and indexed by postId.
  const [reviewFeedback, setReviewFeedback] = useState<ReviewFeedback>({
    byPost: {},
    general: { comments: [] },
  })

  const reloadReviewFeedback = useCallback(() => {
    if (!isApiEnabled) return
    void apiLoadReviewFeedback(slug).then(setReviewFeedback)
  }, [slug])

  useEffect(() => {
    reloadReviewFeedback()
  }, [reloadReviewFeedback])

  useEffect(() => {
    let cancelled = false
    if (!isApiEnabled) return
    apiLoadCalendarRange(slug).then((range) => {
      if (cancelled) return
      const normalized = normalizeCalendarRange(range)
      setCalendarRange(normalized)
      setRangeDraft(normalized)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  // GF-4 — surface unread external-review activity on the Share button.
  useEffect(() => {
    let cancelled = false
    if (!isApiEnabled) return
    apiLoadReviewActivity(slug, { unread: true, limit: 1 }).then((a) => {
      if (!cancelled) setReviewUnread(a.unreadCount)
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  const rangeMonths = useMemo(() => monthsInRange(calendarRange), [calendarRange])
  const monthKeys = useMemo(() => rangeMonths.map((m) => m.key), [rangeMonths])

  const postsByMonth = useMemo(() => {
    const m: Record<string, Post[]> = {}
    monthKeys.forEach((key) => (m[key] = []))
    posts.forEach((p) => {
      // GF-35 — rejected posts are hidden from the active calendar views; they
      // live in a collapsible "Rejected" section below and stay recoverable.
      if ((p.approval.status || p.status) === 'rejected') return
      const k = monthKeyFromIso(p.date)
      if (m[k]) m[k].push(p)
    })
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => a.date.localeCompare(b.date))
    }
    return m
  }, [posts, monthKeys])

  // GF-35 — rejected posts within the visible range, surfaced (collapsed) so they
  // don't clutter the calendar but can still be restored or deleted.
  const rejectedInRange = useMemo(
    () =>
      posts
        .filter(
          (p) =>
            (p.approval.status || p.status) === 'rejected' &&
            monthKeys.includes(monthKeyFromIso(p.date)),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [posts, monthKeys],
  )

  // GF-9 — content-mix vs strategy for the visible range: actual share of posts
  // per content pillar against each pillar's target weight. Posts whose pillar
  // isn't a known strategy pillar are grouped under "Other".
  const contentMix = useMemo(() => {
    const inRange = posts.filter(
      (p) =>
        monthKeys.includes(monthKeyFromIso(p.date)) &&
        (p.approval.status || p.status) !== 'rejected',
    )
    const total = inRange.length
    const byPillar = new Map<string, number>()
    inRange.forEach((p) => {
      const name = p.pillar || '—'
      byPillar.set(name, (byPillar.get(name) ?? 0) + 1)
    })
    const targetTotal = plan.pillars.reduce((s, p) => s + (p.weight || 0), 0) || 1
    const known = plan.pillars.map((p) => {
      const count = byPillar.get(p.name) ?? 0
      return {
        name: p.name,
        value: count,
        color: p.color,
        actualPct: total ? Math.round((count / total) * 100) : 0,
        targetPct: Math.round(((p.weight || 0) / targetTotal) * 100),
      }
    })
    let other = 0
    byPillar.forEach((count, name) => {
      if (!plan.pillars.some((p) => p.name === name)) other += count
    })
    const data =
      other > 0
        ? [
            ...known,
            {
              name: t('calendar.mixOther'),
              value: other,
              color: '#cbd5e1',
              actualPct: total ? Math.round((other / total) * 100) : 0,
              targetPct: 0,
            },
          ]
        : known
    return { data, total }
  }, [posts, monthKeys, plan.pillars, t])

  // CAL1 â€” overview mode. 'month' = the original single-post carousel viewer.
  const [viewMode, setViewMode] = useState<'week' | 'month' | 'quarter'>('month')
  // GF-31 — default to the current month (if in range) so a manually created
  // post lands where the user is, not on the range's first month.
  const defaultActiveMonth =
    rangeMonths.find((m) => m.isCurrent)?.key ?? rangeMonths[0]?.key ?? defaultRange.startMonth
  const [activeMonth, setActiveMonth] = useState(defaultActiveMonth)
  const [slideIndex, setSlideIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  // Right-pane mode: the full picture (default) or the social-platform mockup.
  const [rightView, setRightView] = useState<'picture' | 'preview'>('picture')
  // GF-20 — which selected network's mockup the Preview tab is showing.
  const [previewChannel, setPreviewChannel] = useState<Channel | null>(null)
  const [zoomOpen, setZoomOpen] = useState(false)
  // Image-slide index (carousel posts only); shared between PicturePane + lightbox.
  const [imageSlide, setImageSlide] = useState(0)
  // CAL2 â€” direct user image upload on a post.
  const [uploading, setUploading] = useState(false)
  // GF-35 — collapsed by default; expands the recoverable rejected list.
  const [showRejected, setShowRejected] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const monthPosts = postsByMonth[activeMonth] ?? []
  const activePost = monthPosts[slideIndex]
  const activeMonthLabel = rangeMonths.find((m) => m.key === activeMonth)?.name ?? activeMonth
  // GF-20 — the networks the active post targets, and which one the Preview tab
  // currently shows (defaults to the first; tolerates a stale selection when the
  // active post changes without needing an effect).
  const previewChannels = activePost ? effectiveChannels(activePost) : []
  const activePreviewChannel =
    previewChannel && previewChannels.includes(previewChannel) ? previewChannel : previewChannels[0]

  useEffect(() => {
    if (!rangeMonths.some((m) => m.key === activeMonth)) {
      setActiveMonth(defaultActiveMonth)
      setSlideIndex(0)
      setDirection(0)
    }
  }, [activeMonth, defaultActiveMonth, rangeMonths])

  const saveRange = async () => {
    const diff = monthDiff(rangeDraft.startMonth, rangeDraft.endMonth)
    if (!Number.isFinite(diff) || diff < 0 || diff > 5) {
      toast.error('Choose a range up to 6 months.')
      return
    }
    const next = normalizeCalendarRange(rangeDraft)
    setSavingRange(true)
    try {
      if (isApiEnabled) await apiSaveCalendarRange(slug, next)
      setCalendarRange(next)
      setRangeOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save calendar range')
    } finally {
      setSavingRange(false)
    }
  }

  // GF-23 — set a post to any workflow status (Draft/Review/Approved/
  // Programmed/Rechecked/Rejected). Published is terminal and never set here.
  const setStatus = async (post: Post, decision: ApprovalDecision) => {
    setApprovingId(post.id)
    try {
      await apiSetApproval(slug, post.id, decision)
      toast(t('calendar.statusSet', { id: nameOf(post), status: t(`status.${decision}`) }), { duration: 1600 })
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('calendar.statusFailed'))
    } finally {
      setApprovingId(null)
    }
  }

  // GF-22 — delete after the confirmation dialog is accepted.
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDeletePost(slug, deleteTarget.id)
      toast(t('calendar.deleted', { id: nameOf(deleteTarget) }), { duration: 1600 })
      setDeleteTarget(null)
      setSlideIndex(0)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('calendar.deleteFailed'))
    } finally {
      setDeleting(false)
    }
  }

  // GF-15 — create a blank draft post, then jump to it.
  // GF-31 — create in the explicitly chosen month (Quarter passes the column's
  // month); defaults to the active month tab in Week/Month views.
  const createPost = useCallback(async (month: string = activeMonth) => {
    if (creating) return
    setCreating(true)
    try {
      const date = `${month}-01`
      const created = await apiCreatePost(slug, {
        date,
        title: t('calendar.newPostTitle'),
        status: 'idea',
      })
      toast(t('calendar.postCreated'), { duration: 1600 })
      setViewMode('month')
      setActiveMonth(monthKeyFromIso(created.date))
      setPendingSelectId(created.id)
      refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('calendar.createFailed'))
    } finally {
      setCreating(false)
    }
  }, [creating, activeMonth, slug, t, refetch])

  // Once a freshly-created post lands in the refreshed `posts`, select it.
  useEffect(() => {
    if (!pendingSelectId) return
    const idx = (postsByMonth[activeMonth] ?? []).findIndex((p) => p.id === pendingSelectId)
    if (idx >= 0) {
      setSlideIndex(idx)
      setDirection(0)
      setPendingSelectId(null)
    }
  }, [pendingSelectId, postsByMonth, activeMonth])

  // GF-17 â€” export the currently visible calendar range as PDF or Word.
  const runExport = useCallback(
    async (kind: 'pdf' | 'word') => {
      try {
        const input = {
          clientName: plan.client.name,
          range: calendarRange,
          posts,
          labels: {
            title: t('calendar.eyebrow'),
            rangeLabel: `${rangeMonths[0]?.label ?? ''} â€“ ${rangeMonths[rangeMonths.length - 1]?.label ?? ''}`,
            date: t('export.date'),
            channel: t('export.channel'),
            format: t('export.format'),
            pillar: t('export.pillar'),
            post: t('export.post'),
            copy: t('calendar.copyLabel'),
            noPosts: t('calendar.noPostsShort'),
            generatedOn: t('export.generatedOn'),
          },
        }
        // Async since images are fetched + embedded into the document.
        if (kind === 'pdf') await exportCalendarPdf(input)
        else await exportCalendarWord(input)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('export.failed'))
      }
    },
    [plan.client.name, calendarRange, posts, rangeMonths, t],
  )

  // CAL2 â€” upload an image straight onto the active post (no Viktor needed).
  // Reuses the inspiration upload endpoint (the API mounts clients/ read-only,
  // so uploads are PB-backed) then PATCHes the returned URL onto post.image.
  const onUploadImage = useCallback(
    async (file: File | null | undefined) => {
      if (!file || !activePost) return
      setUploading(true)
      try {
        const item = await apiUploadInspiration(slug, file, `post ${activePost.id}`)
        await apiPatchPost(slug, activePost.id, { image: item.url })
        toast(t('calendar.imageUploaded'), { duration: 1600 })
        refetch()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('calendar.uploadFailed'))
      } finally {
        setUploading(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [activePost, slug, t, refetch],
  )

  // Reset the image-slide cursor whenever the active post changes.
  useEffect(() => {
    setImageSlide(0)
  }, [activePost?.id])

  const goTo = useCallback(
    (next: number) => {
      const max = monthPosts.length
      if (max === 0) return
      const wrapped = (next + max) % max
      setDirection(wrapped > slideIndex ? 1 : -1)
      setSlideIndex(wrapped)
    },
    [monthPosts.length, slideIndex],
  )

  const next = useCallback(() => goTo(slideIndex + 1), [goTo, slideIndex])
  const prev = useCallback(() => goTo(slideIndex - 1), [goTo, slideIndex])

  // Keyboard arrows â€” but never while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key === 'ArrowRight') { e.preventDefault(); next() }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); prev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  const switchMonth = (m: string) => {
    setActiveMonth(m)
    setSlideIndex(0)
    setDirection(0)
  }

  // CAL1 â€” from a compact card (Week/Quarter) jump into the Month viewer
  // focused on that exact post.
  const jumpToPost = useCallback(
    (post: Post) => {
      const m = monthKeyFromIso(post.date)
      const idx = (postsByMonth[m] ?? []).findIndex((p) => p.id === post.id)
      setActiveMonth(m)
      setSlideIndex(idx < 0 ? 0 : idx)
      setDirection(0)
      setViewMode('month')
    },
    [postsByMonth],
  )

  // GF-13 — deep-link from Approvals: /:slug/calendar?post=<id> opens that exact
  // post in Month view. Wait until posts are loaded so a valid id is not dropped.
  // A waiting post can sit outside the saved calendar range, so first widen the
  // range to include its month (capped at the 6-month window), let `monthKeys`
  // recompute, then jump and clear the param so it does not re-fire or linger.
  const [searchParams, setSearchParams] = useSearchParams()
  const consumedPostParam = useRef<string | null>(null)
  useEffect(() => {
    const targetId = searchParams.get('post')
    if (!targetId || posts.length === 0 || consumedPostParam.current === targetId) return
    const clearParam = () => {
      consumedPostParam.current = targetId
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('post')
      setSearchParams(nextParams, { replace: true })
    }
    const target = posts.find((p) => p.id === targetId)
    const targetMonth = target ? monthKeyFromIso(target.date) : ''
    if (!target || !targetMonth) {
      clearParam()
      return
    }
    // The post can sit outside the saved range; widen to include its month
    // (capped at the 6-month window) and let this effect re-run on the new range.
    if (targetMonth < calendarRange.startMonth || targetMonth > calendarRange.endMonth) {
      setCalendarRange((cur) => {
        if (targetMonth < cur.startMonth) {
          const widened = { startMonth: targetMonth, endMonth: cur.endMonth }
          return monthDiff(widened.startMonth, widened.endMonth) > 5
            ? { startMonth: targetMonth, endMonth: monthKeyFromDate(addMonths(parseMonthKey(targetMonth)!, 5)) }
            : widened
        }
        const widened = { startMonth: cur.startMonth, endMonth: targetMonth }
        return monthDiff(widened.startMonth, widened.endMonth) > 5
          ? { startMonth: monthKeyFromDate(addMonths(parseMonthKey(targetMonth)!, -5)), endMonth: targetMonth }
          : widened
      })
      return // re-runs once calendarRange reflects the widened window
    }
    jumpToPost(target)
    clearParam()
  }, [searchParams, posts, calendarRange, jumpToPost, setSearchParams])

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
          <CalendarDays className="h-3 w-3" />
          {t('calendar.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-brand-blue tracking-tight">
          {plan.quarter.theme || 'Content calendar'}
        </h1>
      </div>

      {/* View-mode toggle (Week Â· Month Â· Quarter) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="inline-flex rounded-full border border-border-subtle bg-paper-muted/50 p-1 text-sm">
        {([
          { mode: 'week' as const,    label: t('calendar.viewWeek'),    Icon: Rows3 },
          { mode: 'month' as const,   label: t('calendar.viewMonth'),   Icon: CalendarDays },
          { mode: 'quarter' as const, label: t('calendar.viewQuarter'), Icon: LayoutGrid },
        ]).map(({ mode, label, Icon }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full font-medium transition-colors',
              viewMode === mode
                ? 'bg-brand-blue text-white shadow-sm'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isApiEnabled && (
            <>
              {/* GF-41 — manual reload of the content calendar. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5"
                title={t('calendar.reload')}
                aria-label={t('calendar.reload')}
              >
                <RefreshCw className="h-3.5 w-3.5 text-brand-blue" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShareOpen(true)}
                className="gap-1.5 relative"
              >
                <Share2 className="h-3.5 w-3.5 text-brand-blue" />
                {t('review.share')}
                {reviewUnread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-green-500 px-1 text-[10px] font-bold text-white">
                    {reviewUnread}
                  </span>
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Download className="h-3.5 w-3.5 text-brand-blue" />
                    {t('export.download')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => runExport('pdf')}>
                    <FileText className="h-3.5 w-3.5 mr-2" />
                    {t('export.asPdf')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => runExport('word')}>
                    <FileType2 className="h-3.5 w-3.5 mr-2" />
                    {t('export.asWord')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setRangeDraft(calendarRange)
              setRangeOpen(true)
            }}
            className="gap-1.5"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {rangeMonths[0]?.label} - {rangeMonths[rangeMonths.length - 1]?.label}
          </Button>
        </div>
      </div>

      {/* Month tabs â€” shown in Week + Month modes (Quarter shows all months). */}
      {viewMode !== 'quarter' && (
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {rangeMonths.map((m) => {
          const count = postsByMonth[m.key]?.length ?? 0
          const isActive = activeMonth === m.key
          return (
            <button
              key={m.key}
              onClick={() => switchMonth(m.key)}
              className={cn(
                'relative shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-ink-muted hover:text-ink hover:bg-paper-muted',
                !isActive && m.isPast && 'opacity-70',
                !isActive && m.isCurrent && 'ring-1 ring-brand-green-300',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="cal-month-pill"
                  className="absolute inset-0 rounded-full bg-brand-blue"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative flex items-center gap-2">
                {m.name}
                {m.isCurrent && <span className="text-[9px] uppercase opacity-80">Today</span>}
                <span
                  className={cn(
                    'inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[10px] font-bold',
                    isActive ? 'bg-white/25 text-white' : 'bg-paper-muted text-ink-muted',
                  )}
                >
                  {count}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      )}

      {/* CAL1 â€” Quarter overview: one column per month, compact cards. */}
      {viewMode === 'quarter' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rangeMonths.map((m) => {
            const list = postsByMonth[m.key] ?? []
            return (
              <div key={m.key} className={cn('space-y-3', m.isPast && 'opacity-80')}>
                <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                  <h3 className="text-sm font-semibold text-brand-blue">
                    {m.name}
                    {m.isCurrent && <span className="ml-2 text-[10px] uppercase text-brand-green-600">Current month</span>}
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-ink-muted">
                      {t('calendar.postsCount', { n: list.length })}
                    </span>
                    {/* GF-31 — add directly into this month (unambiguous in Quarter). */}
                    {isApiEnabled && (
                      <button
                        type="button"
                        onClick={() => createPost(m.key)}
                        disabled={creating}
                        title={t('calendar.addPost')}
                        aria-label={t('calendar.addPost')}
                        className="text-brand-blue hover:text-brand-blue/80 disabled:opacity-50"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {list.length === 0 ? (
                  <p className="text-xs text-ink-muted py-4 text-center">
                    {t('calendar.noPostsShort')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {list.map((p) => (
                      <CompactPostCard
                        key={p.id}
                        post={p}
                        feedback={reviewFeedback.byPost[p.id]}
                        approving={approvingId === p.id}
                        onSetStatus={(d) => setStatus(p, d)}
                        onDelete={() => setDeleteTarget(p)}
                        onSelect={() => jumpToPost(p)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* CAL1 â€” Week overview: active month's posts grouped by week-of-month. */}
      {viewMode === 'week' && (
        monthPosts.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-ink-muted text-sm">
              <CalendarRange className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {t('calendar.noPosts', { month: activeMonthLabel })}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Array.from(
              monthPosts.reduce((map, p) => {
                const w = weekOfMonth(p.date)
                ;(map.get(w) ?? map.set(w, []).get(w)!).push(p)
                return map
              }, new Map<number, Post[]>()),
            )
              .sort((a, b) => a[0] - b[0])
              .map(([week, list]) => (
                <div key={week} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CalendarRange className="h-4 w-4 text-brand-blue" />
                    <h3 className="text-sm font-semibold text-brand-blue">
                      {t('calendar.weekN', { n: week })}
                    </h3>
                    <span className="text-[11px] text-ink-muted">
                      {t('calendar.postsCount', { n: list.length })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {list.map((p) => (
                      <CompactPostCard
                        key={p.id}
                        post={p}
                        feedback={reviewFeedback.byPost[p.id]}
                        approving={approvingId === p.id}
                        onSetStatus={(d) => setStatus(p, d)}
                        onDelete={() => setDeleteTarget(p)}
                        onSelect={() => jumpToPost(p)}
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )
      )}

      {/* Slide (Month view) */}
      {viewMode === 'month' && (monthPosts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-ink-muted text-sm">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {t('calendar.noPosts', { month: activeMonthLabel })}
          </CardContent>
        </Card>
      ) : activePost ? (
        <>
          <div className="relative">
            <div className="flex items-center justify-between mb-3 text-xs text-ink-muted">
              <span>
                {t('calendar.postOf', { n: slideIndex + 1, total: monthPosts.length, month: activeMonthLabel })}
              </span>
              <span className="hidden sm:inline">
                <kbd className="rounded border border-border-subtle bg-paper-muted px-1.5 py-0.5 font-mono text-[10px]">â†</kbd>{' '}
                <kbd className="rounded border border-border-subtle bg-paper-muted px-1.5 py-0.5 font-mono text-[10px]">â†’</kbd> {t('calendar.useArrows').replace('â† â†’ ', '')}
              </span>
            </div>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {/* min height keeps the card from collapsing when a post has
                    little content. (The real GF-30 bug — arrows jumping on click —
                    was the Button's base `active:translate-y-px` overriding the
                    arrows' `-translate-y-1/2` centering on press; fixed on the
                    arrows themselves below with `active:-translate-y-1/2!`.) */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-stretch lg:min-h-[34rem]">
                  {/* Left: copy (editable) */}
                  <CopyPane
                    key={`copy-${activePost.id}`}
                    slug={slug}
                    post={activePost}
                    postName={nameOf(activePost)}
                    pillarColor={pillarColor[activePost.pillar]}
                    onSaved={refetch}
                    approving={approvingId === activePost.id}
                    onSetStatus={(d) => setStatus(activePost, d)}
                    onDelete={() => setDeleteTarget(activePost)}
                  />

                  {/* Vertical divider */}
                  <div className="hidden lg:block w-px bg-border-subtle" />

                  {/* Right: full picture (default) or social mockup (toggle) */}
                  <div className="p-6 lg:p-8 bg-paper-muted/40 flex flex-col">
                    <div className="flex items-center justify-end mb-3">
                      <div className="inline-flex rounded-md border border-border-subtle overflow-hidden text-xs">
                        <button
                          onClick={() => setRightView('picture')}
                          className={cn(
                            'px-2.5 py-1 flex items-center gap-1 transition-colors',
                            rightView === 'picture' ? 'bg-brand-blue text-white' : 'text-ink-muted hover:bg-paper-muted',
                          )}
                        >
                          <ImageIcon className="h-3 w-3" /> {t('calendar.picture')}
                        </button>
                        <button
                          onClick={() => setRightView('preview')}
                          className={cn(
                            'px-2.5 py-1 flex items-center gap-1 transition-colors border-l border-border-subtle',
                            rightView === 'preview' ? 'bg-brand-blue text-white' : 'text-ink-muted hover:bg-paper-muted',
                          )}
                        >
                          <Eye className="h-3 w-3" /> {t('calendar.previewTab')}
                        </button>
                      </div>
                    </div>

                    {/* GF-20 — when the post targets several networks, the Preview
                        tab offers one sub-tab per network so each gets its own mockup. */}
                    {rightView === 'preview' && previewChannels.length > 1 && (
                      <div className="flex items-center justify-center gap-1 mb-3 flex-wrap">
                        {previewChannels.map((c) => (
                          <button
                            key={c}
                            onClick={() => setPreviewChannel(c)}
                            aria-pressed={c === activePreviewChannel}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors',
                              c === activePreviewChannel
                                ? 'border-brand-blue bg-brand-blue text-white'
                                : 'border-border-subtle text-ink-muted hover:bg-paper-muted',
                            )}
                          >
                            <ChannelIcon channel={c} className="h-3.5 w-3.5" tinted={c !== activePreviewChannel} />
                            {CHANNEL_LABEL[c]}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex-1 flex items-center justify-center">
                      <AnimatePresence mode="wait" custom={direction}>
                        <motion.div
                          key={`${activePost.id}-${rightView}-${rightView === 'preview' ? activePreviewChannel : ''}`}
                          custom={direction}
                          initial={{ opacity: 0, x: direction === 0 ? 0 : direction * 40 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: direction === 0 ? 0 : -direction * 40 }}
                          transition={{ duration: 0.25, ease: 'easeOut' }}
                          className="w-full flex justify-center"
                        >
                          {rightView === 'preview' ? (
                            <ChannelMockup
                              post={{ ...activePost, channel: activePreviewChannel ?? activePost.channel }}
                              clientName={plan.client.name}
                              handle={plan.client.handle}
                              logoInitials={plan.client.logoInitials}
                              subtitle={brief.company.industry}
                            />
                          ) : (
                            <PicturePane
                              post={activePost}
                              slideIndex={imageSlide}
                              onSlideChange={setImageSlide}
                              onZoom={() => setZoomOpen(true)}
                            />
                          )}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {rightView === 'picture' && (
                      <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => requestPictureChange(t('calendar.changePicturePrompt', { id: activePost.id, title: activePost.title, format: activePost.format || (isCarousel(activePost) ? 'carousel' : 'single image') }))}
                          className="gap-1.5"
                        >
                          <Wand2 className="h-3.5 w-3.5 text-brand-blue" />
                          {activePost.image ? t('calendar.changePicture') : t('calendar.generatePicture')}
                        </Button>
                        {/* CAL2 â€” direct upload (single-image posts only; carousels
                            are preview-only in V3 so the cover isn't replaced here). */}
                        {isApiEnabled && !isCarousel(activePost) && (
                          <>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              className="hidden"
                              onChange={(e) => onUploadImage(e.target.files?.[0])}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={uploading}
                              onClick={() => fileInputRef.current?.click()}
                              className="gap-1.5"
                            >
                              {uploading ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5 text-brand-blue" />
                              )}
                              {t('calendar.uploadImage')}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Floating prev/next */}
            {monthPosts.length > 1 && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={prev}
                  aria-label={t('calendar.previousPost')}
                  className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 active:-translate-y-1/2! h-10 w-10 rounded-full bg-paper shadow-md hover:bg-brand-blue hover:text-white hover:border-brand-blue z-10"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={next}
                  aria-label={t('calendar.nextPost')}
                  className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 active:-translate-y-1/2! h-10 w-10 rounded-full bg-paper shadow-md hover:bg-brand-blue hover:text-white hover:border-brand-blue z-10"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>

          {/* Dots */}
          {monthPosts.length > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              {monthPosts.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setDirection(i > slideIndex ? 1 : -1)
                    setSlideIndex(i)
                  }}
                  aria-label={t('calendar.goToPost', { n: i + 1 })}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === slideIndex ? 'w-6 bg-brand-blue' : 'w-1.5 bg-border-subtle hover:bg-ink-muted',
                  )}
                />
              ))}
            </div>
          )}

          {/* Thumbnail strip */}
          {monthPosts.length > 1 && (
            <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
              <div className="flex gap-2 pb-1">
                {monthPosts.map((p, i) => {
                  const isActive = i === slideIndex
                  const video = postVideo(p)
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setDirection(i > slideIndex ? 1 : -1)
                        setSlideIndex(i)
                      }}
                      className={cn(
                        'shrink-0 w-32 text-left rounded-lg overflow-hidden border transition-all',
                        isActive
                          ? 'border-brand-blue shadow-sm'
                          : 'border-border-subtle opacity-70 hover:opacity-100',
                      )}
                    >
                      <div className="aspect-video bg-paper-muted overflow-hidden">
                        {video ? (
                          <div className="relative h-full w-full bg-black">
                            <video
                              src={video.url}
                              poster={video.thumbnail}
                              muted
                              playsInline
                              preload="metadata"
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute top-1 right-1 inline-flex items-center rounded-full bg-black/60 text-white p-1">
                              <Film className="h-3 w-3" />
                            </span>
                          </div>
                        ) : p.image ? (
                          <img
                            src={p.image}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-ink-muted text-xs">
                            {t('calendar.noImage')}
                          </div>
                        )}
                      </div>
                      <div className="p-2 space-y-0.5">
                        <p className="text-[10px] text-ink-muted flex items-center gap-1">
                          <ChannelIcon channel={p.channel} className="h-3 w-3" />
                          <span className="truncate">{fmtDate(p.date)}</span>
                          <ReviewSignals feedback={reviewFeedback.byPost[p.id]} />
                        </p>
                        <p className="text-xs font-medium leading-tight line-clamp-2">
                          {p.title}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* GF-4 v3 — external reviewer feedback for the active post. */}
          {isApiEnabled && (
            <ExternalFeedbackPanel
              slug={slug}
              postId={activePost.id}
              feedback={reviewFeedback.byPost[activePost.id]}
              onReplied={reloadReviewFeedback}
            />
          )}

          {/* Lightbox */}
          <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
            <DialogContent className="sm:max-w-4xl p-2 bg-black/95 border-none">
              <DialogTitle className="sr-only">{activePost.title}</DialogTitle>
              {postVideo(activePost) ? (
                <video
                  src={postVideo(activePost)?.url}
                  poster={postVideo(activePost)?.thumbnail}
                  controls
                  playsInline
                  className="w-full max-h-[85vh] rounded bg-black"
                />
              ) : isCarousel(activePost) ? (
                <LightboxCarousel
                  post={activePost}
                  slideIndex={imageSlide}
                  onSlideChange={setImageSlide}
                />
              ) : activePost.image ? (
                <img
                  src={activePost.image}
                  alt={activePost.title}
                  className="w-full max-h-[85vh] object-contain rounded"
                />
              ) : (
                <div className="h-64 flex items-center justify-center text-white/70 text-sm">
                  {t('calendar.noImageDialog')}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </>
      ) : null)}

      {/* GF-15 — add a post manually, at the bottom of the calendar.
          GF-31 — hidden in Quarter view, which has an explicit per-month add
          button (the single bottom button there has no unambiguous month). */}
      {isApiEnabled && viewMode !== 'quarter' && (
        <div className="flex justify-center pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => createPost()}
            disabled={creating}
            className="gap-1.5"
          >
            {creating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 text-brand-blue" />
            )}
            {t('calendar.addPost')}
          </Button>
        </div>
      )}

      {/* GF-35 — rejected posts: hidden from the active calendar, recoverable
          here (restore via the status control, or delete for good). */}
      {isApiEnabled && rejectedInRange.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowRejected((v) => !v)}
            className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
          >
            {showRejected ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {t('status.rejected')} · {t('calendar.postsCount', { n: rejectedInRange.length })}
          </button>
          {showRejected && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {rejectedInRange.map((p) => (
                <CompactPostCard
                  key={p.id}
                  post={p}
                  feedback={reviewFeedback.byPost[p.id]}
                  approving={approvingId === p.id}
                  onSetStatus={(d) => setStatus(p, d)}
                  onDelete={() => setDeleteTarget(p)}
                  onSelect={() => {}}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* GF-9 — content-mix pie chart vs strategy. Shown only in Quarter view. */}
      {viewMode === 'quarter' && (
        <ContentMixChart
          quarterLabel={plan.quarter.label || String(plan.quarter.year ?? '')}
          rangeLabel={`${rangeMonths[0]?.label ?? ''} - ${rangeMonths[rangeMonths.length - 1]?.label ?? ''}`}
          data={contentMix.data}
          total={contentMix.total}
        />
      )}

      <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <DialogContent>
          <DialogTitle>Calendar range</DialogTitle>
          <DialogDescription>
            Select a start and end month. The planning window can span up to 6 months.
          </DialogDescription>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wider text-ink-muted">Start month</span>
              <input
                type="month"
                value={rangeDraft.startMonth}
                onChange={(e) => setRangeDraft((cur) => ({ ...cur, startMonth: e.target.value }))}
                className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-xs uppercase tracking-wider text-ink-muted">End month</span>
              <input
                type="month"
                value={rangeDraft.endMonth}
                onChange={(e) => setRangeDraft((cur) => ({ ...cur, endMonth: e.target.value }))}
                className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
            </label>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRangeOpen(false)} disabled={savingRange}>
              Cancel
            </Button>
            <Button onClick={saveRange} disabled={savingRange}>
              {savingRange && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* GF-22 — delete a post, with an explicit confirmation window. */}
      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && !deleting && setDeleteTarget(null)}>
        <DialogContent>
          <DialogTitle>{t('calendar.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('calendar.deleteBody', { id: deleteTarget ? nameOf(deleteTarget) : '', title: deleteTarget?.title ?? '' })}
          </DialogDescription>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              {t('calendar.deleteConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* GF-4 â€” share-for-review + external-review activity. */}
      {isApiEnabled && (
        <ReviewShareDialog
          slug={slug}
          range={calendarRange}
          open={shareOpen}
          onOpenChange={(v) => {
            setShareOpen(v)
            if (!v) reloadReviewFeedback()
          }}
          onJumpToPost={(postId) => {
            const p = posts.find((x) => x.id === postId)
            if (p) jumpToPost(p)
          }}
          onUnreadChange={setReviewUnread}
        />
      )}
    </div>
  )
}

/**
 * GF-9 — content-mix pie chart. Shows the quarter plus the actual distribution
 * of posts across content pillars (in the visible range) against each pillar's
 * strategy target weight.
 */
function ContentMixChart({
  quarterLabel,
  rangeLabel,
  data,
  total,
}: {
  quarterLabel: string
  rangeLabel: string
  data: Array<{ name: string; value: number; color: string; actualPct: number; targetPct: number }>
  total: number
}) {
  const t = useT()
  const slices = data.filter((d) => d.value > 0)
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <PieChartIcon className="h-4 w-4 text-brand-blue" />
          <h3 className="text-sm font-semibold text-brand-blue">{t('calendar.contentMixTitle')}</h3>
          <span className="text-[11px] text-ink-muted">
            {[quarterLabel, rangeLabel].filter(Boolean).join(' Â· ')}
          </span>
        </div>
        {total === 0 ? (
          <p className="text-xs text-ink-muted py-6 text-center">{t('calendar.contentMixEmpty')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 items-center">
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={48}
                    outerRadius={88}
                    paddingAngle={2}
                  >
                    {slices.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {data.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="font-medium tabular-nums">{d.actualPct}%</span>
                  <span className="text-ink-muted tabular-nums">
                    {t('calendar.mixTarget', { pct: d.targetPct })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * GF-23 — workflow status control. For a live (non-published) post it is a
 * dropdown over the full workflow (Draft/Review/Approved/Programmed/Rechecked/
 * Rejected). A published post is read-only: it shows the Published badge and a
 * link to the live Postiz post when one is known.
 */
function StatusSelect({
  post,
  busy,
  onSetStatus,
  size = 'sm',
}: {
  post: Post
  busy: boolean
  onSetStatus: (decision: ApprovalDecision) => void
  size?: 'sm' | 'xs'
}) {
  const t = useT()

  if (isPublished(post)) {
    const url = publishedUrl(post)
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <Badge variant="secondary" className={cn(size === 'xs' ? 'text-[9px]' : 'text-[10px]', STATUS_STYLES.published)}>
          <Send className={cn(size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3', 'mr-1')} />
          {t('status.published')}
        </Badge>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1 font-medium text-brand-blue hover:underline',
              size === 'xs' ? 'text-[10px]' : 'text-xs',
            )}
          >
            <ExternalLink className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
            {t('calendar.viewPublished')}
          </a>
        )}
      </span>
    )
  }

  const current = laneFor(post) as ApprovalDecision
  const step = WORKFLOW.find((s) => s.key === current) ?? WORKFLOW[1]
  const StepIcon = step.Icon
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          className={cn('gap-1.5', size === 'xs' && 'h-6 px-2 text-[10px]')}
        >
          {busy ? (
            <Loader2 className={size === 'xs' ? 'h-3 w-3 animate-spin' : 'h-3.5 w-3.5 animate-spin'} />
          ) : (
            <StepIcon className={size === 'xs' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
          )}
          {t(step.labelKey)}
          <ChevronDown className={size === 'xs' ? 'h-3 w-3 opacity-60' : 'h-3.5 w-3.5 opacity-60'} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {WORKFLOW.map((s) => {
          const Icon = s.Icon
          return (
            <DropdownMenuItem
              key={s.key}
              disabled={s.key === current}
              onClick={() => onSetStatus(s.key)}
            >
              <Icon className="h-3.5 w-3.5 mr-2" />
              {t(s.labelKey)}
              {s.key === current && <Check className="ml-auto h-3.5 w-3.5 text-brand-green-600" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * CAL1 â€” compact post card reused by Week + Quarter overviews. Small thumbnail,
 * date Â· channel, line-clamped title, status badge. Click jumps to Month view.
 */
function CompactPostCard({
  post,
  feedback,
  onSelect,
  onSetStatus,
  onDelete,
  approving,
}: {
  post: Post
  feedback?: ReviewPostFeedback
  onSelect: () => void
  onSetStatus: (decision: ApprovalDecision) => void
  onDelete: () => void
  approving: boolean
}) {
  const t = useT()
  const slideCount = isCarousel(post) ? post.slides.length : 0
  const video = postVideo(post)
  const timing = dateTiming(post.date)
  return (
    <div
      className={cn(
        'group w-full text-left flex gap-3 rounded-lg border border-border-subtle bg-paper p-2 transition-all',
        timing === 'past' && 'bg-paper-muted/40 opacity-80',
        timing === 'today' && 'border-brand-green-300 ring-1 ring-brand-green-200',
      )}
    >
      <button onClick={onSelect} className="relative shrink-0 h-16 w-16 rounded-md overflow-hidden bg-paper-muted">
        {video ? (
          <div className="relative h-full w-full bg-black">
            <video
              src={video.url}
              poster={video.thumbnail}
              muted
              playsInline
              preload="metadata"
              className="h-full w-full object-cover"
            />
            <span className="absolute top-1 right-1 inline-flex items-center rounded-full bg-black/60 text-white p-1">
              <Film className="h-2.5 w-2.5" />
            </span>
          </div>
        ) : post.image ? (
          <img src={post.image} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-ink-muted">
            <ImageIcon className="h-5 w-5 opacity-40" />
          </div>
        )}
        {slideCount > 1 && (
          <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-black/55 text-white text-[9px] font-medium px-1.5 py-0.5">
            <Images className="h-2.5 w-2.5" />
            {slideCount}
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <button onClick={onSelect} className="block w-full text-left">
          <p className="text-[10px] text-ink-muted truncate flex items-center gap-1">
            <ChannelIcon channel={post.channel} className="h-3 w-3" />
            <span>{CHANNEL_LABEL[post.channel] ?? post.channel}</span>
            <span>· {fmtDate(post.date)}</span>
            {timing === 'past' && <span>· Past</span>}
            {timing === 'today' && <span>· Today</span>}
          </p>
          <p className="text-xs font-medium leading-tight line-clamp-2 group-hover:text-brand-blue transition-colors">
            {post.title}
          </p>
        </button>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusBadges post={post} />
          <ReviewSignals feedback={feedback} />
        </div>
        {isApiEnabled && (
          <div className="flex items-center gap-1 pt-0.5">
            <StatusSelect post={post} busy={approving} onSetStatus={onSetStatus} size="xs" />
            <Button
              size="sm"
              variant="ghost"
              disabled={approving}
              onClick={onDelete}
              aria-label={t('calendar.deletePost')}
              title={t('calendar.deletePost')}
              className="h-6 w-6 p-0 text-ink-muted hover:text-rose-700"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * GF-4 v3 — tiny external-reviewer indicators: ✓ n approved, ✎ n changes
 * requested, 💬 n reviewer comments. Renders nothing without feedback. These
 * are signals from outside reviewers — visually separate from internal status.
 */
function ReviewSignals({ feedback }: { feedback?: ReviewPostFeedback }) {
  const t = useT()
  if (!feedback) return null
  const approved = feedback.decisions.filter((d) => d.decision === 'approved').length
  const changes = feedback.decisions.filter((d) => d.decision === 'changes_requested').length
  const comments = feedback.comments.filter((c) => c.source === 'reviewer').length
  if (!approved && !changes && !comments) return null
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      {approved > 0 && (
        <span
          title={t('review.fb.approvedBy', { n: approved })}
          className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[9px] font-semibold"
        >
          <ThumbsUp className="h-2.5 w-2.5" />
          {approved}
        </span>
      )}
      {changes > 0 && (
        <span
          title={t('review.fb.changesBy', { n: changes })}
          className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 text-amber-700 px-1.5 py-0.5 text-[9px] font-semibold"
        >
          <PenLine className="h-2.5 w-2.5" />
          {changes}
        </span>
      )}
      {comments > 0 && (
        <span
          title={t('review.fb.commentsBy', { n: comments })}
          className="inline-flex items-center gap-0.5 rounded-full bg-brand-blue/10 text-brand-blue px-1.5 py-0.5 text-[9px] font-semibold"
        >
          <MessageSquare className="h-2.5 w-2.5" />
          {comments}
        </span>
      )}
    </span>
  )
}

/**
 * GF-4 v3 — "External feedback" under the month-view post: reviewer decision
 * chips + the comment thread, with a team reply box. Reviewer decisions are
 * signals only; internal Approve/Reject stays in CopyPane.
 */
function ExternalFeedbackPanel({
  slug,
  postId,
  feedback,
  onReplied,
}: {
  slug: string
  postId: string
  feedback?: ReviewPostFeedback
  onReplied: () => void
}) {
  const t = useT()
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  const decisions = feedback?.decisions ?? []
  const comments = feedback?.comments ?? []
  if (decisions.length === 0 && comments.length === 0) return null

  // Replies attach to a review link; thread them onto the link of the latest
  // reviewer comment for this post.
  const lastReviewerComment = [...comments].reverse().find((c) => c.source === 'reviewer')

  const send = async () => {
    if (!reply.trim() || !lastReviewerComment) return
    setSending(true)
    try {
      await apiReplyReviewComment(slug, lastReviewerComment.linkId, reply.trim(), postId)
      setReply('')
      onReplied()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('review.fb.replyFailed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand-blue" />
          {t('review.fb.title')}
        </h3>

        {decisions.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {decisions.map((d) => (
              <span
                key={`${d.reviewerName}-${d.createdAt}`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                  d.decision === 'approved'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700',
                )}
              >
                {d.decision === 'approved' ? (
                  <ThumbsUp className="h-3 w-3" />
                ) : (
                  <PenLine className="h-3 w-3" />
                )}
                {d.reviewerName}
              </span>
            ))}
          </div>
        )}

        {comments.length > 0 && (
          <div className="space-y-1.5">
            {comments.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'text-xs rounded-md px-2.5 py-1.5',
                  c.source === 'dashboard' ? 'bg-brand-blue/5' : 'bg-paper-muted/60',
                )}
              >
                <span className="font-medium">
                  {c.source === 'dashboard' ? t('review.ext.team') : c.reviewerName || t('review.guest')}
                </span>
                {c.createdAt && <span className="text-ink-muted"> · {fmtDate(c.createdAt)}</span>}
                <p className="text-ink mt-0.5 whitespace-pre-line">{c.body}</p>
              </div>
            ))}
          </div>
        )}

        {lastReviewerComment && (
          <div className="flex items-center gap-2">
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={t('review.fb.replyPlaceholder')}
              className="flex-1 min-w-0 rounded-md border border-border-subtle bg-paper px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
            <Button size="sm" onClick={send} disabled={sending || !reply.trim()}>
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatusBadges({ post }: { post: Post }) {
  const approval = post.approval.status || post.status
  const isPublished = post.status === 'published' || Boolean(post.publishing.publishedAt || post.publishing.publicUrl)
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <Badge variant="secondary" className={cn('text-[9px]', STATUS_STYLES[approval] ?? STATUS_STYLES[post.status])}>
        {approval.replace('_', ' ')}
      </Badge>
      {isPublished && (
        <Badge variant="secondary" className={cn('text-[9px]', STATUS_STYLES.published)}>
          published
        </Badge>
      )}
    </div>
  )
}
/** Left pane: editable title + copy, saved into posts_patches via the API. */
function CopyPane({
  slug,
  post,
  postName,
  pillarColor,
  onSaved,
  approving,
  onSetStatus,
  onDelete,
}: {
  slug: string
  post: Post
  postName: string
  pillarColor?: string
  onSaved: () => void
  approving: boolean
  onSetStatus: (decision: ApprovalDecision) => void
  onDelete: () => void
}) {
  const t = useT()
  const initialHashtags = (post.hashtags ?? []).join(' ')
  const initialDate = toDateInputValue(post.date)
  const [title, setTitle] = useState(post.title ?? '')
  const [copy, setCopy] = useState(post.copy ?? '')
  const [hashtags, setHashtags] = useState(initialHashtags)
  const [cta, setCta] = useState(post.cta ?? '')
  // GF-16 — editable publication date (YYYY-MM-DD for the date input).
  const [date, setDate] = useState(initialDate)
  // GF-20 — editable target networks (multi-select, picked above the title).
  const initialChannels = effectiveChannels(post)
  const [channels, setChannels] = useState<Channel[]>(initialChannels)
  const [channelOpen, setChannelOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const channelsChanged = channels.join(',') !== initialChannels.join(',')
  const dirty =
    title !== (post.title ?? '') ||
    copy !== (post.copy ?? '') ||
    hashtags !== initialHashtags ||
    cta !== (post.cta ?? '') ||
    date !== initialDate ||
    channelsChanged

  const save = async () => {
    if (!dirty || saving) return
    const patch: Record<string, unknown> = {}
    if (title !== post.title) patch.title = title
    if (copy !== post.copy) patch.copy = copy
    if (hashtags !== initialHashtags) {
      // Space- or newline-separated tokens â†’ string[]; drop empties, keep as typed.
      patch.hashtags = hashtags.split(/\s+/).map((t) => t.trim()).filter(Boolean)
    }
    if (cta !== (post.cta ?? '')) patch.cta = cta
    if (channelsChanged && channels.length > 0) {
      // Persist the multi-network list and keep the primary `channel` in sync so
      // every single-channel reader (list icon, exports, mockups) stays coherent.
      patch.channels = channels
      patch.channel = channels[0]
    }
    // GF-16 — only send the date when it actually changed and is non-empty
    // (the API rejects an empty date with a 422).
    if (date !== initialDate) {
      if (!date) {
        toast.error(t('calendar.dateRequired'))
        return
      }
      patch.date = date
    }
    setSaving(true)
    try {
      await apiPatchPost(slug, post.id, patch)
      toast(t('calendar.updated', { id: postName }), { duration: 1600 })
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('calendar.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setTitle(post.title ?? '')
    setCopy(post.copy ?? '')
    setHashtags(initialHashtags)
    setCta(post.cta ?? '')
    setDate(initialDate)
    setChannels(initialChannels)
    setChannelOpen(false)
  }

  // Toggle a network in/out of the selection, keeping CHANNEL_ORDER and ≥1 picked.
  const toggleChannel = (c: Channel) => {
    setChannels((prev) => {
      const has = prev.includes(c)
      if (has && prev.length === 1) return prev // never empty
      const next = new Set(prev)
      if (has) next.delete(c)
      else next.add(c)
      return CHANNEL_ORDER.filter((x) => next.has(x))
    })
  }

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{postName}</Badge>
        <StatusBadges post={post} />
        <span className="text-[11px] text-ink-muted">v{post.approval.version}</span>

        {/* GF-20 — target-network selector, top-right above the title. Multi-select:
            a post can target several networks at once (each gets its own preview). */}
        <div className="ml-auto">
          {isApiEnabled ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setChannelOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1 text-[11px] hover:bg-paper-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                aria-haspopup="listbox"
                aria-expanded={channelOpen}
                aria-label={t('context.selectNetwork')}
              >
                {channels.map((c) => (
                  <ChannelIcon key={c} channel={c} className="h-4 w-4" />
                ))}
                {channels.length === 1 && (
                  <span className="font-medium">{CHANNEL_LABEL[channels[0]]}</span>
                )}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </button>
              {channelOpen && (
                <>
                  {/* click-away backdrop */}
                  <div className="fixed inset-0 z-10" onClick={() => setChannelOpen(false)} />
                  <ul
                    role="listbox"
                    aria-multiselectable="true"
                    className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border-subtle bg-paper py-1 shadow-md"
                  >
                    {CHANNEL_ORDER.map((c) => {
                      const on = channels.includes(c)
                      return (
                        <li key={c}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={on}
                            onClick={() => toggleChannel(c)}
                            className={cn(
                              'flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-paper-muted',
                              on && 'font-medium',
                            )}
                          >
                            <ChannelIcon channel={c} className="h-4 w-4" />
                            <span className="flex-1 text-left">{CHANNEL_LABEL[c]}</span>
                            {on && <Check className="h-3.5 w-3.5 text-brand-green-600" />}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </div>
          ) : (
            <span className="flex items-center gap-1">
              {effectiveChannels(post).map((c) => (
                <ChannelIcon key={c} channel={c} className="h-4 w-4" />
              ))}
            </span>
          )}
        </div>
      </div>

      <div>
        {isApiEnabled ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('calendar.postTitle')}
            className="w-full text-2xl font-bold text-ink leading-tight bg-transparent border-b border-transparent hover:border-border-subtle focus:border-brand-blue focus:outline-none transition-colors"
          />
        ) : (
          <h2 className="text-2xl font-bold text-ink leading-tight">{post.title}</h2>
        )}
      </div>

      {/* GF-16 — editable publication date. */}
      {isApiEnabled && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">
            {t('calendar.publishDate')}
          </p>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Pillar name={post.pillar} color={pillarColor} />
        {post.campaign && (
          <Badge variant="outline" className="font-normal">
            <Tag className="h-3 w-3 mr-1" />
            {post.campaign}
          </Badge>
        )}
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">{t('calendar.copyLabel')}</p>
        {isApiEnabled ? (
          <textarea
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            rows={10}
            placeholder={t('calendar.writeCopy')}
            className="w-full text-sm leading-relaxed bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
          />
        ) : (
          <p className="text-sm whitespace-pre-line leading-relaxed text-ink-muted">{post.copy}</p>
        )}
      </div>

      {isApiEnabled ? (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">{t('calendar.hashtags')}</p>
          <textarea
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            rows={2}
            placeholder="#hashtag1 #hashtag2 â€¦"
            className="w-full text-xs text-brand-blue font-medium bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
          />
        </div>
      ) : (
        post.hashtags.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">{t('calendar.hashtags')}</p>
            <p className="text-xs text-brand-blue font-medium">{post.hashtags.join(' ')}</p>
          </div>
        )
      )}

      {isApiEnabled ? (
        <div className="pt-2 border-t border-border-subtle">
          <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{t('calendar.cta')}</p>
          <input
            value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder="Call to actionâ€¦"
            className="w-full text-sm font-medium bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
        </div>
      ) : (
        post.cta && (
          <div className="pt-2 border-t border-border-subtle">
            <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{t('calendar.cta')}</p>
            <p className="text-sm font-medium">{post.cta}</p>
          </div>
        )
      )}

      {post.approval.blockerReason && (
        <p className="text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded-md">
          {t('calendar.blocked', { reason: post.approval.blockerReason })}
        </p>
      )}

      {isApiEnabled && dirty && (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            {t('common.saveChanges')}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={saving}>
            {t('common.discard')}
          </Button>
        </div>
      )}
      {isApiEnabled && (
        <div className="flex items-center gap-2 pt-2 border-t border-border-subtle flex-wrap">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted">
            {t('calendar.statusLabel')}
          </span>
          <StatusSelect post={post} busy={approving} onSetStatus={onSetStatus} />
          <Button
            size="sm"
            variant="ghost"
            disabled={approving}
            onClick={onDelete}
            className="ml-auto text-ink-muted hover:text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {t('calendar.deletePost')}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * Right pane picture. Single-image posts render exactly as before (full image,
 * click to zoom; placeholder when absent). Carousel posts add a slide viewer
 * with arrows, an "i / N" counter, dots and a thumbnail filmstrip. The active
 * slide index is lifted to the parent so the lightbox opens on the same slide.
 */
function PicturePane({
  post,
  slideIndex,
  onSlideChange,
  onZoom,
}: {
  post: Post
  slideIndex: number
  onSlideChange: (i: number) => void
  onZoom: () => void
}) {
  const t = useT()
  const video = postVideo(post)

  if (video) {
    return (
      <div className="w-full max-w-sm flex flex-col gap-2">
        <button
          onClick={onZoom}
          className="group relative w-full rounded-xl overflow-hidden border border-border-subtle bg-black focus:outline-none focus:ring-2 focus:ring-brand-blue"
          title={t('calendar.viewLarger')}
        >
          <video
            src={video.url}
            poster={video.thumbnail}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[60vh] bg-black"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 text-white text-[10px] font-medium px-2 py-0.5">
            <Film className="h-3 w-3" />
            Video
          </span>
          <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Maximize2 className="h-3.5 w-3.5" />
          </span>
        </button>
        {video.caption && <p className="text-xs text-ink-muted text-center line-clamp-2">{video.caption}</p>}
      </div>
    )
  }

  // Carousel viewer.
  if (isCarousel(post)) {
    const slides = post.slides
    const total = slides.length
    const idx = Math.min(Math.max(slideIndex, 0), total - 1)
    const slide = slides[idx]
    const go = (next: number) => onSlideChange((next + total) % total)

    return (
      <div className="w-full max-w-sm flex flex-col gap-3">
        <div className="relative">
          <button
            onClick={onZoom}
            className="group relative block w-full rounded-xl overflow-hidden border border-border-subtle focus:outline-none focus:ring-2 focus:ring-brand-blue"
            title={t('calendar.viewLarger')}
          >
            <img
              src={slide.image}
              alt={slide.caption || post.title}
              className="w-full object-contain max-h-[60vh] bg-paper"
            />
            {slide.caption && (
              <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[11px] leading-snug px-2.5 py-1.5 text-left">
                {slide.caption}
              </span>
            )}
            <span className="absolute top-2 left-2 rounded-full bg-black/55 text-white text-[10px] font-medium px-2 py-0.5">
              {t('calendar.slideCounter', { n: idx + 1, total })}
            </span>
            <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Maximize2 className="h-3.5 w-3.5" />
            </span>
          </button>

          <Button
            variant="outline"
            size="icon"
            onClick={() => go(idx - 1)}
            aria-label={t('calendar.previousSlide')}
            className="absolute left-2 top-1/2 -translate-y-1/2 active:-translate-y-1/2! h-8 w-8 rounded-full bg-paper/90 shadow hover:bg-brand-blue hover:text-white hover:border-brand-blue"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => go(idx + 1)}
            aria-label={t('calendar.nextSlide')}
            className="absolute right-2 top-1/2 -translate-y-1/2 active:-translate-y-1/2! h-8 w-8 rounded-full bg-paper/90 shadow hover:bg-brand-blue hover:text-white hover:border-brand-blue"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Dots */}
        <div className="flex items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => onSlideChange(i)}
              aria-label={t('calendar.goToSlide', { n: i + 1 })}
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === idx ? 'w-6 bg-brand-blue' : 'w-1.5 bg-border-subtle hover:bg-ink-muted',
              )}
            />
          ))}
        </div>

        {/* Thumbnail filmstrip */}
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
          <div className="flex gap-2 pb-1 justify-center">
            {slides.map((s, i) => (
              <button
                key={i}
                onClick={() => onSlideChange(i)}
                aria-label={t('calendar.goToSlide', { n: i + 1 })}
                className={cn(
                  'shrink-0 h-14 w-14 rounded-md overflow-hidden border transition-all',
                  i === idx
                    ? 'border-brand-blue shadow-sm'
                    : 'border-border-subtle opacity-70 hover:opacity-100',
                )}
              >
                <img src={s.image} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Single-image (or no image) â€” unchanged behaviour.
  if (!post.image) {
    return (
      <div className="w-full max-w-sm aspect-square rounded-xl border-2 border-dashed border-border-subtle flex flex-col items-center justify-center text-ink-muted gap-2">
        <ImageIcon className="h-8 w-8 opacity-40" />
        <p className="text-xs">{t('calendar.noPictureYet')}</p>
      </div>
    )
  }
  return (
    <button
      onClick={onZoom}
      className="group relative w-full max-w-sm rounded-xl overflow-hidden border border-border-subtle focus:outline-none focus:ring-2 focus:ring-brand-blue"
      title={t('calendar.viewLarger')}
    >
      <img
        src={post.image}
        alt={post.title}
        className="w-full object-contain max-h-[60vh] bg-paper"
      />
      <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <Maximize2 className="h-3.5 w-3.5" />
      </span>
    </button>
  )
}

/** Full-size carousel viewer inside the lightbox. Opens on `slideIndex`. */
function LightboxCarousel({
  post,
  slideIndex,
  onSlideChange,
}: {
  post: Post & { slides: Slide[] }
  slideIndex: number
  onSlideChange: (i: number) => void
}) {
  const t = useT()
  const slides = post.slides
  const total = slides.length
  const idx = Math.min(Math.max(slideIndex, 0), total - 1)
  const slide = slides[idx]
  const go = (next: number) => onSlideChange((next + total) % total)

  return (
    <div className="relative flex flex-col items-center gap-3">
      <div className="relative w-full flex items-center justify-center">
        <img
          src={slide.image}
          alt={slide.caption || post.title}
          className="w-full max-h-[78vh] object-contain rounded"
        />
        <Button
          variant="outline"
          size="icon"
          onClick={() => go(idx - 1)}
          aria-label={t('calendar.previousSlide')}
          className="absolute left-2 top-1/2 -translate-y-1/2 active:-translate-y-1/2! h-10 w-10 rounded-full bg-paper/90 shadow hover:bg-brand-blue hover:text-white hover:border-brand-blue"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => go(idx + 1)}
          aria-label={t('calendar.nextSlide')}
          className="absolute right-2 top-1/2 -translate-y-1/2 active:-translate-y-1/2! h-10 w-10 rounded-full bg-paper/90 shadow hover:bg-brand-blue hover:text-white hover:border-brand-blue"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
        <span className="absolute top-2 left-2 rounded-full bg-black/55 text-white text-xs font-medium px-2.5 py-1">
          {t('calendar.slideCounter', { n: idx + 1, total })}
        </span>
      </div>

      {slide.caption && (
        <p className="text-white/80 text-xs text-center max-w-prose px-2">{slide.caption}</p>
      )}

      <div className="flex items-center justify-center gap-1.5 pb-1">
        {slides.map((_, i) => (
          <button
            key={i}
            onClick={() => onSlideChange(i)}
            aria-label={t('calendar.goToSlide', { n: i + 1 })}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === idx ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70',
            )}
          />
        ))}
      </div>
    </div>
  )
}

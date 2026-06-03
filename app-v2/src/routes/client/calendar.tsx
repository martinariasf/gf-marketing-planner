import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { ChannelMockup } from '@/components/channel-mockup'
import { Pillar } from '@/components/pillar'
import { fmtDate } from '@/lib/format'
import { apiPatchPost, apiUploadInspiration, isApiEnabled } from '@/lib/api-client'
import { toast } from 'sonner'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Tag,
  ImageIcon,
  Maximize2,
  Wand2,
  Save,
  Loader2,
  Eye,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'
import type { Post } from '@/types'
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

function monthKey(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'long' })
}

/** A post is a carousel when it carries more than one slide. */
function isCarousel(post: Post): post is Post & { slides: Slide[] } {
  return Array.isArray(post.slides) && post.slides.length > 1
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

  const months = plan.quarter.months.map((m) => m.name)

  const postsByMonth = useMemo(() => {
    const m: Record<string, Post[]> = {}
    months.forEach((name) => (m[name] = []))
    posts.forEach((p) => {
      const k = monthKey(p.date)
      if (m[k]) m[k].push(p)
    })
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => a.date.localeCompare(b.date))
    }
    return m
  }, [posts, months])

  const [activeMonth, setActiveMonth] = useState(months[0])
  const [slideIndex, setSlideIndex] = useState(0)
  const [direction, setDirection] = useState(0)
  // Right-pane mode: the full picture (default) or the social-platform mockup.
  const [rightView, setRightView] = useState<'picture' | 'preview'>('picture')
  const [zoomOpen, setZoomOpen] = useState(false)
  // Image-slide index (carousel posts only); shared between PicturePane + lightbox.
  const [imageSlide, setImageSlide] = useState(0)
  // CAL2 — direct user image upload on a post.
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const monthPosts = postsByMonth[activeMonth] ?? []
  const activePost = monthPosts[slideIndex]

  // CAL2 — upload an image straight onto the active post (no Viktor needed).
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

  // Keyboard arrows — but never while typing in a field.
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

      {/* Month tabs */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {months.map((m) => {
          const count = postsByMonth[m]?.length ?? 0
          const isActive = activeMonth === m
          return (
            <button
              key={m}
              onClick={() => switchMonth(m)}
              className={cn(
                'relative shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-ink-muted hover:text-ink hover:bg-paper-muted',
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
                {m}
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

      {/* Slide */}
      {monthPosts.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-ink-muted text-sm">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {t('calendar.noPosts', { month: activeMonth })}
          </CardContent>
        </Card>
      ) : activePost ? (
        <>
          <div className="relative">
            <div className="flex items-center justify-between mb-3 text-xs text-ink-muted">
              <span>
                {t('calendar.postOf', { n: slideIndex + 1, total: monthPosts.length, month: activeMonth })}
              </span>
              <span className="hidden sm:inline">
                <kbd className="rounded border border-border-subtle bg-paper-muted px-1.5 py-0.5 font-mono text-[10px]">←</kbd>{' '}
                <kbd className="rounded border border-border-subtle bg-paper-muted px-1.5 py-0.5 font-mono text-[10px]">→</kbd> {t('calendar.useArrows').replace('← → ', '')}
              </span>
            </div>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-stretch">
                  {/* Left: copy (editable) */}
                  <CopyPane
                    key={`copy-${activePost.id}`}
                    slug={slug}
                    post={activePost}
                    pillarColor={pillarColor[activePost.pillar]}
                    onSaved={refetch}
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

                    <div className="flex-1 flex items-center justify-center">
                      <AnimatePresence mode="wait" custom={direction}>
                        <motion.div
                          key={`${activePost.id}-${rightView}`}
                          custom={direction}
                          initial={{ opacity: 0, x: direction === 0 ? 0 : direction * 40 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: direction === 0 ? 0 : -direction * 40 }}
                          transition={{ duration: 0.25, ease: 'easeOut' }}
                          className="w-full flex justify-center"
                        >
                          {rightView === 'preview' ? (
                            <ChannelMockup
                              post={activePost}
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
                          onClick={() => requestPictureChange(t('calendar.changePicturePrompt', { id: activePost.id, title: activePost.title }))}
                          className="gap-1.5"
                        >
                          <Wand2 className="h-3.5 w-3.5 text-brand-blue" />
                          {activePost.image ? t('calendar.changePicture') : t('calendar.generatePicture')}
                        </Button>
                        {/* CAL2 — direct upload (single-image posts only; carousels
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
                  className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-paper shadow-md hover:bg-brand-blue hover:text-white hover:border-brand-blue z-10"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={next}
                  aria-label={t('calendar.nextPost')}
                  className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-paper shadow-md hover:bg-brand-blue hover:text-white hover:border-brand-blue z-10"
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
                        {p.image ? (
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
                        <p className="text-[10px] text-ink-muted">
                          {fmtDate(p.date)} · {p.channel}
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

          {/* Lightbox */}
          <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
            <DialogContent className="sm:max-w-4xl p-2 bg-black/95 border-none">
              <DialogTitle className="sr-only">{activePost.title}</DialogTitle>
              {isCarousel(activePost) ? (
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
      ) : null}
    </div>
  )
}

/** Left pane: editable title + copy, saved into posts_patches via the API. */
function CopyPane({
  slug,
  post,
  pillarColor,
  onSaved,
}: {
  slug: string
  post: Post
  pillarColor?: string
  onSaved: () => void
}) {
  const t = useT()
  const initialHashtags = (post.hashtags ?? []).join(' ')
  const [title, setTitle] = useState(post.title ?? '')
  const [copy, setCopy] = useState(post.copy ?? '')
  const [hashtags, setHashtags] = useState(initialHashtags)
  const [cta, setCta] = useState(post.cta ?? '')
  const [saving, setSaving] = useState(false)

  const dirty =
    title !== (post.title ?? '') ||
    copy !== (post.copy ?? '') ||
    hashtags !== initialHashtags ||
    cta !== (post.cta ?? '')

  const save = async () => {
    if (!dirty || saving) return
    const patch: Record<string, unknown> = {}
    if (title !== post.title) patch.title = title
    if (copy !== post.copy) patch.copy = copy
    if (hashtags !== initialHashtags) {
      // Space- or newline-separated tokens → string[]; drop empties, keep as typed.
      patch.hashtags = hashtags.split(/\s+/).map((t) => t.trim()).filter(Boolean)
    }
    if (cta !== (post.cta ?? '')) patch.cta = cta
    setSaving(true)
    try {
      await apiPatchPost(slug, post.id, patch)
      toast(t('calendar.updated', { id: post.id }), { duration: 1600 })
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
  }

  return (
    <div className="p-6 lg:p-8 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="font-mono text-[10px]">{post.id}</Badge>
        <Badge variant="secondary" className={cn(STATUS_STYLES[post.status])}>
          {post.status.replace('_', ' ')}
        </Badge>
        <span className="text-[11px] text-ink-muted">v{post.approval.version}</span>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
          {fmtDate(post.date)} · {post.channel} · {post.format}
        </p>
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
            placeholder="#hashtag1 #hashtag2 …"
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
            placeholder="Call to action…"
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
            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-paper/90 shadow hover:bg-brand-blue hover:text-white hover:border-brand-blue"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => go(idx + 1)}
            aria-label={t('calendar.nextSlide')}
            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-paper/90 shadow hover:bg-brand-blue hover:text-white hover:border-brand-blue"
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

  // Single-image (or no image) — unchanged behaviour.
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
          className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-paper/90 shadow hover:bg-brand-blue hover:text-white hover:border-brand-blue"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => go(idx + 1)}
          aria-label={t('calendar.nextSlide')}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-paper/90 shadow hover:bg-brand-blue hover:text-white hover:border-brand-blue"
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

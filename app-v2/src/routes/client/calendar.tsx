import { useEffect, useMemo, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChannelMockup } from '@/components/channel-mockup'
import { Pillar } from '@/components/pillar'
import { fmtDate } from '@/lib/format'
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Tag,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientBundle } from '@/lib/client-data'
import type { Post } from '@/types'

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

export default function CalendarView() {
  const { plan, posts } = useOutletContext<ClientBundle>()

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

  const monthPosts = postsByMonth[activeMonth] ?? []
  const activePost = monthPosts[slideIndex]

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

  // Keyboard arrows
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return
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
          Content calendar
        </p>
        <h1 className="text-3xl font-bold text-brand-blue tracking-tight">
          {plan.quarter.label}
        </h1>
        {plan.quarter.theme && (
          <p className="text-sm text-ink-muted mt-1">{plan.quarter.theme}</p>
        )}
      </div>

      {/* Month tabs - horizontal, prominent, right under the quarter */}
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
            No posts scheduled for {activeMonth} yet.
          </CardContent>
        </Card>
      ) : activePost ? (
        <>
          <div className="relative">
            {/* Slide counter + keyboard hint */}
            <div className="flex items-center justify-between mb-3 text-xs text-ink-muted">
              <span>
                Post <span className="font-semibold text-ink">{slideIndex + 1}</span> of{' '}
                <span className="font-semibold text-ink">{monthPosts.length}</span> in {activeMonth}
              </span>
              <span className="hidden sm:inline">
                Use <kbd className="rounded border border-border-subtle bg-paper-muted px-1.5 py-0.5 font-mono text-[10px]">←</kbd>{' '}
                <kbd className="rounded border border-border-subtle bg-paper-muted px-1.5 py-0.5 font-mono text-[10px]">→</kbd> to navigate
              </span>
            </div>

            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] items-stretch">
                  {/* Left: post metadata */}
                  <div className="p-6 lg:p-8 space-y-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {activePost.id}
                      </Badge>
                      <Badge variant="secondary" className={cn(STATUS_STYLES[activePost.status])}>
                        {activePost.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-[11px] text-ink-muted">
                        v{activePost.approval.version}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                        {fmtDate(activePost.date)} · {activePost.channel} · {activePost.format}
                      </p>
                      <h2 className="text-2xl font-bold text-ink leading-tight">
                        {activePost.title}
                      </h2>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Pillar
                        name={activePost.pillar}
                        color={pillarColor[activePost.pillar]}
                      />
                      {activePost.campaign && (
                        <Badge variant="outline" className="font-normal">
                          <Tag className="h-3 w-3 mr-1" />
                          {activePost.campaign}
                        </Badge>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">
                        Copy
                      </p>
                      <p className="text-sm whitespace-pre-line leading-relaxed text-ink-muted line-clamp-[12]">
                        {activePost.copy}
                      </p>
                    </div>

                    {activePost.hashtags.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">
                          Hashtags
                        </p>
                        <p className="text-xs text-brand-blue font-medium">
                          {activePost.hashtags.join(' ')}
                        </p>
                      </div>
                    )}

                    {activePost.cta && (
                      <div className="pt-2 border-t border-border-subtle">
                        <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                          CTA
                        </p>
                        <p className="text-sm font-medium">{activePost.cta}</p>
                      </div>
                    )}

                    {activePost.approval.blockerReason && (
                      <p className="text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded-md">
                        Blocked: {activePost.approval.blockerReason}
                      </p>
                    )}
                  </div>

                  {/* Vertical divider */}
                  <div className="hidden lg:block w-px bg-border-subtle" />

                  {/* Right: channel mockup */}
                  <div className="p-6 lg:p-8 bg-paper-muted/40 flex items-center justify-center">
                    <AnimatePresence mode="wait" custom={direction}>
                      <motion.div
                        key={activePost.id}
                        custom={direction}
                        initial={{ opacity: 0, x: direction === 0 ? 0 : direction * 40 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: direction === 0 ? 0 : -direction * 40 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                        drag={monthPosts.length > 1 ? 'x' : false}
                        dragConstraints={{ left: 0, right: 0 }}
                        dragElastic={0.4}
                        onDragEnd={(_, info) => {
                          if (info.offset.x < -80) next()
                          else if (info.offset.x > 80) prev()
                        }}
                      >
                        <ChannelMockup
                          post={activePost}
                          clientName={plan.client.name}
                          handle={plan.client.handle}
                          logoInitials={plan.client.logoInitials}
                        />
                      </motion.div>
                    </AnimatePresence>
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
                  aria-label="Previous post"
                  className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-paper shadow-md hover:bg-brand-blue hover:text-white hover:border-brand-blue z-10"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={next}
                  aria-label="Next post"
                  className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-paper shadow-md hover:bg-brand-blue hover:text-white hover:border-brand-blue z-10"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}
          </div>

          {/* Dots indicator */}
          {monthPosts.length > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              {monthPosts.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setDirection(i > slideIndex ? 1 : -1)
                    setSlideIndex(i)
                  }}
                  aria-label={`Go to post ${i + 1}`}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === slideIndex ? 'w-6 bg-brand-blue' : 'w-1.5 bg-border-subtle hover:bg-ink-muted',
                  )}
                />
              ))}
            </div>
          )}

          {/* Thumbnail strip for quick jump nav */}
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
                            no image
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
        </>
      ) : null}
    </div>
  )
}

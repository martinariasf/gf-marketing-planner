// GF-4 — dashboard "Share for review" dialog.
//
// Two tabs:
//   Links    — create a protected review link for the visible calendar range,
//              show its code (once) + URL, copy/revoke/rotate existing links.
//   Activity — external reviewer comments / decisions, with unread counts,
//              mark-as-read, and "open the reviewed post" (jumps the calendar).
//
// Internal approval authority stays in the dashboard: a reviewer decision shows
// here as a signal, it never changes post status on its own.

import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Link2,
  Copy,
  Check,
  Loader2,
  RotateCcw,
  Ban,
  MessageSquare,
  ThumbsUp,
  PenLine,
  Bell,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import type { CalendarRangeConfig } from '@/lib/planning-range'
import {
  apiCreateReviewLink,
  apiListReviewLinks,
  apiRevokeReviewLink,
  apiRotateReviewLink,
  apiLoadReviewActivity,
  apiMarkReviewActivityRead,
  type ReviewLink,
  type ReviewEvent,
} from '@/lib/api-client'

function reviewUrl(reviewPath: string): string {
  if (typeof window === 'undefined') return reviewPath
  return `${window.location.origin}${reviewPath}`
}

export function ReviewShareDialog({
  slug,
  range,
  open,
  onOpenChange,
  onJumpToPost,
  onUnreadChange,
}: {
  slug: string
  range: CalendarRangeConfig
  open: boolean
  onOpenChange: (v: boolean) => void
  onJumpToPost: (postId: string) => void
  onUnreadChange?: (count: number) => void
}) {
  const t = useT()
  const [links, setLinks] = useState<ReviewLink[]>([])
  const [events, setEvents] = useState<ReviewEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [l, a] = await Promise.all([
        apiListReviewLinks(slug),
        apiLoadReviewActivity(slug, { limit: 50 }),
      ])
      setLinks(l)
      setEvents(a.items)
      onUnreadChange?.(a.unreadCount)
    } finally {
      setLoading(false)
    }
  }, [slug, onUnreadChange])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  const create = async () => {
    setCreating(true)
    try {
      const link = await apiCreateReviewLink(slug, {
        rangeStart: range.startMonth,
        rangeEnd: range.endMonth,
        title: t('review.defaultTitle', { start: range.startMonth, end: range.endMonth }),
      })
      if (link.code) setRevealed((r) => ({ ...r, [link.id]: link.code! }))
      toast.success(t('review.linkCreated'))
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('review.createFailed'))
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (link: ReviewLink) => {
    setBusyId(link.id)
    try {
      await apiRevokeReviewLink(slug, link.id)
      toast(t('review.revoked'))
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('review.actionFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const rotate = async (link: ReviewLink) => {
    setBusyId(link.id)
    try {
      const updated = await apiRotateReviewLink(slug, link.id)
      if (updated.code) setRevealed((r) => ({ ...r, [link.id]: updated.code! }))
      toast.success(t('review.rotated'))
      await refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('review.actionFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500)
    } catch {
      toast.error(t('review.copyFailed'))
    }
  }

  const markAllRead = async () => {
    try {
      await apiMarkReviewActivityRead(slug, { all: true })
      await refresh()
    } catch {
      /* ignore */
    }
  }

  const openPost = async (ev: ReviewEvent) => {
    if (!ev.read && ev.id) {
      try {
        await apiMarkReviewActivityRead(slug, { ids: [ev.id] })
      } catch {
        /* ignore */
      }
    }
    if (ev.postId) {
      onJumpToPost(ev.postId)
      onOpenChange(false)
    }
    void refresh()
  }

  const unread = events.filter((e) => !e.read).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-brand-blue" />
            {t('review.title')}
          </DialogTitle>
          <DialogDescription>{t('review.subtitle')}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="links" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="links" className="flex-1">
              {t('review.tabLinks')}
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1 gap-1.5">
              {t('review.tabActivity')}
              {unread > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-green-100 px-1 text-[10px] font-semibold text-brand-green-600">
                  {unread}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Links ── */}
          <TabsContent value="links" className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-muted">
                {t('review.rangeHint', { start: range.startMonth, end: range.endMonth })}
              </p>
              <Button size="sm" onClick={create} disabled={creating}>
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t('review.createLink')}
              </Button>
            </div>

            {loading && links.length === 0 ? (
              <div className="py-8 flex justify-center text-ink-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : links.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">{t('review.noLinks')}</p>
            ) : (
              <div className="space-y-2 max-h-[46vh] overflow-y-auto -mx-1 px-1">
                {links.map((link) => {
                  const url = reviewUrl(link.reviewPath)
                  const code = revealed[link.id]
                  return (
                    <div
                      key={link.id}
                      className={cn(
                        'rounded-lg border border-border-subtle bg-paper p-3 space-y-2',
                        link.state !== 'active' && 'opacity-70',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{link.title || url}</p>
                          <p className="text-[11px] text-ink-muted">
                            {link.rangeStart} – {link.rangeEnd}
                            {link.commentCount ? ` · ${t('review.commentsN', { n: link.commentCount })}` : ''}
                          </p>
                        </div>
                        <StateBadge state={link.state} t={t} />
                      </div>

                      <div className="flex items-center gap-1.5">
                        <input
                          readOnly
                          value={url}
                          className="flex-1 min-w-0 rounded-md border border-border-subtle bg-paper-muted/50 px-2 py-1 text-[11px] text-ink-muted"
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7 shrink-0"
                          onClick={() => copy(`url-${link.id}`, url)}
                          aria-label={t('review.copyLink')}
                        >
                          {copied === `url-${link.id}` ? (
                            <Check className="h-3.5 w-3.5 text-brand-green-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>

                      {code && (
                        <div className="flex items-center gap-1.5 rounded-md bg-brand-blue/5 border border-brand-blue/20 px-2 py-1.5">
                          <span className="text-[10px] uppercase tracking-wider text-ink-muted">
                            {t('review.code')}
                          </span>
                          <code className="font-mono text-sm font-bold tracking-widest text-brand-blue">
                            {code}
                          </code>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 ml-auto"
                            onClick={() => copy(`code-${link.id}`, code)}
                            aria-label={t('review.copyCode')}
                          >
                            {copied === `code-${link.id}` ? (
                              <Check className="h-3.5 w-3.5 text-brand-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      )}
                      {code && (
                        <p className="text-[10px] text-amber-700">{t('review.codeOnce')}</p>
                      )}

                      {link.state === 'active' && (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px]"
                            disabled={busyId === link.id}
                            onClick={() => rotate(link)}
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            {t('review.rotate')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] text-rose-700"
                            disabled={busyId === link.id}
                            onClick={() => revoke(link)}
                          >
                            <Ban className="h-3 w-3 mr-1" />
                            {t('review.revoke')}
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          {/* ── Activity ── */}
          <TabsContent value="activity" className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-ink-muted">{t('review.activityHint')}</p>
              {unread > 0 && (
                <Button size="sm" variant="ghost" onClick={markAllRead}>
                  <Bell className="h-3.5 w-3.5 mr-1.5" />
                  {t('review.markAllRead')}
                </Button>
              )}
            </div>
            {loading && events.length === 0 ? (
              <div className="py-8 flex justify-center text-ink-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : events.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-muted">{t('review.noActivity')}</p>
            ) : (
              <div className="space-y-1.5 max-h-[46vh] overflow-y-auto -mx-1 px-1">
                {events.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => openPost(ev)}
                    className={cn(
                      'w-full text-left flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors',
                      ev.read
                        ? 'border-border-subtle bg-paper hover:bg-paper-muted'
                        : 'border-brand-blue/30 bg-brand-blue/5 hover:bg-brand-blue/10',
                    )}
                  >
                    <EventIcon kind={ev.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs">
                        <span className="font-medium">{ev.reviewerName || t('review.guest')}</span>{' '}
                        {t(`review.event.${ev.kind}`)}
                        {ev.postId ? ` · ${ev.postId}` : ''}
                      </p>
                      {ev.preview && (
                        <p className="text-[11px] text-ink-muted line-clamp-2">{ev.preview}</p>
                      )}
                    </div>
                    {ev.postId && <ExternalLink className="h-3.5 w-3.5 text-ink-muted shrink-0 mt-0.5" />}
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function StateBadge({ state, t }: { state: ReviewLink['state']; t: (k: string) => string }) {
  const map: Record<ReviewLink['state'], string> = {
    active: 'bg-emerald-50 text-emerald-700',
    revoked: 'bg-rose-50 text-rose-700',
    expired: 'bg-neutral-100 text-neutral-600',
  }
  return (
    <Badge variant="secondary" className={cn('text-[10px] shrink-0', map[state])}>
      {t(`review.state.${state}`)}
    </Badge>
  )
}

function EventIcon({ kind }: { kind: ReviewEvent['kind'] }) {
  if (kind === 'approved')
    return <ThumbsUp className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
  if (kind === 'changes_requested')
    return <PenLine className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
  return <MessageSquare className="h-4 w-4 text-brand-blue shrink-0 mt-0.5" />
}

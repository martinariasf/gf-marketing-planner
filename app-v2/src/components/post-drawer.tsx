// Phase 4 post drawer — right-side Sheet for staging-only quick edits.
//
// Opens from any post card with a click handler. Lets the user tweak title,
// copy and date, then PATCH /api/v1/clients/:slug/posts/:id stores the delta
// in posts_patches (overlay). Disk JSON never touched.

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Loader2, Save, Check } from 'lucide-react'
import { toast } from 'sonner'
import { apiPatchPost } from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import type { Post, Channel } from '@/types'
import { ChannelIcon, CHANNEL_LABEL, CHANNEL_ORDER } from '@/components/channel-icon'
import { cn } from '@/lib/utils'

export function PostDrawer({
  slug,
  post,
  open,
  onOpenChange,
  onSaved,
}: {
  slug: string
  post: Post | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [copy, setCopy] = useState('')
  const [date, setDate] = useState('')
  const [channel, setChannel] = useState<Channel>('linkedin')
  const [channelOpen, setChannelOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!post) return
    setTitle(post.title ?? '')
    setCopy(post.copy ?? '')
    setDate(post.date ?? '')
    setChannel(post.channel)
    setChannelOpen(false)
  }, [post])

  async function save() {
    if (!post || saving) return
    const patch: Record<string, unknown> = {}
    if (title !== post.title) patch.title = title
    if (copy !== post.copy) patch.copy = copy
    if (date !== post.date) patch.date = date
    if (channel !== post.channel) patch.channel = channel
    if (Object.keys(patch).length === 0) {
      onOpenChange(false)
      return
    }
    setSaving(true)
    try {
      await apiPatchPost(slug, post.id, patch)
      toast(t('calendar.updated', { id: post.id }), { duration: 1800 })
      onSaved()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('postDrawer.patchFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>{t('postDrawer.editPost')}</SheetTitle>
          <SheetDescription>
            {t('postDrawer.description')}
          </SheetDescription>
        </SheetHeader>

        {post && (
          <div className="px-4 flex-1 overflow-y-auto space-y-4 py-4">
            <div className="text-[11px] text-ink-muted font-mono">
              {post.id} · {CHANNEL_LABEL[channel] ?? channel} · {post.pillar}
            </div>
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">{t('postDrawer.title')}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full border border-border-subtle rounded-md px-2 py-1.5 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">{t('postDrawer.date')}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="border border-border-subtle rounded-md px-2 py-1.5 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
            </label>
            <div className="block space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-ink-muted">{t('postDrawer.copy')}</span>
                {/* GF-20: click the network icon at the top-right of the copy to
                    switch which social network this post targets. */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setChannelOpen((o) => !o)}
                    className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1 text-[11px] hover:bg-paper-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                    aria-haspopup="listbox"
                    aria-expanded={channelOpen}
                    aria-label={t('postDrawer.channel')}
                  >
                    <ChannelIcon channel={channel} className="h-4 w-4" />
                    <span className="font-medium">{CHANNEL_LABEL[channel] ?? channel}</span>
                  </button>
                  {channelOpen && (
                    <ul
                      role="listbox"
                      className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-border-subtle bg-paper py-1 shadow-md"
                    >
                      {CHANNEL_ORDER.map((c) => (
                        <li key={c}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={c === channel}
                            onClick={() => {
                              setChannel(c)
                              setChannelOpen(false)
                            }}
                            className={cn(
                              'flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-paper-muted',
                              c === channel && 'font-medium',
                            )}
                          >
                            <ChannelIcon channel={c} className="h-4 w-4" />
                            <span className="flex-1 text-left">{CHANNEL_LABEL[c]}</span>
                            {c === channel && <Check className="h-3.5 w-3.5 text-brand-green-600" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <textarea
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                rows={10}
                className="w-full border border-border-subtle rounded-md px-2 py-1.5 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-mono"
              />
            </div>
          </div>
        )}

        <SheetFooter>
          <Button onClick={save} disabled={saving || !post}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {t('common.save')}
          </Button>
          <SheetClose asChild>
            <Button variant="outline">{t('common.cancel')}</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

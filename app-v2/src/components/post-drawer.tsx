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
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { apiPatchPost } from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import type { Post } from '@/types'

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
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!post) return
    setTitle(post.title ?? '')
    setCopy(post.copy ?? '')
    setDate(post.date ?? '')
  }, [post])

  async function save() {
    if (!post || saving) return
    const patch: Record<string, unknown> = {}
    if (title !== post.title) patch.title = title
    if (copy !== post.copy) patch.copy = copy
    if (date !== post.date) patch.date = date
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
              {post.id} · {post.channel} · {post.pillar}
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
            <label className="block space-y-1">
              <span className="text-[11px] uppercase tracking-wider text-ink-muted">{t('postDrawer.copy')}</span>
              <textarea
                value={copy}
                onChange={(e) => setCopy(e.target.value)}
                rows={10}
                className="w-full border border-border-subtle rounded-md px-2 py-1.5 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30 font-mono"
              />
            </label>
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

// GF-107 — the Month-view copy pane, in three competing layouts.
//
// The pane used to stack eleven full-width blocks, each with its own tiny
// uppercase label, and rendered the workflow status twice: once as a badge at
// the top and once as the dropdown at the bottom that actually sets it. The
// title was a single-line <input> at text-2xl, so a long headline scrolled
// sideways instead of wrapping.
//
// All the editing behaviour (dirty tracking, PATCH payload, channel toggling)
// lives in `useCopyPaneState` and is shared verbatim by the three layouts, so
// picking a winner is purely a matter of deleting the two losers.
//
//   A — one metadata strip, unlabelled content body
//   B — two zones, metadata + status in a bottom action bar
//   C — progressive disclosure, hashtags and details folded away
//
// Pick with `?cardv=a|b|c` on the calendar URL; `a` is the default.

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChannelIcon, CHANNEL_LABEL, CHANNEL_ORDER, effectiveChannels } from '@/components/channel-icon'
import { Pillar } from '@/components/pillar'
import { StatusSelect } from '@/components/calendar/status-select'
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Save,
  Send,
  Tag,
  Trash2,
  CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'
import { fmtDate } from '@/lib/format'
import { apiPatchPost, isApiEnabled, type ApprovalDecision } from '@/lib/api-client'
import { isPublished } from '@/lib/post-status'
import { POST_FORMATS, POST_FORMAT_LABEL_KEY, postFormatLabelKey, isCanonicalFormat } from '@/lib/post-format'
import { toast } from 'sonner'
import type { Post, Channel } from '@/types'

/** A post is a carousel when it carries more than one slide. */
function isCarousel(post: Post): boolean {
  return Array.isArray(post.slides) && post.slides.length > 1
}

export type CardVariant = 'a' | 'b' | 'c'

/** The three variants a `?cardv=` value may select. */
export function parseCardVariant(raw: string | null): CardVariant {
  return raw === 'b' || raw === 'c' ? raw : 'a'
}

export interface CopyPaneProps {
  slug: string
  post: Post
  postName: string
  pillarColor?: string
  onSaved: () => void
  approving: boolean
  onSetStatus: (decision: ApprovalDecision) => void
  onDelete: () => void
  variant?: CardVariant
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

/**
 * Every piece of editing state and behaviour the pane needs, independent of how
 * it is laid out. Unchanged from the pre-GF-107 inline implementation.
 */
function useCopyPaneState({ slug, post, postName, onSaved }: CopyPaneProps) {
  const t = useT()
  // GF-37 — a published post is terminal: the editor is read-only / greyed out.
  const locked = isPublished(post)
  const initialHashtags = (post.hashtags ?? []).join(' ')
  const initialDate = toDateInputValue(post.date)
  const [title, setTitle] = useState(post.title ?? '')
  const [copy, setCopy] = useState(post.copy ?? '')
  const [hashtags, setHashtags] = useState(initialHashtags)
  const [cta, setCta] = useState(post.cta ?? '')
  // GF-16 — editable publication date (YYYY-MM-DD for the date input).
  const [date, setDate] = useState(initialDate)
  // GF-20 — editable target networks (multi-select).
  const initialChannels = effectiveChannels(post)
  const [channels, setChannels] = useState<Channel[]>(initialChannels)
  const [channelOpen, setChannelOpen] = useState(false)
  // GF-69 — editable post type (Single image / Carousel / Story).
  const initialFormat = post.format || (isCarousel(post) ? 'carousel' : 'single image')
  const [format, setFormat] = useState(initialFormat)
  const [saving, setSaving] = useState(false)

  const channelsChanged = channels.join(',') !== initialChannels.join(',')
  const formatChanged = format !== initialFormat
  const dirty =
    title !== (post.title ?? '') ||
    copy !== (post.copy ?? '') ||
    hashtags !== initialHashtags ||
    cta !== (post.cta ?? '') ||
    date !== initialDate ||
    channelsChanged ||
    formatChanged

  const save = async () => {
    if (locked) {
      toast(t('calendar.publishedReadOnly'))
      return
    }
    if (!dirty || saving) return
    const patch: Record<string, unknown> = {}
    if (title !== post.title) patch.title = title
    if (copy !== post.copy) patch.copy = copy
    if (hashtags !== initialHashtags) {
      patch.hashtags = hashtags.split(/\s+/).map((x) => x.trim()).filter(Boolean)
    }
    if (cta !== (post.cta ?? '')) patch.cta = cta
    if (formatChanged) patch.format = format
    if (channelsChanged && channels.length > 0) {
      patch.channels = channels
      patch.channel = channels[0]
    }
    // GF-16 — only send the date when it changed and is non-empty (422 otherwise).
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
    setFormat(initialFormat)
    setChannels(initialChannels)
    setChannelOpen(false)
  }

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

  const tags = hashtags.split(/\s+/).map((x) => x.trim()).filter(Boolean)

  return {
    t, locked, saving, dirty, save, reset,
    title, setTitle, copy, setCopy, hashtags, setHashtags, cta, setCta,
    date, setDate, channels, channelOpen, setChannelOpen, toggleChannel, tags,
    format, setFormat, initialFormat,
  }
}

type PaneState = ReturnType<typeof useCopyPaneState>

/**
 * GF-107 — the title, as an auto-growing textarea. The old single-line <input>
 * clipped long headlines and forced a horizontal drag to read them; a textarea
 * that resizes to its content shows the whole thing at once.
 */
function TitleField({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  const t = useT()
  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  if (!isApiEnabled) {
    return <h2 className={cn('font-bold text-ink leading-tight', className)}>{value}</h2>
  }
  return (
    <textarea
      ref={grow}
      value={value}
      rows={1}
      onChange={(e) => {
        onChange(e.target.value)
        grow(e.target)
      }}
      placeholder={t('calendar.postTitle')}
      className={cn(
        'w-full resize-none overflow-hidden font-bold text-ink leading-tight bg-transparent',
        'border-b border-transparent hover:border-border-subtle focus:border-brand-blue',
        'focus:outline-none transition-colors',
        className,
      )}
    />
  )
}

/** Hashtags as chips with a "+N more" cap, so a 100-tag post can't grow the card. */
function HashtagChips({ tags, max = 8 }: { tags: string[]; max?: number }) {
  const [all, setAll] = useState(false)
  const shown = all ? tags : tags.slice(0, max)
  const hidden = tags.length - shown.length
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="rounded-md border border-brand-blue-100 bg-brand-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-blue"
        >
          {tag}
        </span>
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="rounded-md border border-border-subtle bg-paper-muted px-1.5 py-0.5 text-[10px] font-semibold text-ink-muted hover:text-ink"
        >
          +{hidden}
        </button>
      )}
    </div>
  )
}

/**
 * GF-69 — editable post type (Single image / Carousel / Story). Metadata only:
 * it never creates, deletes or reorders slides or media. `format` stays
 * free-form on the wire, so a legacy value (e.g. "reel") is offered as its own
 * extra option rather than leaving the select with nothing selected.
 */
function PostTypeField({ s, compact = false }: { s: PaneState; compact?: boolean }) {
  const { t, format, setFormat, initialFormat } = s
  if (!isApiEnabled) {
    // A non-canonical format has no i18n key — show the raw stored value
    // rather than mislabeling it.
    const key = postFormatLabelKey(initialFormat)
    const label = key ? t(key) : initialFormat
    return compact ? (
      <Badge variant="outline" className="font-normal">{label}</Badge>
    ) : (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">
          {t('calendar.postTypeLabel')}
        </p>
        <span className="text-sm text-ink-muted">{label}</span>
      </div>
    )
  }
  const select = (
    <select
      value={format}
      onChange={(e) => setFormat(e.target.value)}
      aria-label={t('calendar.postTypeLabel')}
      className={cn(
        'bg-paper border border-border-subtle rounded-md focus:outline-none focus:ring-2 focus:ring-brand-blue/30',
        compact ? 'text-[11px] px-2 py-1' : 'text-sm px-3 py-2',
      )}
    >
      {!isCanonicalFormat(format) && format && <option value={format}>{format}</option>}
      {POST_FORMATS.map((f) => (
        <option key={f} value={f}>
          {t(POST_FORMAT_LABEL_KEY[f])}
        </option>
      ))}
    </select>
  )
  if (compact) return select
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">
        {t('calendar.postTypeLabel')}
      </p>
      {select}
    </div>
  )
}

/**
 * GF-16 — the publication date, edited in place where the date is already
 * displayed. Showing it twice (once as text, once as a form field lower down)
 * was pure duplication.
 */
function DateField({ s }: { s: PaneState }) {
  const { t, date, setDate, locked } = s
  if (!isApiEnabled || locked) {
    return <span className="text-[11px] font-semibold text-ink">{fmtDate(date)}</span>
  }
  return (
    <label className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 hover:bg-paper-muted cursor-pointer">
      <CalendarDays className="h-3.5 w-3.5 text-ink-muted" />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label={t('calendar.publishDate')}
        className="bg-transparent text-[11px] font-semibold text-ink focus:outline-none"
      />
    </label>
  )
}

/** The multi-select network picker, shared by all three layouts. */
function ChannelPicker({ s, post }: { s: PaneState; post: Post }) {
  const { t, channels, channelOpen, setChannelOpen, toggleChannel } = s
  if (!isApiEnabled) {
    return (
      <span className="flex items-center gap-1">
        {effectiveChannels(post).map((c) => (
          <ChannelIcon key={c} channel={c} className="h-4 w-4" />
        ))}
      </span>
    )
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setChannelOpen(!channelOpen)}
        className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2 py-1 text-[11px] hover:bg-paper-muted focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
        aria-haspopup="listbox"
        aria-expanded={channelOpen}
        aria-label={t('context.selectNetwork')}
      >
        {channels.map((c) => (
          <ChannelIcon key={c} channel={c} className="h-4 w-4" />
        ))}
        {channels.length === 1 && <span className="font-medium">{CHANNEL_LABEL[channels[0]]}</span>}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {channelOpen && (
        <>
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
  )
}

/** Save / discard / delete, identical across the layouts. */
function ActionBar({
  s,
  approving,
  onDelete,
  className,
}: {
  s: PaneState
  approving: boolean
  onDelete: () => void
  className?: string
}) {
  const { t, dirty, saving, save, reset } = s
  if (!isApiEnabled) return null
  return (
    <div className={cn('flex items-center gap-2 flex-wrap', className)}>
      {dirty && (
        <>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            {t('common.saveChanges')}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={saving}>
            {t('common.discard')}
          </Button>
        </>
      )}
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
  )
}

/** The published-post read-only notice. */
function LockedNotice({ s }: { s: PaneState }) {
  const { t, locked } = s
  if (!locked) return null
  return (
    <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-paper-muted px-3 py-2 text-[11px] text-ink-muted">
      <Send className="h-3.5 w-3.5 shrink-0" />
      <span>{t('calendar.publishedReadOnly')}</span>
    </div>
  )
}

function BlockerNote({ s, post }: { s: PaneState; post: Post }) {
  const { t } = s
  if (!post.approval.blockerReason) return null
  return (
    <p className="text-xs text-rose-700 bg-rose-50 px-3 py-2 rounded-md">
      {t('calendar.blocked', { reason: post.approval.blockerReason })}
    </p>
  )
}

/* ------------------------------------------------------------------ */
/* Variant A — one metadata strip, unlabelled content body            */
/* ------------------------------------------------------------------ */

function VariantA(props: CopyPaneProps & { s: PaneState }) {
  const { s, post, postName, pillarColor, approving, onSetStatus, onDelete } = props
  const { t, locked, copy, setCopy, title, setTitle, cta, setCta, hashtags, setHashtags, tags } = s

  return (
    <div className={cn('p-6 lg:p-8 space-y-4', locked && 'opacity-70')}>
      <LockedNotice s={s} />
      <fieldset disabled={locked} className="contents">
        {/* One strip: identity, schedule, taxonomy, status. */}
        <div className="flex items-center gap-2 flex-wrap text-[11px] text-ink-muted">
          <Badge variant="outline" className="text-[10px] font-bold">{postName}</Badge>
          <DateField s={s} />
          <span className="opacity-40">·</span>
          <PostTypeField s={s} compact />
          <Pillar name={post.pillar} color={pillarColor} />
          {post.campaign && (
            <Badge variant="outline" className="font-normal">
              <Tag className="h-3 w-3 mr-1" />
              {post.campaign}
            </Badge>
          )}
          <span className="opacity-40">·</span>
          <span>v{post.approval.version}</span>
          <div className="ml-auto flex items-center gap-2">
            <ChannelPicker s={s} post={post} />
            <StatusSelect post={post} busy={approving} onSetStatus={onSetStatus} tinted />
          </div>
        </div>

        <TitleField value={title} onChange={setTitle} className="text-2xl" />

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

        {isApiEnabled ? (
          <textarea
            value={hashtags}
            onChange={(e) => setHashtags(e.target.value)}
            rows={2}
            placeholder="#hashtag1 #hashtag2 …"
            className="w-full text-xs text-brand-blue font-medium bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
          />
        ) : (
          <HashtagChips tags={tags} />
        )}

        <div className="flex items-baseline gap-3 pt-2 border-t border-border-subtle">
          <span className="text-[10px] uppercase tracking-wider text-ink-muted shrink-0">{t('calendar.cta')}</span>
          {isApiEnabled ? (
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Call to action…"
              className="w-full text-sm font-semibold text-brand-blue bg-transparent border-b border-transparent hover:border-border-subtle focus:border-brand-blue focus:outline-none"
            />
          ) : (
            <span className="text-sm font-semibold text-brand-blue">{post.cta}</span>
          )}
        </div>

        <BlockerNote s={s} post={post} />
        <ActionBar s={s} approving={approving} onDelete={onDelete} className="pt-2 border-t border-border-subtle" />
      </fieldset>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Variant B — two zones, metadata + status in a bottom action bar     */
/* ------------------------------------------------------------------ */

function VariantB(props: CopyPaneProps & { s: PaneState }) {
  const { s, post, postName, pillarColor, approving, onSetStatus, onDelete } = props
  const { t, locked, copy, setCopy, title, setTitle, cta, setCta, hashtags, setHashtags, tags } = s

  return (
    <div className={cn('p-6 lg:p-8 space-y-4', locked && 'opacity-70')}>
      <LockedNotice s={s} />
      <fieldset disabled={locked} className="contents">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] font-bold">{postName}</Badge>
          {/* GF-107 — the date is editable right here, where it is already
              shown; the duplicate date field in the bottom bar is gone. */}
          <DateField s={s} />
          <span className="text-[11px] text-ink-muted">v{post.approval.version}</span>
          <div className="ml-auto">
            <ChannelPicker s={s} post={post} />
          </div>
        </div>

        <TitleField value={title} onChange={setTitle} className="text-xl" />

        <div className="flex items-center gap-2 flex-wrap">
          <PostTypeField s={s} compact />
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
              rows={9}
              placeholder={t('calendar.writeCopy')}
              className="w-full text-sm leading-relaxed bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
            />
          ) : (
            <p className="text-sm whitespace-pre-line leading-relaxed text-ink-muted">{post.copy}</p>
          )}
        </div>

        {/* CTA promoted above hashtags — it is the line that carries the ask. */}
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">{t('calendar.cta')}</p>
          {isApiEnabled ? (
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Call to action…"
              className="w-full text-sm font-semibold text-brand-blue bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          ) : (
            post.cta && <p className="text-sm font-semibold text-brand-blue">{post.cta}</p>
          )}
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1.5">
            {t('calendar.hashtags')}
            {tags.length > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-blue-100 px-1.5 text-[10px] font-bold text-brand-blue">
                {tags.length}
              </span>
            )}
          </p>
          {isApiEnabled ? (
            <textarea
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              rows={2}
              placeholder="#hashtag1 #hashtag2 …"
              className="w-full text-xs text-brand-blue font-medium bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
            />
          ) : (
            <HashtagChips tags={tags} />
          )}
        </div>

        <BlockerNote s={s} post={post} />

        {/* Bottom bar: the coloured status stays exactly where it already was. */}
        <div className="flex items-center gap-3 flex-wrap pt-3 border-t border-border-subtle">
          <StatusSelect post={post} busy={approving} onSetStatus={onSetStatus} tinted />
          <ActionBar s={s} approving={approving} onDelete={onDelete} className="ml-auto" />
        </div>
      </fieldset>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Variant C — progressive disclosure                                  */
/* ------------------------------------------------------------------ */

function VariantC(props: CopyPaneProps & { s: PaneState }) {
  const { s, post, postName, pillarColor, approving, onSetStatus, onDelete } = props
  const { t, locked, copy, setCopy, title, setTitle, cta, setCta, hashtags, setHashtags, tags } = s
  const [tagsOpen, setTagsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  return (
    <div className={cn('p-6 lg:p-8 space-y-4', locked && 'opacity-70')}>
      <LockedNotice s={s} />
      <fieldset disabled={locked} className="contents">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusSelect post={post} busy={approving} onSetStatus={onSetStatus} tinted />
          <span className="ml-auto flex items-center gap-2 text-[11px] text-ink-muted">
            {postName}
            <span className="opacity-40">·</span>
            <DateField s={s} />
            <ChannelPicker s={s} post={post} />
          </span>
        </div>

        <TitleField value={title} onChange={setTitle} className="text-2xl" />

        {isApiEnabled ? (
          <textarea
            value={copy}
            onChange={(e) => setCopy(e.target.value)}
            rows={11}
            placeholder={t('calendar.writeCopy')}
            className="w-full text-sm leading-relaxed bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
          />
        ) : (
          <p className="text-sm whitespace-pre-line leading-relaxed text-ink-muted">{post.copy}</p>
        )}

        <div className="pt-2 border-t border-border-subtle">
          {isApiEnabled ? (
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Call to action…"
              className="w-full text-sm font-bold text-brand-blue bg-transparent border-b border-transparent hover:border-border-subtle focus:border-brand-blue focus:outline-none"
            />
          ) : (
            post.cta && <p className="text-sm font-bold text-brand-blue">{post.cta}</p>
          )}
        </div>

        {/* Hashtags — one chip until you want them. */}
        <div className="pt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setTagsOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-blue"
          >
            {tagsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {t('calendar.hashtags')}
            {tags.length > 0 && (
              <span className="rounded-full bg-brand-blue-100 px-1.5 text-[10px] font-bold">{tags.length}</span>
            )}
          </button>
          {tagsOpen && (
            <div className="mt-2">
              {isApiEnabled ? (
                <textarea
                  value={hashtags}
                  onChange={(e) => setHashtags(e.target.value)}
                  rows={3}
                  placeholder="#hashtag1 #hashtag2 …"
                  className="w-full text-xs text-brand-blue font-medium bg-paper border border-border-subtle rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
                />
              ) : (
                <HashtagChips tags={tags} max={99} />
              )}
            </div>
          )}
        </div>

        {/* Details — pillar, campaign, date, version. */}
        <div className="pt-2 border-t border-border-subtle">
          <button
            type="button"
            onClick={() => setDetailsOpen((o) => !o)}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-blue"
          >
            {detailsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {t('calendar.cardDetails')}
          </button>
          {detailsOpen && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <PostTypeField s={s} compact />
              <Pillar name={post.pillar} color={pillarColor} />
              {post.campaign && (
                <Badge variant="outline" className="font-normal">
                  <Tag className="h-3 w-3 mr-1" />
                  {post.campaign}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">v{post.approval.version}</Badge>
            </div>
          )}
        </div>

        <BlockerNote s={s} post={post} />
        <ActionBar s={s} approving={approving} onDelete={onDelete} className="pt-2 border-t border-border-subtle" />
      </fieldset>
    </div>
  )
}

/** Month-view copy pane. `variant` selects the layout; behaviour is identical. */
export function CopyPane(props: CopyPaneProps) {
  const s = useCopyPaneState(props)
  const variant = props.variant ?? 'a'
  if (variant === 'b') return <VariantB {...props} s={s} />
  if (variant === 'c') return <VariantC {...props} s={s} />
  return <VariantA {...props} s={s} />
}

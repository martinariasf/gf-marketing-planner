// GF-106 — the "what should change?" bottom sheet, shared by BOTH share links.
//
// It used to live inside routes/review/external.tsx. The strategy link
// (routes/review/strategy-view.tsx) now needs the exact same sheet, and
// external.tsx already imports strategy-view.tsx — importing it back would be a
// cycle. So the sheet lives here, as a leaf both shells import.
//
// Behaviour change (GF-106, Martin 2026-08-20): a change request now REQUIRES a
// reason. The send button stays disabled until at least one chip is selected or
// something is typed, and `onSubmit` therefore always receives a non-empty
// string — the "request changes without comment" escape hatch is gone. This is
// intentionally shared with the content link.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, PenLine, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type T = (k: string, vars?: Record<string, string | number>) => string

const REASON_KEYS = ['review.ext.reasonWording', 'review.ext.reasonImage', 'review.ext.reasonTiming']

export function RejectSheet({
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
  /** Always called with a non-empty reason — the sheet cannot submit an empty one. */
  onSubmit: (comment: string) => void
}) {
  // The form lives in a child that only exists while the sheet is open, so its
  // draft resets on close by unmounting — no reset-on-`open` effect needed.
  return (
    <AnimatePresence>
      {open && <RejectSheetForm t={t} busy={busy} onCancel={onCancel} onSubmit={onSubmit} />}
    </AnimatePresence>
  )
}

function RejectSheetForm({
  t,
  busy,
  onCancel,
  onSubmit,
}: {
  t: T
  busy: boolean
  onCancel: () => void
  onSubmit: (comment: string) => void
}) {
  const [text, setText] = useState('')
  const [reasons, setReasons] = useState<string[]>([])

  // A selected chip counts as a reason on its own; an empty sheet does not.
  const parts = [...reasons, text.trim()].filter(Boolean)
  const canSubmit = parts.length > 0

  const submit = () => {
    if (!canSubmit) return
    onSubmit(parts.join(' — '))
  }

  return (
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
          {REASON_KEYS.map((k) => {
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
          <Button onClick={submit} disabled={busy || !canSubmit} className="bg-amber-600 hover:bg-amber-700">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {t('review.ext.sheetSend')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        </div>
        {!canSubmit && <p className="text-[11px] text-amber-700">{t('review.ext.sheetRequired')}</p>}
  </motion.div>
    </>
  )
}

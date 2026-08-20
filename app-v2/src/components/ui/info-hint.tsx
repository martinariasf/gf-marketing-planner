// GF-92 (C) — small reusable info-icon tooltip/popover.
//
// There is no reusable tooltip primitive in this repo yet (only native
// `title=` attributes and recharts' chart-only Tooltip), so this is a minimal
// from-scratch implementation: plain React state, no new npm dependency.
// Opens on click or hover, closes on Escape / outside interaction, and is
// keyboard-focusable (Enter/Space toggles it, like a native disclosure).

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InfoHint({
  children,
  'aria-label': ariaLabel,
  className,
}: {
  children: ReactNode
  'aria-label': string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <span
      ref={rootRef}
      className={cn('relative inline-flex items-center', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setOpen((v) => !v)
          }
        }}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-muted hover:text-brand-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 cursor-help"
      >
        <Info className="h-3.5 w-3.5" />
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-64 -translate-x-1/2 rounded-md border border-border-subtle bg-paper px-3 py-2 text-xs leading-relaxed text-ink shadow-lg"
        >
          {children}
        </span>
      )}
    </span>
  )
}

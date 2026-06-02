import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useEdit } from '@/lib/edit-store'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  rows?: number
}

/**
 * Multi-line click-to-edit text.
 *
 * In edit mode the field is rendered as a persistent amber-boxed textarea with
 * a fixed row count. Showing the same box whether or not it is focused means
 * the field keeps its size while you type — no jump that throws off the cursor.
 * Ctrl/Cmd+Enter commits + blurs; blur commits; Escape reverts.
 */
export function EditableTextarea({
  value,
  onChange,
  placeholder,
  className,
  rows = 4,
}: Props) {
  const { editMode } = useEdit()
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  if (!editMode) {
    return (
      <p className={cn('whitespace-pre-wrap', className)}>
        {value || placeholder || ''}
      </p>
    )
  }

  const commit = () => {
    if (draft !== value) onChange(draft)
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault()
          commit()
          ref.current?.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(value)
          ref.current?.blur()
        }
      }}
      className={cn(
        'w-full rounded border border-amber-300 bg-amber-50/60 px-2 py-1.5 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 whitespace-pre-wrap leading-relaxed resize-y',
        className,
      )}
    />
  )
}

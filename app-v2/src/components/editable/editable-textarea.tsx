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
 * Multi-line click-to-edit text. Enter inserts newline; Ctrl/Cmd+Enter commits;
 * blur commits; Escape reverts.
 */
export function EditableTextarea({
  value,
  onChange,
  placeholder,
  className,
  rows = 4,
}: Props) {
  const { editMode } = useEdit()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      // place caret at end
      const len = ref.current.value.length
      ref.current.setSelectionRange(len, len)
    }
  }, [editing])

  if (!editMode) {
    return (
      <p className={cn('whitespace-pre-wrap', className)}>
        {value || placeholder || ''}
      </p>
    )
  }

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={draft}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            if (draft !== value) onChange(draft)
            setEditing(false)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDraft(value)
            setEditing(false)
          }
        }}
        className={cn(
          'w-full rounded border border-amber-300 bg-amber-50/40 px-2 py-1.5 text-sm outline-none ring-2 ring-amber-200/60 focus:border-amber-400 whitespace-pre-wrap leading-relaxed',
          className,
        )}
      />
    )
  }

  return (
    <p
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setEditing(true)
        }
      }}
      title="Click to edit (Ctrl/Cmd+Enter to save)"
      className={cn(
        'cursor-text rounded px-1 -mx-1 hover:bg-amber-50 hover:ring-1 hover:ring-amber-200 transition-colors whitespace-pre-wrap',
        !value && 'text-ink-muted italic',
        className,
      )}
    >
      {value || placeholder || 'Click to edit'}
    </p>
  )
}

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useEdit } from '@/lib/edit-store'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  /** Visual size hint for the input field. */
  size?: 'sm' | 'md' | 'lg'
  /** Optional override for the wrapping element when not editing. */
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3'
}

/**
 * Single-line click-to-edit text.
 *
 * - When edit mode is OFF: renders as plain text (no affordance, no overhead).
 * - When edit mode is ON: hover shows an amber tint; click swaps to an input.
 *   Enter commits, Escape reverts, blur commits.
 */
export function EditableText({
  value,
  onChange,
  placeholder,
  className,
  size = 'md',
  as = 'span',
}: Props) {
  const { editMode } = useEdit()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Keep local draft in sync with external value (e.g. discard, route change).
  useEffect(() => {
    setDraft(value)
  }, [value])

  // Focus + select-all when entering edit mode.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  if (!editMode) {
    const Tag = as as 'span'
    return <Tag className={className}>{value || placeholder || ''}</Tag>
  }

  if (editing) {
    const inputSize =
      size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-sm'
    return (
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onChange(draft)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
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
          'rounded border border-amber-300 bg-amber-50/40 px-1.5 py-0.5 outline-none ring-2 ring-amber-200/60 focus:border-amber-400',
          inputSize,
          className,
        )}
      />
    )
  }

  const Tag = as as 'span'
  return (
    <Tag
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setEditing(true)
        }
      }}
      title="Click to edit"
      className={cn(
        'cursor-text rounded px-0.5 -mx-0.5 hover:bg-amber-50 hover:ring-1 hover:ring-amber-200 transition-colors',
        !value && 'text-ink-muted italic',
        className,
      )}
    >
      {value || placeholder || 'Click to edit'}
    </Tag>
  )
}

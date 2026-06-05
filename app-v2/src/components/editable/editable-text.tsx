import { useEffect, useState } from 'react'
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
 * - When edit mode is ON: the field is rendered as a persistent amber-boxed
 *   input so it is always obvious what can be edited. Because the box is shown
 *   in both the idle and focused state, focusing it never changes the field's
 *   size — the layout stays put while you type. Enter commits + blurs,
 *   Escape reverts, blur commits.
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
  const [draft, setDraft] = useState(value)

  // Keep local draft in sync with external value (e.g. discard, route change).
  useEffect(() => {
    setDraft(value)
  }, [value])

  if (!editMode) {
    const Tag = as as 'span'
    return <Tag className={className}>{value || placeholder || ''}</Tag>
  }

  const inputSize =
    size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-xs' : 'text-sm'

  const commit = () => {
    if (draft !== value) onChange(draft)
  }

  return (
    <input
      value={draft}
      placeholder={placeholder}
      // Size the box to its content so inline fields don't stretch full-width.
      // Layout classes in `className` (w-24, flex-1, …) still win when present.
      size={Math.max((draft || placeholder || '').length, 1)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          ;(e.target as HTMLInputElement).blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(value)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      className={cn(
        'max-w-full rounded border border-amber-300 bg-amber-50/60 px-1.5 py-0.5 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60',
        inputSize,
        className,
      )}
    />
  )
}

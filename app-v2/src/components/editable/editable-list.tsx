import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useEdit } from '@/lib/edit-store'

interface Props {
  items: string[]
  onChange: (items: string[]) => void
  /** Color of the bullet/leading mark. */
  bulletClassName?: string
  bullet?: string
  /** Read-mode rendering of the bullet as a node (e.g. an icon). Falls back to `bullet` string. */
  renderBullet?: () => React.ReactNode
  placeholder?: string
}

/**
 * Edit-mode-aware bullet list (e.g. "Do" / "Don't" cards on Company Context).
 *
 * Read mode: a plain UL with the bullet and item text.
 * Edit mode: each line gains a remove button + click-to-edit on the text;
 *            an "Add item" row appears at the end.
 */
export function EditableList({
  items,
  onChange,
  bulletClassName,
  bullet = '·',
  renderBullet,
  placeholder = 'Add item',
}: Props) {
  const { editMode } = useEdit()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingDraft, setEditingDraft] = useState('')

  const commitNew = () => {
    const v = draft.trim()
    if (v) onChange([...items, v])
    setDraft('')
    setAdding(false)
  }

  const commitEdit = (idx: number) => {
    const v = editingDraft.trim()
    if (!v) {
      onChange(items.filter((_, i) => i !== idx))
    } else if (v !== items[idx]) {
      const next = items.slice()
      next[idx] = v
      onChange(next)
    }
    setEditingIdx(null)
    setEditingDraft('')
  }

  return (
    <ul className="text-sm space-y-1">
      {items.map((x, i) => {
        const isEditing = editMode && editingIdx === i
        return (
          <li key={`${x}-${i}`} className="flex gap-2 group items-start">
            <span className={cn('shrink-0', bulletClassName)}>
              {renderBullet ? renderBullet() : bullet}
            </span>

            {isEditing ? (
              <input
                autoFocus
                value={editingDraft}
                onChange={(e) => setEditingDraft(e.target.value)}
                onBlur={() => commitEdit(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitEdit(i)
                  } else if (e.key === 'Escape') {
                    setEditingIdx(null)
                    setEditingDraft('')
                  }
                }}
                className="flex-1 rounded border border-amber-300 bg-amber-50/40 px-1.5 py-0.5 text-sm outline-none ring-2 ring-amber-200/60"
              />
            ) : (
              <span
                className={cn(
                  'flex-1',
                  editMode &&
                    'cursor-text rounded px-0.5 -mx-0.5 hover:bg-amber-50 hover:ring-1 hover:ring-amber-200',
                )}
                onClick={() => {
                  if (editMode) {
                    setEditingIdx(i)
                    setEditingDraft(x)
                  }
                }}
              >
                {x}
              </span>
            )}

            {editMode && !isEditing && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${x}`}
                className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded hover:bg-rose-50"
              >
                <X className="h-3.5 w-3.5 text-rose-600" />
              </button>
            )}
          </li>
        )
      })}

      {editMode && (
        <li>
          {adding ? (
            <div className="flex items-center gap-2">
              <span className={cn('shrink-0', bulletClassName)}>
                {renderBullet ? renderBullet() : bullet}
              </span>
              <input
                autoFocus
                value={draft}
                placeholder={placeholder}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitNew}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitNew()
                  } else if (e.key === 'Escape') {
                    setDraft('')
                    setAdding(false)
                  }
                }}
                className="flex-1 rounded border border-amber-300 bg-amber-50/40 px-1.5 py-0.5 text-sm outline-none ring-2 ring-amber-200/60"
              />
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAdding(true)}
              className="h-7 px-2 -ml-2 text-xs text-amber-700 hover:bg-amber-50"
            >
              <Plus className="h-3 w-3 mr-1" /> Add item
            </Button>
          )}
        </li>
      )}
    </ul>
  )
}

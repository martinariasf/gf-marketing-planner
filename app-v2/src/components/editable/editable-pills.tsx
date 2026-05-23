import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useEdit } from '@/lib/edit-store'

type Tone = 'default' | 'green' | 'blue' | 'red'

const TONE_MAP: Record<Tone, string> = {
  default: 'bg-paper-muted text-ink',
  green: 'bg-brand-green-100 text-brand-green-600',
  blue: 'bg-brand-blue-50 text-brand-blue',
  red: 'bg-rose-50 text-rose-700',
}

interface Props {
  items: string[]
  onChange: (items: string[]) => void
  tone?: Tone
  placeholder?: string
}

/**
 * Edit-mode-aware pill list.
 *
 * Read mode: identical to the existing <Pills/> component.
 * Edit mode:
 *   - Each pill grows a small × button to remove it.
 *   - A "+ Add" affordance appears that opens a small inline input.
 */
export function EditablePills({
  items,
  onChange,
  tone = 'default',
  placeholder = 'Add item',
}: Props) {
  const { editMode } = useEdit()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const v = draft.trim()
    if (v && !items.includes(v)) onChange([...items, v])
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((x, i) => (
        <Badge
          key={`${x}-${i}`}
          variant="secondary"
          className={cn(
            TONE_MAP[tone],
            'group',
            editMode && 'pr-1.5',
          )}
        >
          {x}
          {editMode && (
            <button
              type="button"
              onClick={() =>
                onChange(items.filter((_, idx) => idx !== i))
              }
              aria-label={`Remove ${x}`}
              className="ml-1 -mr-0.5 rounded-sm p-0.5 opacity-60 hover:opacity-100 hover:bg-black/10"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      ))}

      {editMode && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-amber-300 px-2 py-0.5 text-[11px] text-amber-700 hover:bg-amber-50"
        >
          <Plus className="h-3 w-3" /> Add
        </button>
      )}

      {editMode && adding && (
        <input
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            } else if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          className="h-6 rounded-full border border-amber-300 bg-amber-50/40 px-2 text-xs outline-none ring-2 ring-amber-200/60"
        />
      )}
    </div>
  )
}

/**
 * Edit store — local-overlay patches for user-owned JSON files.
 *
 * Why this exists:
 *   The dashboard is "read-only" relative to Viktor's writes (posts, suggestions,
 *   performance, approvals.log). But the *setup* files — brief.json, plan.json,
 *   goals.json, learnings.json — are USER-OWNED. We let the human edit them
 *   directly in the dashboard, persist the changes to localStorage as deep-
 *   partial patches, and surface a "Download JSON" affordance so the user can
 *   commit the file back to the repo (CI then rsyncs to Hetzner).
 *
 *   No backend. No silent writes. Still filesystem-first.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'

/** Files that the user (not Viktor) owns. */
export type EditableFile = 'brief' | 'plan' | 'goals' | 'learnings'

export const EDITABLE_FILES: EditableFile[] = [
  'brief',
  'plan',
  'goals',
  'learnings',
]

const STORAGE_KEY = 'gf-mp:edits:v1'

type Path = (string | number)[]

/** Sparse mirror of a JSON file: only touched branches are present. */
type FilePatch = unknown
type SlugPatches = Partial<Record<EditableFile, FilePatch>>
type AllPatches = Record<string /* slug */, SlugPatches>

interface State {
  editMode: boolean
  patches: AllPatches
}

type Action =
  | { type: 'set-edit-mode'; value: boolean }
  | {
      type: 'set-field'
      slug: string
      file: EditableFile
      path: Path
      value: unknown
    }
  | { type: 'reset-file'; slug: string; file: EditableFile }
  | { type: 'reset-slug'; slug: string }
  | { type: 'hydrate'; patches: AllPatches }

// ─── pure helpers ────────────────────────────────────────────────────────────

/** Immutable set-at-path. Creates objects or arrays as needed. */
function setAtPath(obj: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  const useArray = typeof head === 'number'
  if (useArray) {
    const arr = Array.isArray(obj) ? [...obj] : []
    arr[head as number] = setAtPath(arr[head as number], rest, value)
    return arr
  }
  const next: Record<string, unknown> = {
    ...(obj && typeof obj === 'object' && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : {}),
  }
  next[head as string] = setAtPath(next[head as string], rest, value)
  return next
}

/**
 * Deep-merge a sparse patch onto a base value.
 * - Primitives + null in the patch REPLACE the base.
 * - Arrays REPLACE wholesale (we treat user-edited arrays as full replacements).
 * - Objects merge recursively, key by key.
 * - `undefined` in the patch is a no-op (keeps base).
 *
 * Unknown keys in the base are preserved — important for the "preserve unknown
 * fields" contract in AGENT.md.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base
  if (
    patch === null ||
    typeof patch !== 'object' ||
    Array.isArray(patch)
  ) {
    return patch as T
  }
  if (base === null || typeof base !== 'object' || Array.isArray(base)) {
    // Base isn't a plain object — patch's object shape wins.
    return patch as T
  }
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const key of Object.keys(patch as Record<string, unknown>)) {
    const baseVal = (base as Record<string, unknown>)[key]
    const patchVal = (patch as Record<string, unknown>)[key]
    out[key] = deepMerge(baseVal, patchVal)
  }
  return out as T
}

// ─── reducer ─────────────────────────────────────────────────────────────────

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set-edit-mode':
      return { ...state, editMode: action.value }

    case 'set-field': {
      const slugPatches = state.patches[action.slug] ?? {}
      const filePatch = slugPatches[action.file]
      const nextFile = setAtPath(filePatch, action.path, action.value)
      return {
        ...state,
        patches: {
          ...state.patches,
          [action.slug]: { ...slugPatches, [action.file]: nextFile },
        },
      }
    }

    case 'reset-file': {
      const slugPatches = { ...(state.patches[action.slug] ?? {}) }
      delete slugPatches[action.file]
      const nextAll = { ...state.patches }
      if (Object.keys(slugPatches).length === 0) {
        delete nextAll[action.slug]
      } else {
        nextAll[action.slug] = slugPatches
      }
      return { ...state, patches: nextAll }
    }

    case 'reset-slug': {
      const nextAll = { ...state.patches }
      delete nextAll[action.slug]
      return { ...state, patches: nextAll }
    }

    case 'hydrate':
      return { ...state, patches: action.patches }
  }
}

// ─── context ─────────────────────────────────────────────────────────────────

export interface EditContextValue {
  editMode: boolean
  setEditMode: (value: boolean) => void
  patches: AllPatches
  /** Set a deep field of a slug's file. */
  setField: (
    slug: string,
    file: EditableFile,
    path: Path,
    value: unknown,
  ) => void
  /** Drop all edits for one file under a slug. */
  resetFile: (slug: string, file: EditableFile) => void
  /** Drop all edits for a slug. */
  resetSlug: (slug: string) => void
  /** Files modified for a given slug. */
  dirtyFiles: (slug: string) => EditableFile[]
}

const EditContext = createContext<EditContextValue | null>(null)

export function EditProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    editMode: false,
    patches: {},
  })

  // Hydrate from localStorage on first mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as AllPatches
        if (parsed && typeof parsed === 'object') {
          dispatch({ type: 'hydrate', patches: parsed })
        }
      }
    } catch {
      /* corrupt storage — ignore, start clean */
    }
  }, [])

  // Persist on every patches change.
  useEffect(() => {
    try {
      if (Object.keys(state.patches).length === 0) {
        localStorage.removeItem(STORAGE_KEY)
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state.patches))
      }
    } catch {
      /* private mode / quota — silently degrade */
    }
  }, [state.patches])

  const value = useMemo<EditContextValue>(
    () => ({
      editMode: state.editMode,
      setEditMode: (v) => dispatch({ type: 'set-edit-mode', value: v }),
      patches: state.patches,
      setField: (slug, file, path, val) =>
        dispatch({ type: 'set-field', slug, file, path, value: val }),
      resetFile: (slug, file) =>
        dispatch({ type: 'reset-file', slug, file }),
      resetSlug: (slug) => dispatch({ type: 'reset-slug', slug }),
      dirtyFiles: (slug) =>
        Object.keys(state.patches[slug] ?? {}) as EditableFile[],
    }),
    [state.editMode, state.patches],
  )

  return <EditContext.Provider value={value}>{children}</EditContext.Provider>
}

export function useEdit(): EditContextValue {
  const ctx = useContext(EditContext)
  if (!ctx) {
    throw new Error('useEdit must be used inside <EditProvider>')
  }
  return ctx
}

/**
 * Convenience hook for a single field bound to one file.
 *
 * Pass the *current* (already-merged) value as `currentValue` so the input
 * stays controlled even when the patch hasn't been applied yet.
 */
export function useEditField<T>(
  slug: string,
  file: EditableFile,
  path: Path,
  currentValue: T,
): [T, (value: T) => void] {
  const { setField } = useEdit()
  return [currentValue, (v) => setField(slug, file, path, v)]
}

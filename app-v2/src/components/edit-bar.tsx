import { useMemo, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Save,
  Trash2,
  ChevronDown,
  Pencil,
  Eye,
  Check,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useEdit, deepMerge, type EditableFile } from '@/lib/edit-store'
import type { ClientBundle } from '@/lib/client-data'
import { isPocketBaseEnabled, pbSave } from '@/lib/pocketbase'
import { isApiEnabled, apiSave } from '@/lib/api-client'

/**
 * Floating bar that appears whenever the current slug has unsaved patches.
 *
 * Dual-mode:
 *   - **PocketBase enabled**: "Save" button persists merged data to PocketBase,
 *     then clears local patches. Instant, no manual step.
 *   - **File mode**: "Download" button exports merged JSON for manual commit.
 *
 * `bundle` is the ORIGINAL (server-loaded) data — we re-merge here so the
 * saved/downloaded file always reflects the latest patches.
 */
export function EditBar({
  slug,
  bundle,
  onSaved,
}: {
  slug: string
  /** Original (un-merged) bundle. */
  bundle: ClientBundle
  /** Called after a successful PocketBase save — layout can refetch. */
  onSaved?: () => void
}) {
  const { patches, resetFile, resetSlug, editMode, setEditMode } = useEdit()
  const slugPatches = patches[slug] ?? {}
  const dirtyFiles = useMemo(
    () => Object.keys(slugPatches) as EditableFile[],
    [slugPatches],
  )
  const [discardOpen, setDiscardOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Map file key → original value from the loaded bundle.
  const originalFor = (file: EditableFile): unknown => {
    switch (file) {
      case 'brief':
        return bundle.brief
      case 'plan':
        return bundle.plan
      case 'goals':
        return bundle.goals
      case 'learnings':
        return bundle.learnings ?? {}
    }
  }

  const mergedFor = (file: EditableFile) =>
    deepMerge(originalFor(file), slugPatches[file])

  // ── Download (file mode) ─────────────────────────────────────────────────

  const downloadOne = (file: EditableFile) => {
    const merged = mergedFor(file)
    const blob = new Blob([JSON.stringify(merged, null, 2) + '\n'], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${file}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadAll = () => dirtyFiles.forEach(downloadOne)

  // ── Save (PocketBase mode) ───────────────────────────────────────────────

  const saveOne = useCallback(
    async (file: EditableFile) => {
      const merged = mergedFor(file)
      if (isApiEnabled) {
        await apiSave(slug, file, merged)
      } else {
        await pbSave(slug, file, merged)
      }
      resetFile(slug, file)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slug, slugPatches],
  )

  const saveAll = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await Promise.all(dirtyFiles.map(saveOne))
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
      onSaved?.()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [dirtyFiles, saveOne, onSaved])

  const handleSaveOne = useCallback(
    async (file: EditableFile) => {
      setSaving(true)
      setSaveError(null)
      try {
        await saveOne(file)
        onSaved?.()
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Save failed')
      } finally {
        setSaving(false)
      }
    },
    [saveOne, onSaved],
  )

  const showEditToggle = editMode || dirtyFiles.length > 0

  // Choose action labels + icons based on mode.
  const usePB = isPocketBaseEnabled || isApiEnabled
  const ActionIcon = usePB ? Save : Download
  const actionLabel = usePB ? 'Save' : 'Download'
  const bulkLabel = usePB
    ? dirtyFiles.length === 1
      ? 'Save'
      : 'Save all'
    : dirtyFiles.length === 1
      ? 'Download file'
      : 'Download all'
  const subtitle = usePB
    ? 'Save to publish changes instantly.'
    : `Download & commit to clients/${slug}/ to publish.`

  return (
    <>
      {/* Floating edit-mode pill — always visible so user can enter edit mode */}
      <AnimatePresence>
        {showEditToggle && dirtyFiles.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            /* Header already has its own Edit/Preview button on sm+. Show this
               floating pill only on small viewports where the header button is hidden. */
            className="fixed bottom-4 right-4 z-40 sm:hidden"
          >
            <Button
              variant={editMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEditMode(!editMode)}
              className={
                editMode
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg'
                  : 'bg-paper shadow-md'
              }
            >
              {editMode ? (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1.5" /> Preview
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                </>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dirtyFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(720px,calc(100vw-2rem))]"
          >
            <div className="rounded-xl border border-amber-200 bg-paper shadow-xl overflow-hidden">
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-50/60 border-b border-amber-100">
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {dirtyFiles.length} file
                    {dirtyFiles.length === 1 ? '' : 's'} modified
                    {usePB ? '' : ' locally'}
                  </p>
                  <p className="text-[11px] text-ink-muted">{subtitle}</p>
                </div>
                <Button
                  variant={editMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEditMode(!editMode)}
                  className={
                    editMode
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : ''
                  }
                  title={editMode ? 'Exit edit mode' : 'Enter edit mode'}
                >
                  {editMode ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <Pencil className="h-3.5 w-3.5" />
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setExpanded((x) => !x)}
                  className="p-1 rounded hover:bg-amber-100"
                  aria-label={expanded ? 'Collapse' : 'Expand'}
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${
                      expanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>
              </div>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-3 space-y-1.5">
                      {dirtyFiles.map((f) => (
                        <div
                          key={f}
                          className="flex items-center gap-2 rounded-md hover:bg-paper-muted px-2 py-1"
                        >
                          <code className="text-xs font-mono text-brand-blue flex-1">
                            {f}.json
                          </code>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => resetFile(slug, f)}
                            className="h-7 px-2 text-xs text-ink-muted hover:text-rose-600"
                            disabled={saving}
                          >
                            Discard
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              usePB ? handleSaveOne(f) : downloadOne(f)
                            }
                            className="h-7 px-2 text-xs"
                            disabled={saving}
                          >
                            <ActionIcon className="h-3 w-3 mr-1" />
                            {actionLabel}
                          </Button>
                        </div>
                      ))}
                    </div>

                    {saveError && (
                      <div className="px-3 pb-2">
                        <p className="text-xs text-rose-600 bg-rose-50 rounded-md px-2.5 py-1.5">
                          {saveError}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center gap-2 px-3 pb-3 pt-1 border-t border-border-subtle">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDiscardOpen(true)}
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                        disabled={saving}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Discard all
                      </Button>
                      <span className="flex-1" />
                      {saveSuccess && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="text-xs text-brand-green-600 flex items-center gap-1"
                        >
                          <Check className="h-3.5 w-3.5" /> Saved
                        </motion.span>
                      )}
                      <Button
                        size="sm"
                        onClick={usePB ? saveAll : downloadAll}
                        disabled={saving}
                        className="bg-brand-blue hover:bg-brand-blue-700 text-white"
                      >
                        {saving ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <ActionIcon className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        {bulkLabel}
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard all changes?</DialogTitle>
            <DialogDescription>
              This drops every local edit for <code>{slug}</code> (
              {dirtyFiles.join(', ')}). It cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                resetSlug(slug)
                setDiscardOpen(false)
              }}
            >
              Discard all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

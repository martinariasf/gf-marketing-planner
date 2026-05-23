import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Trash2, ChevronDown, Pencil, Eye } from 'lucide-react'
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

/**
 * Floating bar that appears whenever the current slug has unsaved patches.
 *
 * Per file, the user can:
 *   - Download — saves a fully-merged JSON file ready to commit to the repo
 *   - Discard  — drops local edits for that file
 *
 * Plus a "Download all" shortcut.
 *
 * `bundle` is the ORIGINAL (server-loaded) data — we re-merge here so the
 * downloaded file always reflects the latest patches.
 */
export function EditBar({
  slug,
  bundle,
}: {
  slug: string
  /** Original (un-merged) bundle. */
  bundle: ClientBundle
}) {
  const { patches, resetFile, resetSlug, editMode, setEditMode } = useEdit()
  const slugPatches = patches[slug] ?? {}
  const dirtyFiles = useMemo(
    () => Object.keys(slugPatches) as EditableFile[],
    [slugPatches],
  )
  const [discardOpen, setDiscardOpen] = useState(false)
  const [expanded, setExpanded] = useState(true)

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

  const downloadOne = (file: EditableFile) => {
    const merged = deepMerge(originalFor(file), slugPatches[file])
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

  const showEditToggle = editMode || dirtyFiles.length > 0

  return (
    <>
      {/* Floating edit-mode pill — always visible so user can enter edit mode */}
      <AnimatePresence>
        {showEditToggle && dirtyFiles.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 right-4 z-40"
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
                    {dirtyFiles.length === 1 ? '' : 's'} modified locally
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    Download &amp; commit to <code>clients/{slug}/</code> to publish.
                  </p>
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
                          >
                            Discard
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadOne(f)}
                            className="h-7 px-2 text-xs"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2 px-3 pb-3 pt-1 border-t border-border-subtle">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDiscardOpen(true)}
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        Discard all
                      </Button>
                      <span className="flex-1" />
                      <Button
                        size="sm"
                        onClick={downloadAll}
                        className="bg-brand-blue hover:bg-brand-blue-700 text-white"
                      >
                        <Download className="h-3.5 w-3.5 mr-1.5" />
                        Download {dirtyFiles.length === 1 ? 'file' : 'all'}
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

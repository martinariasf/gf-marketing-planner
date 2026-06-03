import { useState, useEffect, useRef, useCallback } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Lightbulb, Upload, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isApiEnabled,
  apiListInspiration,
  apiUploadInspiration,
  apiDeleteInspiration,
  type InspirationItem,
} from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'

export default function ReferencesView() {
  const t = useT()
  const { slug: bundleSlug } = useOutletContext<ClientBundle>()
  const { slug: routeSlug = bundleSlug } = useParams<{ slug: string }>()

  const [items, setItems] = useState<InspirationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isApiEnabled) {
      setLoading(false)
      return
    }
    let cancelled = false
    apiListInspiration(routeSlug).then((list) => {
      if (!cancelled) {
        setItems(list)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [routeSlug])

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) {
        toast.error(t('inspiration.imagesOnly'))
        return
      }
      setUploading(true)
      try {
        for (const file of images) {
          const item = await apiUploadInspiration(routeSlug, file)
          setItems((prev) => [item, ...prev])
        }
        toast(
          images.length === 1
            ? t('inspiration.added', { n: images.length })
            : t('inspiration.addedPlural', { n: images.length }),
        )
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t('inspiration.uploadFailed'))
      } finally {
        setUploading(false)
      }
    },
    [routeSlug, t],
  )

  const remove = async (id: string) => {
    const prev = items
    setItems((cur) => cur.filter((i) => i.id !== id))
    try {
      await apiDeleteInspiration(routeSlug, id)
    } catch {
      setItems(prev)
      toast.error(t('inspiration.couldNotRemove'))
    }
  }

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
          <Lightbulb className="h-3 w-3" />
          {t('references.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">{t('references.heading')}</h1>
        <p className="text-ink-muted mt-1 text-sm">{t('references.intro')}</p>
      </motion.div>

      {!isApiEnabled ? (
        <Card>
          <CardContent className="p-10 text-center text-ink-muted">
            <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{t('references.apiRequired')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Upload drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
            }}
            onClick={() => fileRef.current?.click()}
            className={cn(
              'rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors',
              dragOver
                ? 'border-brand-blue bg-brand-blue-50/50'
                : 'border-border-subtle hover:border-brand-blue/50 hover:bg-paper-muted/50',
            )}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void uploadFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <div className="flex flex-col items-center gap-1.5 text-ink-muted">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-brand-blue" />
              ) : (
                <Upload className="h-6 w-6" />
              )}
              <p className="text-sm">
                <span className="text-brand-blue font-medium">{t('inspiration.dragDrop')}</span>
                {t('inspiration.orClick')}
              </p>
              <p className="text-[11px]">{t('inspiration.fileTypes')}</p>
            </div>
          </div>

          {/* Grid */}
          {loading ? (
            <p className="text-xs text-ink-muted">{t('inspiration.loading')}</p>
          ) : items.length > 0 ? (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {items.map((it, idx) => (
                <motion.div
                  key={it.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.03 }}
                  className="group relative aspect-square rounded-xl overflow-hidden border border-border-subtle bg-paper-muted"
                >
                  <img
                    src={it.url}
                    alt={it.note || it.filename}
                    loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {it.note && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/55 px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[11px] text-white truncate">{it.note}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(it.id)}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600"
                    aria-label={t('inspiration.removeFromBoard')}
                    title={t('common.remove')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <p className="text-xs text-ink-muted italic">{t('inspiration.noneYet')}</p>
          )}
        </>
      )}
    </div>
  )
}

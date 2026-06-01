import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useOutletContext, useParams } from 'react-router'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Pillar } from '@/components/pillar'
import { fmtDate } from '@/lib/format'
import { ImageOff, Check, AlertCircle, Sparkles, User, Briefcase, Upload, Trash2, Loader2, Lightbulb } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isApiEnabled,
  apiListInspiration,
  apiUploadInspiration,
  apiDeleteInspiration,
  type InspirationItem,
} from '@/lib/api-client'
import type { ClientBundle } from '@/lib/client-data'
import type { AssetItem, AssetSource } from '@/types'

const SOURCE_ICON: Record<string, typeof Sparkles> = {
  'nano-banana': Sparkles,
  canva: Briefcase,
  unsplash: User,
  internal: User,
  other: User,
}

const SOURCE_LABEL: Record<string, string> = {
  'nano-banana': 'AI generated',
  canva: 'Canva',
  unsplash: 'Stock',
  internal: 'Internal',
  other: 'Other',
}

const SOURCE_TONE: Record<string, string> = {
  'nano-banana': 'bg-violet-100 text-violet-700',
  canva: 'bg-cyan-100 text-cyan-700',
  unsplash: 'bg-neutral-100 text-neutral-700',
  internal: 'bg-brand-blue-50 text-brand-blue',
  other: 'bg-paper-muted text-ink-muted',
}

// The agent writes provider strings like "openrouter:gpt-5.4-image-2". Anything
// not in the maps above is treated as an AI-generated image so the tab never
// crashes on an unknown source (the original bug: undefined icon component).
function sourceMeta(source: AssetSource): { Icon: typeof Sparkles; label: string; tone: string } {
  return {
    Icon: SOURCE_ICON[source] ?? Sparkles,
    label: SOURCE_LABEL[source] ?? 'AI generated',
    tone: SOURCE_TONE[source] ?? 'bg-violet-100 text-violet-700',
  }
}

// Stock = Unsplash; everything else that isn't a manual/internal upload counts
// as AI for the filter chips.
const isAiSource = (s: AssetSource) => s !== 'unsplash' && s !== 'canva' && s !== 'internal'

type Filter = 'all' | 'approved' | 'draft' | 'ai' | 'stock'

export default function AssetsView() {
  const { assets, posts, plan, slug } = useOutletContext<ClientBundle>()
  const { slug: routeSlug = slug } = useParams<{ slug: string }>()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<AssetItem | null>(null)

  const pillarByPost = useMemo(() => {
    const m: Record<string, string> = {}
    posts.forEach((p) => (m[p.id] = p.pillar))
    return m
  }, [posts])

  const pillarColor = useMemo(() => {
    const m: Record<string, string> = {}
    plan.pillars.forEach((p) => (m[p.name] = p.color))
    return m
  }, [plan.pillars])

  const items = assets?.items ?? []

  const filtered = useMemo(() => {
    switch (filter) {
      case 'approved': return items.filter((i) => i.finalApproved)
      case 'draft':    return items.filter((i) => !i.finalApproved)
      case 'ai':       return items.filter((i) => isAiSource(i.source))
      case 'stock':    return items.filter((i) => i.source === 'unsplash')
      default:         return items
    }
  }, [items, filter])

  if (!assets || items.length === 0) {
    return (
      <div className="space-y-8">
        {isApiEnabled && <InspirationBoard slug={routeSlug} />}
        <Card>
          <CardContent className="p-10 text-center text-ink-muted">
            <ImageOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              No <code>assets/manifest.json</code> yet. Viktor populates this when
              he generates an image or Pilar uploads one via Telegram.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {isApiEnabled && <InspirationBoard slug={routeSlug} />}
      <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            Assets
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">
            Visual library
          </h1>
          <p className="text-ink-muted mt-1 text-sm">
            Every asset Viktor or Pilar dropped into{' '}
            <code className="text-xs bg-paper-muted px-1 rounded">
              clients/{slug}/assets/
            </code>
            .
          </p>
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">All ({items.length})</TabsTrigger>
            <TabsTrigger value="approved">
              <Check className="h-3 w-3 mr-1" />
              Approved
            </TabsTrigger>
            <TabsTrigger value="draft">
              <AlertCircle className="h-3 w-3 mr-1" />
              Draft
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles className="h-3 w-3 mr-1" />
              AI
            </TabsTrigger>
            <TabsTrigger value="stock">Stock</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {filtered.map((item, idx) => (
          <motion.button
            key={item.id}
            onClick={() => setSelected(item)}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: idx * 0.03 }}
            whileHover={{ y: -3 }}
            className="text-left group focus:outline-none focus:ring-2 focus:ring-brand-blue rounded-xl"
          >
            <Card className="overflow-hidden h-full flex flex-col">
              <div className="aspect-square bg-paper-muted relative overflow-hidden">
                <img
                  src={item.url}
                  alt={item.filename}
                  loading="lazy"
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {!item.finalApproved && (
                  <div className="absolute top-2 left-2">
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px]">
                      DRAFT
                    </Badge>
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <SourceBadge source={item.source} />
                </div>
              </div>
              <CardContent className="p-3 space-y-1.5">
                <p className="text-sm font-medium truncate" title={item.filename}>
                  {item.filename}
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  {item.usedInPosts.length === 0 ? (
                    <span className="text-[11px] text-ink-muted">Unused</span>
                  ) : (
                    item.usedInPosts.slice(0, 2).map((postId) => {
                      const pillar = pillarByPost[postId]
                      return pillar ? (
                        <Pillar
                          key={postId}
                          name={postId}
                          color={pillarColor[pillar]}
                          className="!text-[10px]"
                        />
                      ) : null
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.button>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {selected.filename}
                  {selected.finalApproved ? (
                    <Badge className="bg-emerald-100 text-emerald-700">Approved</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800">Draft</Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  {sourceMeta(selected.source).label} · Created by {selected.owner} ·{' '}
                  {fmtDate(selected.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-lg overflow-hidden bg-paper-muted">
                <img
                  src={selected.url}
                  alt={selected.filename}
                  className="w-full max-h-[60vh] object-contain"
                />
              </div>

              {selected.designBrief && (
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                    Design brief
                  </p>
                  <p className="text-sm">{selected.designBrief}</p>
                </div>
              )}

              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                  Used in posts
                </p>
                {selected.usedInPosts.length === 0 ? (
                  <p className="text-sm text-ink-muted">— not yet attached to a post</p>
                ) : (
                  <div className="flex gap-1.5 flex-wrap">
                    {selected.usedInPosts.map((postId) => (
                      <Badge key={postId} variant="outline" className="font-mono text-xs">
                        {postId}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <p className="text-[10px] text-ink-muted font-mono">
                  asset id: {selected.id}
                </p>
                <Button asChild size="sm" variant="outline">
                  <a href={selected.url} target="_blank" rel="noreferrer">
                    Open full size
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  )
}

// ── Inspiration board (per-client drag-drop image library) ───────────────────

function InspirationBoard({ slug }: { slug: string }) {
  const [items, setItems] = useState<InspirationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let cancelled = false
    apiListInspiration(slug).then((list) => {
      if (!cancelled) {
        setItems(list)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [slug])

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
      if (images.length === 0) {
        toast.error('Only image files can be added here')
        return
      }
      setUploading(true)
      try {
        for (const file of images) {
          const item = await apiUploadInspiration(slug, file)
          setItems((prev) => [item, ...prev])
        }
        toast(`Added ${images.length} image${images.length === 1 ? '' : 's'} to inspiration`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [slug],
  )

  const remove = async (id: string) => {
    const prev = items
    setItems((cur) => cur.filter((i) => i.id !== id))
    try {
      await apiDeleteInspiration(slug, id)
    } catch {
      setItems(prev) // rollback
      toast.error('Could not remove')
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
          <Lightbulb className="h-3 w-3" />
          Inspiration
        </p>
        <h2 className="text-lg font-semibold">Mood & reference board</h2>
        <p className="text-sm text-ink-muted">
          Drop images here that capture the look you're after. Viktor can use them
          as style reference when generating visuals.
        </p>
      </div>

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
            <span className="text-brand-blue font-medium">Drag & drop</span> images, or click to browse
          </p>
          <p className="text-[11px]">PNG, JPG, WEBP or GIF · up to 15 MB each</p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-ink-muted">Loading inspiration…</p>
      ) : items.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {items.map((it) => (
            <div
              key={it.id}
              className="group relative aspect-square rounded-lg overflow-hidden border border-border-subtle bg-paper-muted"
            >
              <img src={it.url} alt={it.note || it.filename} loading="lazy" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(it.id)}
                className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-black/55 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-600"
                aria-label="Remove from inspiration"
                title="Remove"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-muted italic">No inspiration images yet — drop some above.</p>
      )}
    </section>
  )
}

function SourceBadge({ source }: { source: AssetSource }) {
  const { Icon, label, tone } = sourceMeta(source)
  return (
    <Badge className={cn('text-[10px] flex items-center gap-1', tone)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  )
}

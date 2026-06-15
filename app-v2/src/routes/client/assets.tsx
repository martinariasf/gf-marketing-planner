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
import {
  ImageOff,
  Sparkles,
  User,
  Briefcase,
  Upload,
  Trash2,
  Loader2,
  Lightbulb,
  Search,
  FolderOpen,
  Palette,
  Globe2,
  CheckCircle2,
  FileText,
  Film,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  isApiEnabled,
  apiListInspiration,
  apiUploadInspiration,
  apiDeleteInspiration,
  apiApproveInformationSource,
  apiCreateInformationSource,
  apiListInformationSources,
  apiPatchInformationSource,
  apiUploadInformationSourceFile,
  apiDeleteManifestAsset,
  INFO_SOURCE_MAX_BYTES,
  type InspirationItem,
  type InformationSource,
  type InformationSourceType,
} from '@/lib/api-client'
import { useT } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'
import type { AssetItem, AssetSource } from '@/types'

const SOURCE_ICON: Record<string, typeof Sparkles> = {
  'nano-banana': Sparkles,
  canva: Briefcase,
  unsplash: User,
  internal: User,
  other: User,
}

const SOURCE_LABEL_KEY: Record<string, string> = {
  'nano-banana': 'assets.source.ai',
  canva: 'assets.source.canva',
  unsplash: 'assets.source.unsplash',
  internal: 'assets.source.internal',
  other: 'assets.source.other',
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
function sourceMeta(source: AssetSource, t: (k: string) => string): { Icon: typeof Sparkles; label: string; tone: string } {
  return {
    Icon: SOURCE_ICON[source] ?? Sparkles,
    label: t(SOURCE_LABEL_KEY[source] ?? 'assets.source.ai'),
    tone: SOURCE_TONE[source] ?? 'bg-violet-100 text-violet-700',
  }
}

// Stock = Unsplash; everything else that isn't a manual/internal upload counts
// as AI for the filter chips.
const isAiSource = (s: AssetSource) => s !== 'unsplash' && s !== 'canva' && s !== 'internal'

type Folder = 'viktor' | 'uploads' | 'references' | 'brandkit' | 'information'

function matchesSearch(item: AssetItem, q: string): boolean {
  if (!q) return true
  const lower = q.toLowerCase()
  return (
    item.filename.toLowerCase().includes(lower) ||
    (item.designBrief?.toLowerCase().includes(lower) ?? false) ||
    item.owner.toLowerCase().includes(lower) ||
    item.usedInPosts.some((p) => p.toLowerCase().includes(lower)) ||
    (item.tags?.some((tag) => tag.toLowerCase().includes(lower)) ?? false)
  )
}

export default function AssetsView() {
  const t = useT()
  const { assets, posts, plan, slug, brief } = useOutletContext<ClientBundle>()
  const { slug: routeSlug = slug } = useParams<{ slug: string }>()
  const [folder, setFolder] = useState<Folder>('viktor')
  const [search, setSearch] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [selected, setSelected] = useState<AssetItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<AssetItem | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [deletedAssetIds, setDeletedAssetIds] = useState<Set<string>>(() => new Set())

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

  const items = useMemo(
    () => (assets?.items ?? []).filter((item) => !deletedAssetIds.has(item.id) && item.kind !== 'video'),
    [assets?.items, deletedAssetIds],
  )

  const deleteManifestAsset = async (item: AssetItem) => {
    setDeletingAssetId(item.id)
    try {
      await apiDeleteManifestAsset(routeSlug, item.id)
      setDeletedAssetIds((prev) => {
        const next = new Set(prev)
        next.add(item.id)
        return next
      })
      setSelected(null)
      setConfirmDelete(null)
      toast(t('assets.deleted'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('assets.deleteFailed'))
    } finally {
      setDeletingAssetId(null)
    }
  }

  // Partition manifest items into two folders
  const viktorItems = useMemo(
    () => items.filter((i) => isAiSource(i.source) || i.owner.toLowerCase().includes('viktor')),
    [items],
  )
  const uploadItems = useMemo(
    () => items.filter((i) => !isAiSource(i.source) && !i.owner.toLowerCase().includes('viktor')),
    [items],
  )

  // Determine the default folder: first non-empty manifest folder, else viktor
  useEffect(() => {
    if (viktorItems.length > 0) setFolder('viktor')
    else if (uploadItems.length > 0) setFolder('uploads')
    else setFolder('viktor')
  // Only run on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tags collected from current folder's items
  const folderItems: AssetItem[] = folder === 'viktor' ? viktorItems : uploadItems
  const allTags = useMemo(() => {
    const set = new Set<string>()
    folderItems.forEach((i) => i.tags?.forEach((tag) => set.add(tag)))
    return Array.from(set).sort()
  }, [folderItems])

  const filteredItems = useMemo(() => {
    let result = folderItems
    if (search) result = result.filter((i) => matchesSearch(i, search))
    if (activeTag) result = result.filter((i) => i.tags?.includes(activeTag))
    return result
  }, [folderItems, search, activeTag])

  const brandLogos = brief?.branding?.logos ?? []
  const brandColors = brief?.branding?.colors ?? []

  const folderCounts: Record<Folder, number> = {
    viktor: viktorItems.length,
    uploads: uploadItems.length,
    references: 0, // references board has its own count
    brandkit: brandLogos.length,
    information: 0,
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
            {t('assets.eyebrow')}
          </p>
          <h1 className="text-3xl font-bold text-brand-blue">
            {t('assets.heading')}
          </h1>
          <p className="text-ink-muted mt-1 text-sm">
            {t('assets.introPrefix')}
            <code className="text-xs bg-paper-muted px-1 rounded">
              clients/{slug}/assets/
            </code>
            .
          </p>
        </div>

        {/* Folder selector */}
        <Tabs value={folder} onValueChange={(v) => { setFolder(v as Folder); setSearch(''); setActiveTag(null) }}>
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="viktor" className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              {t('assets.folderViktor')}
              {folderCounts.viktor > 0 && (
                <span className="ml-1 text-[10px] opacity-60">({folderCounts.viktor})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="uploads" className="flex items-center gap-1.5">
              <Upload className="h-3.5 w-3.5" />
              {t('assets.folderUploads')}
              {folderCounts.uploads > 0 && (
                <span className="ml-1 text-[10px] opacity-60">({folderCounts.uploads})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="references" className="flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5" />
              {t('assets.folderReferences')}
            </TabsTrigger>
            <TabsTrigger value="information" className="flex items-center gap-1.5">
              <Globe2 className="h-3.5 w-3.5" />
              Information Sources
            </TabsTrigger>
            <TabsTrigger value="brandkit" className="flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" />
              {t('assets.folderBrandKit')}
              {folderCounts.brandkit > 0 && (
                <span className="ml-1 text-[10px] opacity-60">({folderCounts.brandkit})</span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* References folder — InspirationBoard */}
        {folder === 'references' && (
          <>
            {isApiEnabled ? (
              <InspirationBoard slug={routeSlug} />
            ) : (
              <Card>
                <CardContent className="p-10 text-center text-ink-muted">
                  <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">{t('references.apiRequired')}</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Brand Kit folder */}
        {folder === 'brandkit' && (
          <BrandKitFolder logos={brandLogos} colors={brandColors} />
        )}

        {folder === 'information' && (
          <>
            {isApiEnabled ? (
              <InformationSourcesBoard slug={routeSlug} />
            ) : (
              <Card>
                <CardContent className="p-10 text-center text-ink-muted">
                  <Globe2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Information Sources require the staging API.</p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Manifest folders: viktor + uploads */}
        {(folder === 'viktor' || folder === 'uploads') && (
          <div className="space-y-4">
            {/* Search box */}
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setActiveTag(null) }}
                placeholder={t('assets.searchPlaceholder')}
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border-subtle bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
            </div>

            {/* Tag filter chips */}
            {allTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] uppercase tracking-wider text-ink-muted">{t('assets.tags')}:</span>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={cn(
                      'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                      activeTag === tag
                        ? 'bg-brand-blue text-white border-brand-blue'
                        : 'bg-paper border-border-subtle text-ink-muted hover:border-brand-blue/50',
                    )}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Asset grid */}
            {filteredItems.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-ink-muted">
                  <ImageOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">
                    {items.length === 0
                      ? t('assets.emptyManifest')
                      : t('assets.emptyManifest')}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredItems.map((item, idx) => (
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
                        <AssetMedia
                          item={item}
                          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        {!item.finalApproved && (
                          <div className="absolute top-2 left-2">
                            <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-[10px] uppercase">
                              {t('common.draft')}
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
                            <span className="text-[11px] text-ink-muted">{t('assets.unused')}</span>
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
                        {item.tags && item.tags.length > 0 && (
                          <div className="flex gap-1 flex-wrap">
                            {item.tags.map((tag) => (
                              <span
                                key={tag}
                                className="text-[10px] px-1.5 py-0.5 rounded-full bg-paper-muted text-ink-muted border border-border-subtle"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Asset detail Dialog — preserved */}
        <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent
            className="sm:max-w-2xl bg-paper"
            overlayClassName="bg-black/80 supports-backdrop-filter:backdrop-blur-sm"
          >
            {selected && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {selected.filename}
                    {selected.finalApproved ? (
                      <Badge className="bg-emerald-100 text-emerald-700">{t('common.approved')}</Badge>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800">{t('common.draft')}</Badge>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {sourceMeta(selected.source, t).label} · {selected.owner} ·{' '}
                    {fmtDate(selected.createdAt)}
                  </DialogDescription>
                </DialogHeader>

                <div className="rounded-lg overflow-hidden bg-paper-muted">
                  <AssetMedia item={selected} controls className="w-full max-h-[60vh] object-contain" />
                </div>

                {selected.designBrief && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {t('assets.designBrief')}
                    </p>
                    <p className="text-sm">{selected.designBrief}</p>
                  </div>
                )}

                {selected.tags && selected.tags.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                      {t('assets.tags')}
                    </p>
                    <div className="flex gap-1.5 flex-wrap">
                      {selected.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted">
                    {t('assets.usedInPosts')}
                  </p>
                  {selected.usedInPosts.length === 0 ? (
                    <p className="text-sm text-ink-muted">{t('assets.notAttached')}</p>
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

                <div className="flex justify-between items-center gap-3 pt-2">
                  <p className="text-[10px] text-ink-muted font-mono">
                    {t('assets.assetId', { id: selected.id })}
                  </p>
                  <div className="flex items-center gap-2">
                    {isApiEnabled && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-rose-700 hover:text-rose-800 hover:border-rose-300"
                        onClick={() => setConfirmDelete(selected)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        {t('assets.delete')}
                      </Button>
                    )}
                    <Button asChild size="sm" variant="outline">
                      <a href={selected.url} target="_blank" rel="noreferrer">
                        {t('assets.openFullSize')}
                      </a>
                    </Button>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
          <DialogContent className="sm:max-w-md">
            {confirmDelete && (
              <>
                <DialogHeader>
                  <DialogTitle>{t('assets.deleteConfirmTitle')}</DialogTitle>
                  <DialogDescription>
                    {t('assets.deleteConfirmBody', { name: confirmDelete.filename })}
                  </DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setConfirmDelete(null)}
                    disabled={deletingAssetId === confirmDelete.id}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="text-rose-700 hover:text-rose-800 hover:border-rose-300"
                    onClick={() => void deleteManifestAsset(confirmDelete)}
                    disabled={deletingAssetId === confirmDelete.id}
                  >
                    {deletingAssetId === confirmDelete.id ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    {deletingAssetId === confirmDelete.id ? t('assets.deleting') : t('assets.delete')}
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

// ── Brand Kit folder ─────────────────────────────────────────────────────────

interface BrandKitFolderProps {
  logos: Array<{ variant: string; url: string }>
  colors: Array<{ name: string; hex: string }>
}

function BrandKitFolder({ logos, colors }: BrandKitFolderProps) {
  const t = useT()

  if (logos.length === 0 && colors.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-ink-muted">
          <Palette className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">{t('assets.noBrandAssets')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {logos.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-ink-muted">{t('assets.logos')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {logos.map((logo, idx) => (
              <a
                key={idx}
                href={logo.url}
                target="_blank"
                rel="noreferrer"
                className="group"
              >
                <Card className="overflow-hidden h-full flex flex-col hover:border-brand-blue/40 transition-colors">
                  <div className="aspect-square bg-paper-muted relative overflow-hidden p-4 flex items-center justify-center">
                    <img
                      src={logo.url}
                      alt={logo.variant}
                      loading="lazy"
                      className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <CardContent className="p-3">
                    <p className="text-sm font-medium truncate text-ink-muted" title={logo.variant}>
                      {logo.variant}
                    </p>
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </div>
      )}

      {colors.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-ink-muted">{t('assets.colorSwatches')}</p>
          <div className="flex gap-3 flex-wrap">
            {colors.map((color, idx) => (
              <div key={idx} className="flex flex-col items-center gap-1.5">
                <div
                  className="h-12 w-12 rounded-lg border border-border-subtle shadow-sm"
                  style={{ backgroundColor: color.hex }}
                  title={color.hex}
                />
                <p className="text-[11px] text-ink-muted text-center max-w-[60px] truncate">{color.name}</p>
                <p className="text-[10px] font-mono text-ink-muted">{color.hex}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Inspiration board (per-client drag-drop image library) ───────────────────

function InspirationBoard({ slug }: { slug: string }) {
  const t = useT()
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
        toast.error(t('inspiration.imagesOnly'))
        return
      }
      setUploading(true)
      try {
        for (const file of images) {
          const item = await apiUploadInspiration(slug, file)
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
    [slug, t],
  )

  const remove = async (id: string) => {
    const prev = items
    setItems((cur) => cur.filter((i) => i.id !== id))
    try {
      await apiDeleteInspiration(slug, id)
    } catch {
      setItems(prev) // rollback
      toast.error(t('inspiration.couldNotRemove'))
    }
  }

  return (
    <section className="space-y-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
          <Lightbulb className="h-3 w-3" />
          {t('inspiration.eyebrow')}
        </p>
        <h2 className="text-lg font-semibold">{t('inspiration.heading')}</h2>
        <p className="text-sm text-ink-muted">
          {t('inspiration.intro')}
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
            <span className="text-brand-blue font-medium">{t('inspiration.dragDrop')}</span>{t('inspiration.orClick')}
          </p>
          <p className="text-[11px]">{t('inspiration.fileTypes')}</p>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-ink-muted">{t('inspiration.loading')}</p>
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
                aria-label={t('inspiration.removeFromBoard')}
                title={t('common.remove')}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-muted italic">{t('inspiration.noneYet')}</p>
      )}
    </section>
  )
}

const INFO_SOURCE_MAX_MB = Math.round(INFO_SOURCE_MAX_BYTES / 1_000_000)
const INFO_SOURCE_ACCEPT = '.txt,.md,.markdown,.vtt,.srt,.csv,.json,.log,.text,text/*,application/json'
const INFO_SOURCE_TEXT_RE = /\.(txt|md|markdown|vtt|srt|csv|json|log|text)$/i

function isUploadableSourceFile(file: File): boolean {
  const type = (file.type || '').toLowerCase()
  if (type.startsWith('text/')) return true
  if (type === 'application/json') return true
  return INFO_SOURCE_TEXT_RE.test(file.name || '')
}

function InformationSourcesBoard({ slug }: { slug: string }) {
  const [items, setItems] = useState<InformationSource[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [draft, setDraft] = useState({
    title: '',
    url: '',
    sourceType: 'website' as InformationSourceType,
    summary: '',
    prompt: 'Use this approved source as factual context for post generation. Show source references.',
  })

  const load = useCallback(() => {
    setLoading(true)
    apiListInformationSources(slug)
      .then(setItems)
      .finally(() => setLoading(false))
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const create = async () => {
    if (!draft.title.trim()) {
      toast.error('Add a title first.')
      return
    }
    setSaving(true)
    try {
      const item = await apiCreateInformationSource(slug, {
        ...draft,
        title: draft.title.trim(),
        url: draft.url.trim(),
        summary: draft.summary.trim(),
        prompt: draft.prompt.trim(),
        approved: false,
        tags: [],
      })
      setItems((cur) => [item, ...cur])
      setDraft({
        title: '',
        url: '',
        sourceType: 'website',
        summary: '',
        prompt: 'Use this approved source as factual context for post generation. Show source references.',
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save source')
    } finally {
      setSaving(false)
    }
  }

  const patch = async (item: InformationSource, patch: Partial<InformationSource>) => {
    const prev = items
    setItems((cur) => cur.map((it) => (it.id === item.id ? { ...it, ...patch } : it)))
    try {
      const updated = await apiPatchInformationSource(slug, item.id, patch)
      setItems((cur) => cur.map((it) => (it.id === item.id ? updated : it)))
    } catch (err) {
      setItems(prev)
      toast.error(err instanceof Error ? err.message : 'Could not update source')
    }
  }

  const approve = async (item: InformationSource) => {
    try {
      const updated = await apiApproveInformationSource(slug, item.id)
      setItems((cur) => cur.map((it) => (it.id === item.id ? updated : it)))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve source')
    }
  }

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files)
      if (list.length === 0) return
      const tooBig = list.find((f) => f.size > INFO_SOURCE_MAX_BYTES)
      if (tooBig) {
        toast.error(`"${tooBig.name}" is over ${INFO_SOURCE_MAX_MB} MB. Max ${INFO_SOURCE_MAX_MB} MB per file.`)
        return
      }
      const accepted = list.filter(isUploadableSourceFile)
      if (accepted.length === 0) {
        toast.error('Only text files (.txt, .md, .vtt, .srt, .csv, .json) are supported.')
        return
      }
      setUploading(true)
      try {
        for (const file of accepted) {
          const item = await apiUploadInformationSourceFile(slug, file)
          setItems((cur) => [item, ...cur])
        }
        toast(accepted.length === 1 ? 'Source uploaded.' : `${accepted.length} sources uploaded.`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    },
    [slug],
  )

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
          <Globe2 className="h-3 w-3" />
          Information Sources
        </p>
        <h2 className="text-lg font-semibold">Source material for post generation</h2>
        <p className="text-sm text-ink-muted">
          Save websites, notes, references, or news here before Viktor uses them. Approved sources are available to the agent by default.
        </p>
      </div>

      {/* Drag-and-drop upload for transcripts / extra info (GF-12) */}
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
          accept={INFO_SOURCE_ACCEPT}
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
            <span className="text-brand-blue font-medium">Drag &amp; drop a transcript</span> or click to upload
          </p>
          <p className="text-[11px]">Text files (.txt, .md, .vtt, .srt, .csv, .json) · max {INFO_SOURCE_MAX_MB} MB each</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={draft.title}
            onChange={(e) => setDraft((cur) => ({ ...cur, title: e.target.value }))}
            placeholder="Source title"
            className="rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <select
              value={draft.sourceType}
              onChange={(e) => setDraft((cur) => ({ ...cur, sourceType: e.target.value as InformationSourceType }))}
              className="rounded-md border border-border-subtle bg-paper px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
            >
              {(['website', 'note', 'news', 'reference', 'other'] as InformationSourceType[]).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
            <input
              value={draft.url}
              onChange={(e) => setDraft((cur) => ({ ...cur, url: e.target.value }))}
              placeholder="https://..."
              className="rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30"
            />
          </div>
          <textarea
            value={draft.summary}
            onChange={(e) => setDraft((cur) => ({ ...cur, summary: e.target.value }))}
            placeholder="Imported/saved information or short summary"
            rows={3}
            className="md:col-span-2 rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
          />
          <textarea
            value={draft.prompt}
            onChange={(e) => setDraft((cur) => ({ ...cur, prompt: e.target.value }))}
            placeholder="Agent prompt for how to use this source"
            rows={2}
            className="md:col-span-2 rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
          />
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={create} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save source
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <p className="text-xs text-ink-muted">Loading sources...</p>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-ink-muted">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No information sources saved yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className={cn(item.approved && 'border-brand-green-200/70 bg-brand-green-50/20')}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline">{item.sourceType ?? 'source'}</Badge>
                      {item.approved ? (
                        <Badge className="bg-brand-green-100 text-brand-green-600">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Approved
                        </Badge>
                      ) : (
                        <Badge className="bg-amber-100 text-amber-800">Needs approval</Badge>
                      )}
                    </div>
                    <h3 className="font-semibold mt-1">{item.title}</h3>
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noreferrer" className="text-xs font-mono text-brand-blue hover:underline break-all">
                        {item.url}
                      </a>
                    )}
                  </div>
                  {!item.approved && (
                    <Button size="sm" variant="outline" onClick={() => approve(item)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Approve
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted">Saved information</span>
                    <textarea
                      defaultValue={item.summary ?? ''}
                      onBlur={(e) => {
                        if (e.target.value !== (item.summary ?? '')) void patch(item, { summary: e.target.value })
                      }}
                      rows={4}
                      className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted">Agent prompt</span>
                    <textarea
                      defaultValue={item.prompt ?? ''}
                      onBlur={(e) => {
                        if (e.target.value !== (item.prompt ?? '')) void patch(item, { prompt: e.target.value })
                      }}
                      rows={4}
                      className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-blue/30 resize-y"
                    />
                  </label>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}

function SourceBadge({ source }: { source: AssetSource }) {
  const t = useT()
  const { Icon, label, tone } = sourceMeta(source, t)
  return (
    <Badge className={cn('text-[10px] flex items-center gap-1', tone)}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </Badge>
  )
}

function AssetMedia({ item, className, controls = false }: { item: AssetItem; className?: string; controls?: boolean }) {
  if (item.kind === 'video') {
    return (
      <div className="relative h-full w-full bg-black">
        <video
          src={item.url}
          controls={controls}
          muted={!controls}
          playsInline
          preload="metadata"
          className={cn(className, 'bg-black')}
        />
        {!controls && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="h-10 w-10 rounded-full bg-black/55 text-white flex items-center justify-center">
              <Film className="h-5 w-5" />
            </span>
          </div>
        )}
      </div>
    )
  }
  return <img src={item.url} alt={item.filename} loading="lazy" className={className} />
}

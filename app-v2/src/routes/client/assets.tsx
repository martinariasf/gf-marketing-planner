import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion } from 'framer-motion'
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
import { ImageOff, Check, AlertCircle, Sparkles, User, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientBundle } from '@/lib/client-data'
import type { AssetItem, AssetSource } from '@/types'

const SOURCE_ICON: Record<AssetSource, typeof Sparkles> = {
  'nano-banana': Sparkles,
  canva: Briefcase,
  unsplash: User,
  internal: User,
  other: User,
}

const SOURCE_LABEL: Record<AssetSource, string> = {
  'nano-banana': 'AI generated',
  canva: 'Canva',
  unsplash: 'Stock',
  internal: 'Internal',
  other: 'Other',
}

type Filter = 'all' | 'approved' | 'draft' | 'ai' | 'stock'

export default function AssetsView() {
  const { assets, posts, plan, slug } = useOutletContext<ClientBundle>()
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
      case 'ai':       return items.filter((i) => i.source === 'nano-banana')
      case 'stock':    return items.filter((i) => i.source === 'unsplash')
      default:         return items
    }
  }, [items, filter])

  if (!assets || items.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-ink-muted">
          <ImageOff className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">
            No <code>assets/manifest.json</code> yet. Viktor populates this when
            he generates an image or Pilar uploads one via Telegram.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
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
                  {SOURCE_LABEL[selected.source]} · Created by {selected.owner} ·{' '}
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
  )
}

function SourceBadge({ source }: { source: AssetSource }) {
  const Icon = SOURCE_ICON[source]
  const tone: Record<AssetSource, string> = {
    'nano-banana': 'bg-violet-100 text-violet-700',
    canva: 'bg-cyan-100 text-cyan-700',
    unsplash: 'bg-neutral-100 text-neutral-700',
    internal: 'bg-brand-blue-50 text-brand-blue',
    other: 'bg-paper-muted text-ink-muted',
  }
  return (
    <Badge className={cn('text-[10px] flex items-center gap-1', tone[source])}>
      <Icon className="h-2.5 w-2.5" />
      {SOURCE_LABEL[source]}
    </Badge>
  )
}

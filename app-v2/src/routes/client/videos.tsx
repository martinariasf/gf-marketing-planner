import { useMemo } from 'react'
import { useOutletContext } from 'react-router'
import { Film, Sparkles, Wand2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fmtDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { ClientBundle } from '@/lib/client-data'
import type { AssetItem } from '@/types'

type VideoLibraryItem = {
  id: string
  url: string
  filename: string
  createdAt?: string
  designBrief?: string
  finalApproved?: boolean
  usedInPosts: string[]
  source: 'manifest' | 'post'
}

function mergeVideo(items: Map<string, VideoLibraryItem>, next: VideoLibraryItem) {
  const current = items.get(next.url)
  if (!current) {
    items.set(next.url, next)
    return
  }
  items.set(next.url, {
    ...current,
    filename: current.filename || next.filename,
    createdAt: current.createdAt ?? next.createdAt,
    designBrief: current.designBrief ?? next.designBrief,
    finalApproved: current.finalApproved ?? next.finalApproved,
    usedInPosts: Array.from(new Set([...current.usedInPosts, ...next.usedInPosts])),
    source: current.source === 'manifest' ? current.source : next.source,
  })
}

export default function VideosView() {
  const t = useT()
  const { assets, posts } = useOutletContext<ClientBundle>()
  const videos = useMemo(() => {
    const byUrl = new Map<string, VideoLibraryItem>()
    ;(assets?.items ?? [])
      .filter((item): item is AssetItem => item.kind === 'video')
      .forEach((item) =>
        mergeVideo(byUrl, {
          id: item.id,
          url: item.url,
          filename: item.filename,
          createdAt: item.createdAt,
          designBrief: item.designBrief,
          finalApproved: item.finalApproved,
          usedInPosts: item.usedInPosts,
          source: 'manifest',
        }),
      )
    posts.forEach((post) => {
      post.media
        ?.filter((item) => item.type === 'video' && item.url)
        .forEach((item, index) =>
          mergeVideo(byUrl, {
            id: `${post.id}-video-${index}`,
            url: item.url,
            filename: item.caption || `${post.id} video`,
            designBrief: item.caption || post.title,
            usedInPosts: [post.id],
            source: 'post',
          }),
        )
    })
    return Array.from(byUrl.values()).sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  }, [assets?.items, posts])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
          <Film className="h-3 w-3" />
          {t('videos.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-brand-blue tracking-tight">
          {t('videos.heading')}
        </h1>
        <p className="text-sm text-ink-muted mt-2 max-w-2xl">
          {t('videos.intro')}
        </p>
      </div>

      {videos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {videos.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <div className="aspect-video bg-black">
                <video src={item.url} controls playsInline preload="metadata" className="h-full w-full bg-black" />
              </div>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="bg-brand-blue text-white gap-1">
                    <Sparkles className="h-3 w-3" />
                    Viktor
                  </Badge>
                  {item.source === 'post' && (
                    <Badge variant="outline" className="border-brand-blue/30 text-brand-blue">
                      {t('videos.postMedia')}
                    </Badge>
                  )}
                  {item.finalApproved === false && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                      {t('videos.draft')}
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="font-medium truncate" title={item.filename}>
                    {item.filename}
                  </p>
                  {item.createdAt && <p className="text-xs text-ink-muted">{fmtDate(item.createdAt)}</p>}
                </div>
                {item.usedInPosts.length > 0 && (
                  <div className="flex gap-1 flex-wrap">
                    {item.usedInPosts.slice(0, 4).map((postId) => (
                      <Badge key={postId} variant="outline" className="text-[10px]">
                        {postId}
                      </Badge>
                    ))}
                  </div>
                )}
                {item.designBrief && (
                  <p className="text-sm text-ink-muted line-clamp-3">{item.designBrief}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-dashed border-brand-blue-200 bg-brand-blue-50/30">
          <CardContent className="p-8 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-start">
            <div className="h-14 w-14 rounded-lg bg-brand-blue text-white flex items-center justify-center">
              <Wand2 className="h-7 w-7" />
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-brand-blue text-white">{t('videos.ready')}</Badge>
                <Badge variant="outline" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  {t('videos.agentGenerated')}
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[t('videos.example1'), t('videos.example2'), t('videos.example3')].map((label) => (
                  <div key={label} className="rounded-md border border-border-subtle bg-paper/80 p-4">
                    <p className="text-sm font-medium">{label}</p>
                    <div className="mt-3 aspect-video rounded bg-paper-muted border border-border-subtle" />
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

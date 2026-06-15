import { useMemo } from 'react'
import { useOutletContext } from 'react-router'
import { Film, Sparkles, Wand2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { fmtDate } from '@/lib/format'
import type { ClientBundle } from '@/lib/client-data'

export default function VideosView() {
  const { assets } = useOutletContext<ClientBundle>()
  const videos = useMemo(
    () => (assets?.items ?? []).filter((item) => item.kind === 'video'),
    [assets?.items],
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
          <Film className="h-3 w-3" />
          Videos
        </p>
        <h1 className="text-3xl font-bold text-brand-blue tracking-tight">
          Generated videos
        </h1>
        <p className="text-sm text-ink-muted mt-2 max-w-2xl">
          Viktor can now turn prompts, post ideas, and source material into short Seedance clips. Finished videos appear here after they are saved into the client assets manifest.
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
                  {!item.finalApproved && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800">
                      Draft
                    </Badge>
                  )}
                </div>
                <div>
                  <p className="font-medium truncate" title={item.filename}>
                    {item.filename}
                  </p>
                  <p className="text-xs text-ink-muted">{fmtDate(item.createdAt)}</p>
                </div>
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
                <Badge className="bg-brand-blue text-white">Ready</Badge>
                <Badge variant="outline" className="gap-1">
                  <Sparkles className="h-3 w-3" />
                  Agent-generated
                </Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {['Post-to-video drafts', 'Campaign video ideas', 'Channel-ready clips'].map((label) => (
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

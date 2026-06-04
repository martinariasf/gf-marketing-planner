import { Film, Sparkles, Wand2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function VideosView() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1 flex items-center gap-1.5">
          <Film className="h-3 w-3" />
          Videos
        </p>
        <h1 className="text-3xl font-bold text-brand-blue tracking-tight">
          Video generation is coming
        </h1>
        <p className="text-sm text-ink-muted mt-2 max-w-2xl">
          Viktor will turn approved ideas, posts, and source material into channel-ready clips. This section is reserved for generated videos, campaign cuts, and review-ready drafts.
        </p>
      </div>

      <Card className="border-dashed border-brand-blue-200 bg-brand-blue-50/30">
        <CardContent className="p-8 grid grid-cols-1 md:grid-cols-[auto_1fr] gap-5 items-start">
          <div className="h-14 w-14 rounded-lg bg-brand-blue text-white flex items-center justify-center">
            <Wand2 className="h-7 w-7" />
          </div>
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className="bg-brand-blue text-white">Coming soon</Badge>
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
    </div>
  )
}

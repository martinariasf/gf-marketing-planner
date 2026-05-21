import { useMemo, useState } from 'react'
import { useOutletContext } from 'react-router'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PostCard } from '@/components/post-card'
import { ChannelMockup } from '@/components/channel-mockup'
import { Pillar } from '@/components/pillar'
import { fmtDate } from '@/lib/format'
import { CalendarDays } from 'lucide-react'
import type { ClientBundle } from '@/lib/client-data'
import type { Post } from '@/types'

function monthKey(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'long' })
}

export default function CalendarView() {
  const { plan, posts } = useOutletContext<ClientBundle>()

  const pillarColor = useMemo(() => {
    const m: Record<string, string> = {}
    plan.pillars.forEach((p) => (m[p.name] = p.color))
    return m
  }, [plan.pillars])

  const months = plan.quarter.months.map((m) => m.name)

  const postsByMonth = useMemo(() => {
    const m: Record<string, Post[]> = {}
    months.forEach((name) => (m[name] = []))
    posts.forEach((p) => {
      const k = monthKey(p.date)
      if (m[k]) m[k].push(p)
    })
    for (const k of Object.keys(m)) {
      m[k].sort((a, b) => a.date.localeCompare(b.date))
    }
    return m
  }, [posts, months])

  const [activeMonth, setActiveMonth] = useState(months[0])
  const monthPosts = postsByMonth[activeMonth] ?? []
  const [activePostId, setActivePostId] = useState<string | null>(monthPosts[0]?.id ?? null)

  const activePost =
    monthPosts.find((p) => p.id === activePostId) ?? monthPosts[0]

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          Content calendar
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">
          {plan.quarter.label}
        </h1>
      </div>

      <Tabs
        value={activeMonth}
        onValueChange={(m) => {
          setActiveMonth(m)
          setActivePostId(postsByMonth[m]?.[0]?.id ?? null)
        }}
      >
        <TabsList>
          {months.map((m) => (
            <TabsTrigger key={m} value={m}>
              {m}
              <Badge variant="secondary" className="ml-2 bg-paper-muted">
                {postsByMonth[m]?.length ?? 0}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {months.map((m) => (
          <TabsContent key={m} value={m} className="mt-5">
            {(postsByMonth[m] ?? []).length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center text-ink-muted text-sm">
                  <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No posts scheduled for {m} yet.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
                {/* Left: post list */}
                <div className="space-y-3">
                  {(postsByMonth[m] ?? []).map((post) => (
                    <button
                      key={post.id}
                      onClick={() => setActivePostId(post.id)}
                      className="text-left w-full"
                    >
                      <motion.div
                        whileHover={{ y: -2 }}
                        animate={{
                          scale: post.id === activePost?.id ? 1.0 : 0.99,
                        }}
                        transition={{ duration: 0.15 }}
                        className={
                          post.id === activePost?.id
                            ? 'ring-2 ring-brand-blue rounded-xl'
                            : ''
                        }
                      >
                        <PostCard
                          post={post}
                          pillarColor={pillarColor[post.pillar]}
                        />
                      </motion.div>
                    </button>
                  ))}
                </div>

                {/* Right: channel mockup */}
                <div className="lg:sticky lg:top-[180px] lg:self-start space-y-3">
                  <div className="text-xs text-ink-muted flex items-center justify-between">
                    <span>Preview</span>
                    {activePost && (
                      <span>{fmtDate(activePost.date)} · {activePost.channel}</span>
                    )}
                  </div>
                  <AnimatePresence mode="wait">
                    {activePost && (
                      <motion.div
                        key={activePost.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChannelMockup
                          post={activePost}
                          clientName={plan.client.name}
                          handle={plan.client.handle}
                          logoInitials={plan.client.logoInitials}
                        />
                        <div className="mt-3 flex items-center justify-center gap-2">
                          <Pillar
                            name={activePost.pillar}
                            color={pillarColor[activePost.pillar]}
                          />
                          {activePost.campaign && (
                            <Badge variant="outline" className="font-normal">
                              {activePost.campaign}
                            </Badge>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

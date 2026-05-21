import { useOutletContext } from 'react-router'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Check, X } from 'lucide-react'
import type { ClientBundle } from '@/lib/client-data'

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-ink-muted">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}

function Pills({ items, tone = 'default' }: { items: string[]; tone?: 'default' | 'green' | 'blue' | 'red' }) {
  const map = {
    default: 'bg-paper-muted text-ink',
    green:   'bg-brand-green-100 text-brand-green-600',
    blue:    'bg-brand-blue-50 text-brand-blue',
    red:     'bg-rose-50 text-rose-700',
  } as const
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <Badge key={x} variant="secondary" className={map[tone]}>
          {x}
        </Badge>
      ))}
    </div>
  )
}

export default function ContextView() {
  const { brief } = useOutletContext<ClientBundle>()

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          Company context
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">{brief.company.name}</h1>
        <p className="text-ink-muted mt-1">
          {brief.company.industry} &middot; {brief.company.country}
          {brief.company.contact.telegram && (
            <> &middot; <span className="font-medium">{brief.company.contact.telegram}</span></>
          )}
        </p>
      </div>

      <Section title="Business" description="What they sell and what makes them different.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Model</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{brief.business.model}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Customer type</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{brief.business.customerType}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Main offer</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{brief.business.mainOffer}</p>
              {brief.business.bestSeller && (
                <p className="text-xs text-ink-muted mt-1">
                  Best-seller: {brief.business.bestSeller}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Differentiators</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1 list-disc list-inside">
                {brief.business.differentiators.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Separator />

      <Section title="Audience" description="Who we're talking to and what they care about.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {brief.audience.segments.map((s) => (
            <Card key={s.name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{s.name}</CardTitle>
                <CardDescription className="text-xs">{s.demo}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">{s.psycho}</p>
                <p className="text-xs text-ink-muted">Found on: {s.where}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Pain points</CardTitle>
            </CardHeader>
            <CardContent>
              <Pills items={brief.audience.painPoints} tone="red" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Desires</CardTitle>
            </CardHeader>
            <CardContent>
              <Pills items={brief.audience.desires} tone="green" />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Separator />

      <Section title="Voice" description="How we sound. Non-negotiable.">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Tone</CardTitle>
            </CardHeader>
            <CardContent>
              <Pills items={brief.voice.tone} tone="blue" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Words to use / avoid</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">Use</p>
                <Pills items={brief.voice.wordsToUse} tone="green" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">Avoid</p>
                <Pills items={brief.voice.wordsToAvoid} tone="red" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Check className="h-4 w-4 text-brand-green-500" /> Do
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {brief.voice.do.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="text-brand-green-500">&middot;</span>
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <X className="h-4 w-4 text-rose-500" /> Don't
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {brief.voice.dont.map((x) => (
                  <li key={x} className="flex gap-2">
                    <span className="text-rose-500">&middot;</span>
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Separator />

      <Section
        title="Viktor's boundaries"
        description="What he can do on his own vs. what needs a human."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-brand-green-200/60 bg-brand-green-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5 text-brand-green-600">
                <Check className="h-4 w-4" /> Without asking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {brief.boundaries.viktorCanDoWithoutAsking.map((x) => (
                  <li key={x}>&middot; {x}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-amber-200/60 bg-amber-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5 text-amber-700">
                <ShieldFlag /> Needs approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="text-sm space-y-1">
                {brief.boundaries.viktorNeedsApprovalFor.map((x) => (
                  <li key={x}>&middot; {x}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {brief.boundaries.sensitiveTopics.length > 0 && (
          <Card className="mt-4 border-rose-200/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-rose-700">Sensitive topics</CardTitle>
            </CardHeader>
            <CardContent>
              <Pills items={brief.boundaries.sensitiveTopics} tone="red" />
            </CardContent>
          </Card>
        )}
      </Section>

      <Separator />

      <Section title="What success looks like">
        <Card className="border-brand-blue-200/60 bg-brand-blue-50/30">
          <CardContent className="p-5">
            <p className="text-sm leading-relaxed">{brief.expectations}</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Metrics that matter">
        <Pills items={brief.metricsThatMatter} tone="blue" />
      </Section>
    </div>
  )
}

function ShieldFlag() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  )
}

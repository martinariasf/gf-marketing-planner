import { useParams, useOutletContext } from 'react-router'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Check, X } from 'lucide-react'
import type { ClientBundle } from '@/lib/client-data'
import { useEdit } from '@/lib/edit-store'
import { EditableText } from '@/components/editable/editable-text'
import { EditableTextarea } from '@/components/editable/editable-textarea'
import { EditablePills } from '@/components/editable/editable-pills'
import { EditableList } from '@/components/editable/editable-list'

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
        {description && <p className="text-sm text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

export default function ContextView() {
  const { brief } = useOutletContext<ClientBundle>()
  const { slug = '' } = useParams<{ slug: string }>()
  const { setField } = useEdit()

  // Tiny helper: bind a deep path on brief.json to (value, setValue).
  // Kept inline so the JSX stays readable.
  const set = (path: (string | number)[], value: unknown) =>
    setField(slug, 'brief', path, value)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          Company context
        </p>
        <EditableText
          as="h1"
          size="lg"
          value={brief.company.name}
          onChange={(v) => set(['company', 'name'], v)}
          placeholder="Company name"
          className="text-3xl font-bold text-brand-blue block"
        />
        <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-1.5">
          <EditableText
            value={brief.company.industry}
            onChange={(v) => set(['company', 'industry'], v)}
            placeholder="Industry"
          />
          <span>&middot;</span>
          <EditableText
            value={brief.company.country}
            onChange={(v) => set(['company', 'country'], v)}
            placeholder="Country"
          />
          {(brief.company.contact.telegram || brief.company.website) && (
            <>
              <span>&middot;</span>
              <EditableText
                value={brief.company.contact.telegram ?? ''}
                onChange={(v) => set(['company', 'contact', 'telegram'], v)}
                placeholder="@telegram"
                className="font-medium"
              />
            </>
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
              <EditableTextarea
                value={brief.business.model}
                onChange={(v) => set(['business', 'model'], v)}
                placeholder="e.g. B2B services, monthly retainer + workshops"
                rows={2}
                className="text-sm"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Customer type</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableTextarea
                value={brief.business.customerType}
                onChange={(v) => set(['business', 'customerType'], v)}
                placeholder="Who buys"
                rows={2}
                className="text-sm"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Main offer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <EditableTextarea
                value={brief.business.mainOffer}
                onChange={(v) => set(['business', 'mainOffer'], v)}
                placeholder="Headline offer"
                rows={2}
                className="text-sm"
              />
              <p className="text-xs text-ink-muted pt-1">
                Best-seller:{' '}
                <EditableText
                  value={brief.business.bestSeller ?? ''}
                  onChange={(v) => set(['business', 'bestSeller'], v)}
                  placeholder="Best-seller"
                />
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Differentiators</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList
                items={brief.business.differentiators}
                onChange={(v) => set(['business', 'differentiators'], v)}
                bullet="•"
                bulletClassName="text-brand-blue"
              />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Separator />

      <Section title="Audience" description="Who we're talking to and what they care about.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {brief.audience.segments.map((s, i) => (
            <Card key={`${s.name}-${i}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  <EditableText
                    value={s.name}
                    onChange={(v) =>
                      set(['audience', 'segments', i, 'name'], v)
                    }
                    placeholder="Segment name"
                  />
                </CardTitle>
                <CardDescription className="text-xs">
                  <EditableText
                    value={s.demo}
                    onChange={(v) =>
                      set(['audience', 'segments', i, 'demo'], v)
                    }
                    placeholder="Demographics"
                  />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <EditableTextarea
                  value={s.psycho}
                  onChange={(v) =>
                    set(['audience', 'segments', i, 'psycho'], v)
                  }
                  placeholder="Psychographics"
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-ink-muted">
                  Found on:{' '}
                  <EditableText
                    value={s.where}
                    onChange={(v) =>
                      set(['audience', 'segments', i, 'where'], v)
                    }
                    placeholder="Where to find them"
                  />
                </p>
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
              <EditablePills
                items={brief.audience.painPoints}
                onChange={(v) => set(['audience', 'painPoints'], v)}
                tone="red"
                placeholder="Add a pain point"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Desires</CardTitle>
            </CardHeader>
            <CardContent>
              <EditablePills
                items={brief.audience.desires}
                onChange={(v) => set(['audience', 'desires'], v)}
                tone="green"
                placeholder="Add a desire"
              />
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
              <EditablePills
                items={brief.voice.tone}
                onChange={(v) => set(['voice', 'tone'], v)}
                tone="blue"
                placeholder="Add a tone trait"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Words to use / avoid</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">Use</p>
                <EditablePills
                  items={brief.voice.wordsToUse}
                  onChange={(v) => set(['voice', 'wordsToUse'], v)}
                  tone="green"
                  placeholder="Word to use"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">Avoid</p>
                <EditablePills
                  items={brief.voice.wordsToAvoid}
                  onChange={(v) => set(['voice', 'wordsToAvoid'], v)}
                  tone="red"
                  placeholder="Word to avoid"
                />
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
              <EditableList
                items={brief.voice.do}
                onChange={(v) => set(['voice', 'do'], v)}
                bullet="·"
                bulletClassName="text-brand-green-500"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <X className="h-4 w-4 text-rose-500" /> Don't
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList
                items={brief.voice.dont}
                onChange={(v) => set(['voice', 'dont'], v)}
                bullet="·"
                bulletClassName="text-rose-500"
              />
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
              <EditableList
                items={brief.boundaries.viktorCanDoWithoutAsking}
                onChange={(v) =>
                  set(['boundaries', 'viktorCanDoWithoutAsking'], v)
                }
                bullet="·"
                bulletClassName="text-brand-green-600"
              />
            </CardContent>
          </Card>
          <Card className="border-amber-200/60 bg-amber-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5 text-amber-700">
                <ShieldFlag /> Needs approval
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EditableList
                items={brief.boundaries.viktorNeedsApprovalFor}
                onChange={(v) =>
                  set(['boundaries', 'viktorNeedsApprovalFor'], v)
                }
                bullet="·"
                bulletClassName="text-amber-700"
              />
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4 border-rose-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-rose-700">
              Sensitive topics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EditablePills
              items={brief.boundaries.sensitiveTopics}
              onChange={(v) => set(['boundaries', 'sensitiveTopics'], v)}
              tone="red"
              placeholder="Add a sensitive topic"
            />
          </CardContent>
        </Card>
      </Section>

      <Separator />

      <Section title="What success looks like">
        <Card className="border-brand-blue-200/60 bg-brand-blue-50/30">
          <CardContent className="p-5">
            <EditableTextarea
              value={brief.expectations}
              onChange={(v) => set(['expectations'], v)}
              placeholder="What does success look like for this client?"
              rows={4}
              className="text-sm leading-relaxed"
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Metrics that matter">
        <EditablePills
          items={brief.metricsThatMatter}
          onChange={(v) => set(['metricsThatMatter'], v)}
          tone="blue"
          placeholder="Add a metric"
        />
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

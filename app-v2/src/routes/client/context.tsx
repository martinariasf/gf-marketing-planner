import { useRef, useState } from 'react'
import { useParams, useOutletContext } from 'react-router'
import { toast } from 'sonner'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Check, X, Palette, Plus, Trash2, Upload, Loader2 } from 'lucide-react'
import type { ClientBundle } from '@/lib/client-data'
import type { SocialNetwork } from '@/types/brief'
import { SOCIAL_NETWORKS } from '@/types/brief'
import { isApiEnabled, apiUploadInspiration } from '@/lib/api-client'
import { useEdit } from '@/lib/edit-store'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { SECTION_ACCENT, type AppSection } from '@/lib/section-accent'
// GF-20: shared brand-glyph paths (was duplicated here and in kpi-card.tsx).
import { CHANNEL_PATHS } from '@/components/channel-icon'
import { EditableText } from '@/components/editable/editable-text'
import { EditableTextarea } from '@/components/editable/editable-textarea'
import { EditablePills } from '@/components/editable/editable-pills'
import { EditableList } from '@/components/editable/editable-list'

function Section({
  title,
  description,
  accent,
  children,
}: {
  title: string
  description?: string
  /** Per-section accent key — drives the type-coloured icon chip (matches ST2). */
  accent?: AppSection
  children: React.ReactNode
}) {
  const a = accent ? SECTION_ACCENT[accent] : undefined
  const Icon = a?.icon
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2">
        {a && Icon && (
          <span
            className={cn(
              'mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-l-2',
              a.bg,
              a.border,
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', a.iconCls)} />
          </span>
        )}
        <div>
          <h2 className={cn('text-lg font-semibold', a?.labelCls)}>{title}</h2>
          {description && <p className="text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export default function ContextView() {
  const t = useT()
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
          {t('context.eyebrow')}
        </p>
        <EditableText
          as="h1"
          size="lg"
          value={brief.company.name}
          onChange={(v) => set(['company', 'name'], v)}
          placeholder={t('context.companyName')}
          className="text-3xl font-bold text-brand-blue block"
        />
        <p className="text-ink-muted mt-1 flex flex-wrap items-center gap-1.5">
          <EditableText
            value={brief.company.industry}
            onChange={(v) => set(['company', 'industry'], v)}
            placeholder={t('context.industry')}
          />
          <span>&middot;</span>
          <EditableText
            value={brief.company.country}
            onChange={(v) => set(['company', 'country'], v)}
            placeholder={t('context.country')}
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

      <Section title={t('context.businessTitle')} description={t('context.businessDesc')} accent="business">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.model')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableTextarea
                value={brief.business.model}
                onChange={(v) => set(['business', 'model'], v)}
                placeholder={t('context.modelPlaceholder')}
                rows={2}
                className="text-sm"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.customerType')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EditableTextarea
                value={brief.business.customerType}
                onChange={(v) => set(['business', 'customerType'], v)}
                placeholder={t('context.whoBuys')}
                rows={2}
                className="text-sm"
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.mainOffer')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <EditableTextarea
                value={brief.business.mainOffer}
                onChange={(v) => set(['business', 'mainOffer'], v)}
                placeholder={t('context.headlineOffer')}
                rows={2}
                className="text-sm"
              />
              <p className="text-xs text-ink-muted pt-1">
                {t('context.bestSellerLabel')}{' '}
                <EditableText
                  value={brief.business.bestSeller ?? ''}
                  onChange={(v) => set(['business', 'bestSeller'], v)}
                  placeholder={t('context.bestSeller')}
                />
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.differentiators')}</CardTitle>
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

      <Section title={t('context.audienceTitle')} description={t('context.audienceDesc')} accent="audience">
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
                    placeholder={t('context.segmentName')}
                  />
                </CardTitle>
                <CardDescription className="text-xs">
                  <EditableText
                    value={s.demo}
                    onChange={(v) =>
                      set(['audience', 'segments', i, 'demo'], v)
                    }
                    placeholder={t('context.demographics')}
                  />
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <EditableTextarea
                  value={s.psycho}
                  onChange={(v) =>
                    set(['audience', 'segments', i, 'psycho'], v)
                  }
                  placeholder={t('context.psychographics')}
                  rows={3}
                  className="text-sm"
                />
                <p className="text-xs text-ink-muted">
                  {t('context.foundOn')}{' '}
                  <EditableText
                    value={s.where}
                    onChange={(v) =>
                      set(['audience', 'segments', i, 'where'], v)
                    }
                    placeholder={t('context.whereFind')}
                  />
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.painPoints')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EditablePills
                items={brief.audience.painPoints}
                onChange={(v) => set(['audience', 'painPoints'], v)}
                tone="red"
                placeholder={t('context.addPainPoint')}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.desires')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EditablePills
                items={brief.audience.desires}
                onChange={(v) => set(['audience', 'desires'], v)}
                tone="green"
                placeholder={t('context.addDesire')}
              />
            </CardContent>
          </Card>
        </div>
      </Section>

      <Separator />

      <Section title={t('context.voiceTitle')} description={t('context.voiceDesc')} accent="voice">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.tone')}</CardTitle>
            </CardHeader>
            <CardContent>
              <EditablePills
                items={brief.voice.tone}
                onChange={(v) => set(['voice', 'tone'], v)}
                tone="blue"
                placeholder={t('context.addToneTrait')}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.wordsUseAvoid')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{t('context.use')}</p>
                <EditablePills
                  items={brief.voice.wordsToUse}
                  onChange={(v) => set(['voice', 'wordsToUse'], v)}
                  tone="green"
                  placeholder={t('context.wordToUse')}
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{t('context.avoid')}</p>
                <EditablePills
                  items={brief.voice.wordsToAvoid}
                  onChange={(v) => set(['voice', 'wordsToAvoid'], v)}
                  tone="red"
                  placeholder={t('context.wordToAvoid')}
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Check className="h-4 w-4 text-brand-green-500" /> {t('context.do')}
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
                <X className="h-4 w-4 text-rose-500" /> {t('context.dont')}
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
        title={t('context.boundariesTitle')}
        description={t('context.boundariesDesc')}
        accent="boundaries"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-brand-green-200/60 bg-brand-green-50/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5 text-brand-green-600">
                <Check className="h-4 w-4" /> {t('context.withoutAsking')}
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
                <ShieldFlag /> {t('context.needsApproval')}
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
              {t('context.sensitiveTopics')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <EditablePills
              items={brief.boundaries.sensitiveTopics}
              onChange={(v) => set(['boundaries', 'sensitiveTopics'], v)}
              tone="red"
              placeholder={t('context.addSensitiveTopic')}
            />
          </CardContent>
        </Card>
      </Section>

      <Separator />

      <ActiveChannelsSection
        profiles={brief.channels.profiles ?? []}
        onChange={(next) => set(['channels', 'profiles'], next)}
      />

      <Separator />

      <BrandingSection
        slug={slug}
        branding={brief.branding}
        set={(path, value) => set(['branding', ...path], value)}
      />
    </div>
  )
}

// ─── Active Channels ────────────────────────────────────────────────────────

const NETWORK_META: Record<SocialNetwork, { label: string; color: string }> = {
  linkedin:  { label: 'LinkedIn',  color: 'text-[#0A66C2]' },
  instagram: { label: 'Instagram', color: 'text-[#E1306C]' },
  facebook:  { label: 'Facebook',  color: 'text-[#1877F2]' },
  x:         { label: 'X',         color: 'text-foreground' },
  tiktok:    { label: 'TikTok',    color: 'text-foreground' },
}

// Distinct brand glyphs (lucide-react has no social icons). Each path uses
// fill="currentColor" so NETWORK_META.color drives the brand tint. The paths
// themselves live in the shared channel-icon module (GF-20 dedupe).
const NETWORK_PATHS = CHANNEL_PATHS

function NetworkIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn('h-5 w-5 shrink-0', className)}
    >
      <path d={NETWORK_PATHS[network]} />
    </svg>
  )
}

function ActiveChannelsSection({
  profiles,
  onChange,
}: {
  profiles: Array<{ network: SocialNetwork; url: string }>
  onChange: (next: Array<{ network: SocialNetwork; url: string }>) => void
}) {
  const t = useT()
  const { editMode } = useEdit()

  return (
    <Section
      title={t('context.activeChannels')}
      description={t('context.activeChannelsDesc')}
      accent="channels"
    >
      <Card>
        <CardContent className="pt-4 space-y-3">
          {profiles.length === 0 && !editMode && (
            <p className="text-xs text-ink-muted italic">{t('context.noChannels')}</p>
          )}

          {profiles.map((p, i) => (
            <div key={i} className="flex items-center gap-3">
              <NetworkIcon
                network={p.network}
                className={NETWORK_META[p.network].color}
              />
              <span className="text-sm font-medium w-24 shrink-0">
                {NETWORK_META[p.network].label}
              </span>

              {editMode ? (
                <>
                  {/* Network picker */}
                  <select
                    value={p.network}
                    onChange={(e) => {
                      const next = profiles.map((x, j) =>
                        j === i ? { ...x, network: e.target.value as SocialNetwork } : x,
                      )
                      onChange(next)
                    }}
                    className="rounded border border-amber-300 bg-amber-50/60 px-1.5 py-0.5 text-xs outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60"
                    aria-label={t('context.selectNetwork')}
                  >
                    {SOCIAL_NETWORKS.map((n) => (
                      <option key={n} value={n}>{NETWORK_META[n].label}</option>
                    ))}
                  </select>
                  {/* URL input */}
                  <input
                    type="url"
                    value={p.url}
                    placeholder="https://…"
                    onChange={(e) => {
                      const next = profiles.map((x, j) =>
                        j === i ? { ...x, url: e.target.value } : x,
                      )
                      onChange(next)
                    }}
                    className="flex-1 rounded border border-amber-300 bg-amber-50/60 px-1.5 py-0.5 text-xs font-mono outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60"
                    aria-label={t('context.profileUrl')}
                  />
                  <button
                    type="button"
                    onClick={() => onChange(profiles.filter((_, j) => j !== i))}
                    className="text-ink-muted hover:text-rose-600 transition-colors"
                    aria-label={t('context.removeChannel')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-mono text-brand-blue hover:underline truncate flex-1"
                  >
                    {p.url}
                  </a>
                ) : (
                  <span className="text-xs text-ink-muted italic flex-1">—</span>
                )
              )}
            </div>
          ))}

          {editMode && (
            <button
              type="button"
              onClick={() =>
                onChange([...profiles, { network: 'linkedin', url: '' }])
              }
              className="text-xs text-brand-blue hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> {t('context.addChannel')}
            </button>
          )}
        </CardContent>
      </Card>
    </Section>
  )
}

// ─── Branding ───────────────────────────────────────────────────────────────

const DEFAULT_BRANDING = {
  colors: [] as Array<{ name: string; hex: string }>,
  typography: { headingFont: '', bodyFont: '' },
  logos: [] as Array<{ variant: string; url: string }>,
  toneKeywords: [] as string[],
}

function BrandingSection({
  slug,
  branding,
  set,
}: {
  slug: string
  branding: NonNullable<ClientBundle['brief']['branding']> | undefined
  set: (path: (string | number)[], value: unknown) => void
}) {
  const t = useT()
  const { editMode } = useEdit()
  const b = { ...DEFAULT_BRANDING, ...(branding ?? {}) }
  // Defensive: a malformed local edit could leave null/non-object entries in
  // these arrays. Filter them so a single bad entry can't crash the render.
  const colors = (b.colors ?? []).filter(
    (c): c is { name: string; hex: string } => !!c && typeof c === 'object',
  )
  const logos = (b.logos ?? []).filter(
    (l): l is { variant: string; url: string } => !!l && typeof l === 'object',
  )

  // Drag-drop logo upload. Files are stored via the same per-client asset
  // endpoint the Inspiration board uses, then appended as logo entries so they
  // render immediately. Only available in edit mode against the live API.
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoDragOver, setLogoDragOver] = useState(false)
  const logoFileRef = useRef<HTMLInputElement | null>(null)

  const uploadLogos = async (files: FileList | File[]) => {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (images.length === 0) {
      toast.error(t('inspiration.imagesOnly'))
      return
    }
    setLogoUploading(true)
    try {
      const uploaded: Array<{ variant: string; url: string }> = []
      for (const file of images) {
        const item = await apiUploadInspiration(slug, file, 'logo')
        const variant = file.name.replace(/\.[^.]+$/, '').trim() || 'Logo'
        uploaded.push({ variant, url: item.url })
      }
      set(['logos'], [...logos, ...uploaded])
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('inspiration.uploadFailed'))
    } finally {
      setLogoUploading(false)
    }
  }

  return (
    <Section
      title={t('context.brandingTitle')}
      description={t('context.brandingDesc')}
      accent="branding"
    >
      {/* Colors */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Palette className="h-4 w-4 text-brand-blue" /> {t('context.brandColors')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {colors.length === 0 && !editMode && (
            <p className="text-xs text-ink-muted italic">{t('context.noColors')}</p>
          )}
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={normalizeHex(c.hex)}
                onChange={(e) =>
                  set(['colors'], colors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))
                }
                disabled={!editMode}
                className="h-8 w-10 rounded border border-border-subtle cursor-pointer disabled:cursor-default"
                aria-label={`Pick ${c.name || 'color'}`}
              />
              <EditableText
                value={c.name}
                onChange={(v) =>
                  set(['colors'], colors.map((x, j) => (j === i ? { ...x, name: v } : x)))
                }
                placeholder={t('context.colorNameHint')}
                className="text-sm flex-1"
              />
              <EditableText
                value={c.hex}
                onChange={(v) =>
                  set(['colors'], colors.map((x, j) => (j === i ? { ...x, hex: v } : x)))
                }
                placeholder="#000000"
                className="text-xs font-mono w-24"
              />
              {editMode && (
                <button
                  type="button"
                  onClick={() => set(['colors'], colors.filter((_, j) => j !== i))}
                  className="text-ink-muted hover:text-rose-600 transition-colors"
                  aria-label={t('context.removeColor')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {editMode && (
            <button
              type="button"
              onClick={() => set(['colors'], [...colors, { name: '', hex: '#1e40af' }])}
              className="text-xs text-brand-blue hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> {t('context.addColor')}
            </button>
          )}
        </CardContent>
      </Card>

      {/* Typography + Tone */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('context.typography')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{t('context.headingFont')}</p>
              <EditableText
                value={b.typography.headingFont}
                onChange={(v) => set(['typography', 'headingFont'], v)}
                placeholder={t('context.headingFontHint')}
                className="text-sm"
              />
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">{t('context.bodyFont')}</p>
              <EditableText
                value={b.typography.bodyFont}
                onChange={(v) => set(['typography', 'bodyFont'], v)}
                placeholder={t('context.bodyFontHint')}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('context.toneKeywords')}</CardTitle>
            <CardDescription className="text-xs">
              {t('context.toneKeywordsDesc')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditablePills
              items={b.toneKeywords}
              onChange={(v) => set(['toneKeywords'], v)}
              tone="blue"
              placeholder={t('context.addKeyword')}
            />
          </CardContent>
        </Card>
      </div>

      {/* Logos */}
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">{t('context.logos')}</CardTitle>
          <CardDescription className="text-xs">
            {t('context.logosDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {logos.length === 0 && !editMode && (
            <p className="text-xs text-ink-muted italic">{t('context.noLogos')}</p>
          )}
          {logos.map((logo, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-14 w-14 rounded border border-border-subtle bg-paper-muted flex items-center justify-center overflow-hidden shrink-0">
                {logo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo.url} alt={logo.variant || 'logo'} className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-[9px] text-ink-muted">{t('context.noUrl')}</span>
                )}
              </div>
              <div className="flex-1 space-y-1">
                <EditableText
                  value={logo.variant}
                  onChange={(v) =>
                    set(['logos'], logos.map((x, j) => (j === i ? { ...x, variant: v } : x)))
                  }
                  placeholder={t('context.logoVariantHint')}
                  className="text-sm"
                />
                <EditableText
                  value={logo.url}
                  onChange={(v) =>
                    set(['logos'], logos.map((x, j) => (j === i ? { ...x, url: v } : x)))
                  }
                  placeholder="https://…"
                  className="text-xs font-mono text-ink-muted"
                />
              </div>
              {editMode && (
                <button
                  type="button"
                  onClick={() => set(['logos'], logos.filter((_, j) => j !== i))}
                  className="text-ink-muted hover:text-rose-600 transition-colors"
                  aria-label={t('context.removeLogo')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {editMode && isApiEnabled && (
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setLogoDragOver(true)
              }}
              onDragLeave={() => setLogoDragOver(false)}
              onDrop={(e) => {
                e.preventDefault()
                setLogoDragOver(false)
                if (e.dataTransfer.files?.length) void uploadLogos(e.dataTransfer.files)
              }}
              onClick={() => logoFileRef.current?.click()}
              className={cn(
                'rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors',
                logoDragOver
                  ? 'border-brand-blue bg-brand-blue-50/50'
                  : 'border-border-subtle hover:border-brand-blue/50 hover:bg-paper-muted/50',
              )}
            >
              <input
                ref={logoFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void uploadLogos(e.target.files)
                  e.target.value = ''
                }}
              />
              <div className="flex flex-col items-center gap-1 text-ink-muted">
                {logoUploading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-brand-blue" />
                ) : (
                  <Upload className="h-5 w-5" />
                )}
                <p className="text-xs">
                  <span className="text-brand-blue font-medium">{t('inspiration.dragDrop')}</span>{t('context.logoDropHint')}
                </p>
              </div>
            </div>
          )}
          {editMode && (
            <button
              type="button"
              onClick={() => set(['logos'], [...logos, { variant: '', url: '' }])}
              className="text-xs text-brand-blue hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> {t('context.addLogo')}
            </button>
          )}
        </CardContent>
      </Card>
    </Section>
  )
}

// Color inputs need a 6-digit hex. Coerce free-text values (3-digit, missing #,
// named colors) into something the native picker won't reject.
function normalizeHex(hex: string): string {
  if (!hex) return '#000000'
  const h = hex.trim()
  if (/^#[0-9a-f]{6}$/i.test(h)) return h
  if (/^#[0-9a-f]{3}$/i.test(h)) {
    return '#' + h.slice(1).split('').map((c) => c + c).join('')
  }
  return '#000000'
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

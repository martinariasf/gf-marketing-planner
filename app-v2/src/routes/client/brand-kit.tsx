import { useOutletContext, useParams } from 'react-router'
import { motion } from 'framer-motion'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Palette, Plus, Trash2 } from 'lucide-react'
import type { ClientBundle } from '@/lib/client-data'
import { useEdit } from '@/lib/edit-store'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { EditableText } from '@/components/editable/editable-text'
import { EditablePills } from '@/components/editable/editable-pills'

// Mirror the same default used in context.tsx
const DEFAULT_BRANDING = {
  colors: [] as Array<{ name: string; hex: string }>,
  typography: { headingFont: '', bodyFont: '' },
  logos: [] as Array<{ variant: string; url: string }>,
  toneKeywords: [] as string[],
}

// Color inputs need a 6-digit hex.
function normalizeHex(hex: string): string {
  if (!hex) return '#000000'
  const h = hex.trim()
  if (/^#[0-9a-f]{6}$/i.test(h)) return h
  if (/^#[0-9a-f]{3}$/i.test(h)) {
    return '#' + h.slice(1).split('').map((c) => c + c).join('')
  }
  return '#000000'
}

export default function BrandKitView() {
  const t = useT()
  const { brief } = useOutletContext<ClientBundle>()
  const { slug = '' } = useParams<{ slug: string }>()
  const { editMode, setField } = useEdit()

  const set = (path: (string | number)[], value: unknown) =>
    setField(slug, 'brief', ['branding', ...path], value)

  const b = { ...DEFAULT_BRANDING, ...(brief.branding ?? {}) }
  const colors = b.colors
  const logos = b.logos

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          {t('brandKit.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">
          {t('brandKit.heading')}
        </h1>
        <p className="text-ink-muted mt-1 text-sm">{t('brandKit.intro')}</p>
      </motion.div>

      {/* Brand Colors */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{t('context.brandColors')}</h2>
          <p className="text-sm text-ink-muted">{t('brandKit.colorsDesc')}</p>
        </div>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <Palette className="h-4 w-4 text-brand-blue" />
              {t('context.brandColors')}
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
                  onChange={(e) => set(['colors', i, 'hex'], e.target.value)}
                  disabled={!editMode}
                  className="h-8 w-10 rounded border border-border-subtle cursor-pointer disabled:cursor-default"
                  aria-label={`Pick ${c.name || 'color'}`}
                />
                <div
                  className="h-8 w-8 rounded border border-border-subtle shrink-0"
                  style={{ backgroundColor: normalizeHex(c.hex) }}
                />
                <EditableText
                  value={c.name}
                  onChange={(v) => set(['colors', i, 'name'], v)}
                  placeholder={t('context.colorNameHint')}
                  className="text-sm flex-1"
                />
                <EditableText
                  value={c.hex}
                  onChange={(v) => set(['colors', i, 'hex'], v)}
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
      </section>

      {/* Typography */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('context.typography')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t('context.typography')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                  {t('context.headingFont')}
                </p>
                <EditableText
                  value={b.typography.headingFont}
                  onChange={(v) => set(['typography', 'headingFont'], v)}
                  placeholder={t('context.headingFontHint')}
                  className="text-sm"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-ink-muted mb-1">
                  {t('context.bodyFont')}
                </p>
                <EditableText
                  value={b.typography.bodyFont}
                  onChange={(v) => set(['typography', 'bodyFont'], v)}
                  placeholder={t('context.bodyFontHint')}
                  className="text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Tone keywords */}
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
      </section>

      {/* Logos */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('context.logos')}</h2>
        <Card>
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
                <div
                  className={cn(
                    'h-14 w-14 rounded border border-border-subtle bg-paper-muted flex items-center justify-center overflow-hidden shrink-0',
                  )}
                >
                  {logo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={logo.url}
                      alt={logo.variant || 'logo'}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-[9px] text-ink-muted">{t('context.noUrl')}</span>
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <EditableText
                    value={logo.variant}
                    onChange={(v) => set(['logos', i, 'variant'], v)}
                    placeholder={t('context.logoVariantHint')}
                    className="text-sm"
                  />
                  <EditableText
                    value={logo.url}
                    onChange={(v) => set(['logos', i, 'url'], v)}
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
      </section>
    </div>
  )
}

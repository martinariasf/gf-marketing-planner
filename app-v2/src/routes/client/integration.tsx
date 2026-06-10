// Integration / Configuration tab.
//
// Surfaces everything other tools (Telegram bots, Make.com / n8n workflows,
// custom scripts) need to talk to mp-staging-api on behalf of this client:
//
//   - API base URL + docs link
//   - Agent token (click-to-reveal, copyable)
//   - Asset workflow paths (where bots should save images, what manifest to
//     append to)
//   - Ready-to-paste curl examples
//
// Read-only for now. Token rotation / issuance is a future hardening item.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Bot,
  Image as ImageIcon,
  AlertTriangle,
  Send,
  Trash2,
  ShieldCheck,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import {
  apiLoadIntegration,
  apiSavePostizKey,
  apiDeletePostizKey,
  type IntegrationInfo,
  type PostizStatus,
} from '@/lib/api-client'
import { useT } from '@/lib/i18n'

export default function IntegrationView() {
  const t = useT()
  const { slug = '' } = useParams<{ slug: string }>()
  const [info, setInfo] = useState<IntegrationInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) return
    apiLoadIntegration(slug)
      .then(setInfo)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [slug])

  if (error) {
    return (
      <Card className="border-rose-200 bg-rose-50/40">
        <CardContent className="p-5 text-sm text-rose-700">
          {t('integration.couldNotLoad', { error })}
        </CardContent>
      </Card>
    )
  }

  if (!info) {
    return (
      <div className="flex items-center gap-2 text-ink-muted text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('integration.loadingInfo')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Toaster position="bottom-right" />

      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          {t('integration.eyebrow')}
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">
          {t('integration.heading')}
        </h1>
        <p className="text-ink-muted mt-1 text-sm max-w-2xl">
          {t('integration.intro')}
        </p>
        <div className="mt-3 flex items-start gap-2 rounded-md border border-brand-blue-200/60 bg-brand-blue-50/40 px-3 py-2 text-xs text-ink max-w-2xl">
          <Bot className="h-4 w-4 text-brand-blue shrink-0 mt-0.5" />
          <p>
            <strong>{t('integration.forWhoTitle')}</strong>{t('integration.forWhoBody')}
          </p>
        </div>
      </div>

      {/* ── API endpoint ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-blue" />
          {t('integration.restApi')}
        </h2>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Field label={t('integration.baseUrl')} value={info.apiBase} />
            <Field
              label={t('integration.clientSlug')}
              value={info.slug}
              hint={t('integration.slugHint')}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={info.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-brand-blue hover:underline"
              >
                {t('integration.openapiDocs')} <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={info.openapiUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-brand-blue hover:underline"
              >
                {t('integration.openapiJson')} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Token ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand-blue" />
          {t('integration.agentToken')}
        </h2>
        {info.agentToken ? (
          <TokenCard token={info.agentToken} />
        ) : (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-5 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium mb-1">{t('integration.noToken')}</p>
                <p className="text-xs">{info.tokenHint}</p>
              </div>
            </CardContent>
          </Card>
        )}
        <p className="text-xs text-ink-muted">
          {t('integration.bearerHint.prefix')}<code>Authorization: Bearer &lt;token&gt;</code>{t('integration.bearerHint.suffix', { slug: info.slug })}
        </p>
      </section>

      <Separator />

      {/* ── Asset workflow ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-brand-blue" />
          {t('integration.imagesTitle')}
        </h2>
        <Card>
          <CardContent className="p-5 space-y-3 text-sm">
            <p className="text-xs text-ink-muted bg-paper-muted rounded px-2 py-1.5">
              {t('integration.imagesOptional')}
            </p>
            <p>
              {t('integration.imagesIntro')}
            </p>
            <Field label={t('integration.assetsDir')} value={info.assetsDir} />
            <Field label={t('integration.manifestFile')} value={info.assetsManifestPath} />
            <p className="text-xs text-ink-muted leading-relaxed">
              {t('integration.hermesNote')}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Examples ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t('integration.quickStart')}</h2>
        <CodeBlock label={t('integration.curlReadBrief')} code={info.examples.curlReadBrief} />
        <CodeBlock label={t('integration.curlPatchPost')} code={info.examples.curlPatchPost} />
        <CodeBlock label={t('integration.curlSetApproval')} code={info.examples.curlSetApproval} />
      </section>

      <Separator />

      {/* ── Postiz API key (GF-11) ──────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Send className="h-4 w-4 text-brand-blue" />
          {t('integration.postizTitle')}
        </h2>
        <PostizCard slug={info.slug} initial={info.postiz} />
      </section>

      <p className="text-[11px] text-ink-muted">
        {t('integration.everyWrite')}
      </p>
    </div>
  )
}

function PostizCard({ slug, initial }: { slug: string; initial: PostizStatus }) {
  const t = useT()
  const [status, setStatus] = useState<PostizStatus>(initial)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)

  const save = async () => {
    const apiKey = value.trim()
    if (!apiKey || saving) return
    setSaving(true)
    try {
      const next = await apiSavePostizKey(slug, apiKey)
      setStatus(next)
      setValue('') // never keep the plaintext around after a successful save
      toast.success(t('integration.postizSaved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (removing) return
    setRemoving(true)
    try {
      const next = await apiDeletePostizKey(slug)
      setStatus(next)
      toast.success(t('integration.postizRemoved'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-3 text-sm">
        <p className="text-ink-muted text-xs max-w-2xl">{t('integration.postizIntro')}</p>

        {status.configured && (
          <div className="flex items-center gap-2 rounded-md border border-brand-green-200/60 bg-brand-green-50/40 px-3 py-2 text-xs">
            <ShieldCheck className="h-4 w-4 text-brand-green-600 shrink-0" />
            <span>
              {t('integration.postizConfigured', { last4: status.last4 ?? '••••' })}
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="password"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('integration.postizPlaceholder')}
            className="flex-1 min-w-0 px-3 py-1.5 text-xs font-mono rounded-lg border border-border-subtle bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
          <Button onClick={save} disabled={!value.trim() || saving} size="sm" className="h-9 shrink-0">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline ml-1.5">{t('integration.postizSave')}</span>
          </Button>
          {status.configured && (
            <Button
              onClick={remove}
              disabled={removing}
              variant="outline"
              size="sm"
              className="h-9 shrink-0 text-rose-600 hover:text-rose-700"
              title={t('integration.postizRemove')}
              aria-label={t('integration.postizRemove')}
            >
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </Button>
          )}
        </div>

        <p className="flex items-start gap-1.5 text-[11px] text-ink-muted">
          <Eye className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" />
          {t('integration.postizNeverShown')}
        </p>
      </CardContent>
    </Card>
  )
}

function Field({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
    toast(t('integration.copied', { label }), { duration: 1000 })
  }
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-ink-muted mb-1">
        {label}
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 text-xs bg-paper-muted border border-border-subtle rounded px-2 py-1.5 font-mono break-all">
          {value}
        </code>
        <Button variant="outline" size="sm" onClick={copy} className="h-8 shrink-0">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      {hint && <p className="text-[11px] text-ink-muted mt-1">{hint}</p>}
    </div>
  )
}

function TokenCard({ token }: { token: string }) {
  const t = useT()
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const masked = token.slice(0, 6) + '•'.repeat(Math.max(0, token.length - 10)) + token.slice(-4)
  const copy = () => {
    navigator.clipboard.writeText(token).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
    toast(t('integration.tokenCopied'), { duration: 1200 })
  }
  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 text-xs bg-paper-muted border border-border-subtle rounded px-2 py-1.5 font-mono break-all">
            {revealed ? token : masked}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevealed((v) => !v)}
            className="h-8 shrink-0"
            title={revealed ? t('integration.hide') : t('integration.reveal')}
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="outline" size="sm" onClick={copy} className="h-8 shrink-0">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="bg-brand-blue-50 text-brand-blue text-[10px]">
            {t('integration.roleAgent')}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {t('integration.scopeThisClient')}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {t('integration.noExpiry')}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
    toast(t('integration.copied', { label }), { duration: 1000 })
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        <Button variant="ghost" size="sm" onClick={copy} className="h-6 px-2 text-[11px]">
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
      <pre className="text-[11px] bg-paper-muted border border-border-subtle rounded p-3 overflow-x-auto font-mono leading-relaxed">
        {code}
      </pre>
    </div>
  )
}

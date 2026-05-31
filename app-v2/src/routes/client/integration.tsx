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
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { apiLoadIntegration, type IntegrationInfo } from '@/lib/api-client'

export default function IntegrationView() {
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
          Could not load integration info: {error}
        </CardContent>
      </Card>
    )
  }

  if (!info) {
    return (
      <div className="flex items-center gap-2 text-ink-muted text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading integration info…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Toaster position="bottom-right" />

      <div>
        <p className="text-xs uppercase tracking-wider text-ink-muted mb-1">
          Integration
        </p>
        <h1 className="text-3xl font-bold text-brand-blue">
          How other bots talk to this client
        </h1>
        <p className="text-ink-muted mt-1 text-sm max-w-2xl">
          Paste these credentials into Telegram bots, Make.com / n8n flows,
          or your own scripts. The API is the single source of truth — every
          write is audited and shows up in this dashboard live.
        </p>
      </div>

      {/* ── API endpoint ─────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-brand-blue" />
          REST API
        </h2>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Field label="Base URL" value={info.apiBase} />
            <Field
              label="Client slug"
              value={info.slug}
              hint="Always included in the path. Tokens are scoped per slug."
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={info.docsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-brand-blue hover:underline"
              >
                OpenAPI docs <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={info.openapiUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-brand-blue hover:underline"
              >
                openapi.json <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Token ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Bot className="h-4 w-4 text-brand-blue" />
          Agent token
        </h2>
        {info.agentToken ? (
          <TokenCard token={info.agentToken} />
        ) : (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-5 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium mb-1">No agent token issued yet</p>
                <p className="text-xs">{info.tokenHint}</p>
              </div>
            </CardContent>
          </Card>
        )}
        <p className="text-xs text-ink-muted">
          Send this as <code>Authorization: Bearer &lt;token&gt;</code> on
          every API call. The token is scoped to <strong>{info.slug}</strong>{' '}
          only — it cannot read or write other clients' data.
        </p>
      </section>

      <Separator />

      {/* ── Asset workflow ──────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-brand-blue" />
          Where bots should save images
        </h2>
        <Card>
          <CardContent className="p-5 space-y-3 text-sm">
            <p>
              Generated images go into the client's <code>assets/</code>{' '}
              folder so they appear in the dashboard's{' '}
              <strong>Assets</strong> tab. After saving the file, append a
              row to <code>manifest.json</code> with id, filename, kind,
              designBrief and the post id(s) it's used in.
            </p>
            <Field label="Assets directory" value={info.assetsDir} />
            <Field label="Manifest file" value={info.assetsManifestPath} />
            <p className="text-xs text-ink-muted leading-relaxed">
              For the Hermes Telegram bot this is bind-mounted at{' '}
              <code>/opt/marketing-planner/client/assets/</code>. The bot
              writes the image file, runs <code>jq</code> or Python to
              append a manifest row, and the SPA Assets page picks it up on
              the next refetch.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ── Examples ────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Quick start</h2>
        <CodeBlock label="Read the brief" code={info.examples.curlReadBrief} />
        <CodeBlock label="Edit a post" code={info.examples.curlPatchPost} />
        <CodeBlock label="Approve a post" code={info.examples.curlSetApproval} />
      </section>

      <p className="text-[11px] text-ink-muted">
        Every write through this token shows up in <strong>Approvals →
        Recent activity</strong> with <code>via</code> indicating the
        source.
      </p>
    </div>
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
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
    toast(`${label} copied`, { duration: 1000 })
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
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const masked = token.slice(0, 6) + '•'.repeat(Math.max(0, token.length - 10)) + token.slice(-4)
  const copy = () => {
    navigator.clipboard.writeText(token).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
    toast('Agent token copied', { duration: 1200 })
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
            title={revealed ? 'Hide' : 'Reveal'}
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="outline" size="sm" onClick={copy} className="h-8 shrink-0">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="secondary" className="bg-brand-blue-50 text-brand-blue text-[10px]">
            role: agent
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            scope: this client only
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            no expiry
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
    toast(`${label} copied`, { duration: 1000 })
  }
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] uppercase tracking-wider text-ink-muted">
          {label}
        </span>
        <Button variant="ghost" size="sm" onClick={copy} className="h-6 px-2 text-[11px]">
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="text-[11px] bg-paper-muted border border-border-subtle rounded p-3 overflow-x-auto font-mono leading-relaxed">
        {code}
      </pre>
    </div>
  )
}

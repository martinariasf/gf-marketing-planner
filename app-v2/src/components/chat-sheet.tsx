// Phase 6 chat widget (rev for fix pass).
//
// Why not shadcn Sheet:
//   - SheetContent hardcodes <SheetOverlay> with bg-black/40 + backdrop-blur,
//     and the underlying Radix Dialog is modal (focus trap + pointer block),
//     so the dashboard would be both visually dimmed and uninteractable.
//   - Native scroll with min-h-0 inside a flex column is more predictable than
//     Radix ScrollArea once we also want autoscroll-on-stream.
//
// Instead: a plain framer-motion docked panel on the right. No overlay, no
// pointer block, dashboard remains fully usable while chatting. ESC closes.

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  Loader2,
  Sparkles,
  Wrench,
  X,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  PencilLine,
  Plus,
  Trash2,
  FileText,
} from 'lucide-react'
import {
  apiChatStream,
  apiLoadChatHistory,
  isApiEnabled,
  isWriteTool,
  type ChatTurn,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { useT } from '@/lib/i18n'

interface ToolEvent {
  label: string
  status: 'start' | 'done'
}

interface ToolCall {
  id: string
  name: string
  arguments: string
  result?: unknown
  done: boolean
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  tools?: ToolEvent[]      // synthetic UI labels from server (Reading brief.json…)
  toolCalls?: ToolCall[]   // real OpenAI-style tool calls (set_approval, etc.)
  streaming?: boolean
}

const SLASH_CHIPS: Array<{ cmd: string; hintKey: string }> = [
  { cmd: '/draft ',   hintKey: 'chat.chip.draft' },
  { cmd: '/suggest',  hintKey: 'chat.chip.suggest' },
  { cmd: '/weekly',   hintKey: 'chat.chip.weekly' },
  { cmd: '/approve ', hintKey: 'chat.chip.approve' },
  { cmd: '/edit ',    hintKey: 'chat.chip.edit' },
  { cmd: '/brief ',   hintKey: 'chat.chip.brief' },
]

const CHAT_WIDTH_MIN = 340
const CHAT_WIDTH_MAX = 820

export function ChatSheet({
  slug,
  open,
  onOpenChange,
  onWroteSomething,
  initialMessage,
  width,
  onWidthChange,
}: {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a write tool succeeded so the dashboard can refetch. */
  onWroteSomething?: () => void
  /**
   * When this changes to a non-empty value, the composer is pre-filled with it
   * (not auto-sent) and focused. Used by "Change picture" on the calendar so
   * the user lands in the chat with a ready-to-edit prompt.
   */
  initialMessage?: string
  /** Panel width in px (desktop). Mobile stays full-width. */
  width: number
  onWidthChange: (w: number) => void
}) {
  const t = useT()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const thread = `dash-${slug}`

  // Drag-to-resize from the left edge.
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startW: width }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d) return
      const next = Math.min(
        CHAT_WIDTH_MAX,
        Math.max(CHAT_WIDTH_MIN, d.startW + (d.startX - ev.clientX)),
      )
      onWidthChange(next)
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ew-resize'
  }

  // Auto-grow the textarea up to ~8 lines.
  const autosize = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [])
  useLayoutEffect(() => {
    autosize()
  }, [input, autosize])

  // Pre-fill the composer when a caller hands us an initial message (e.g. the
  // "Change picture" button). Keyed on the raw string so re-clicking the same
  // post re-fills even if the text is identical (we append a nonce upstream).
  useEffect(() => {
    if (open && initialMessage) {
      setInput(initialMessage)
      // Focus + move caret to end on the next frame, after the panel mounts.
      requestAnimationFrame(() => {
        const el = inputRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(el.value.length, el.value.length)
        }
      })
    }
  }, [open, initialMessage])

  // Load history from the server ONCE per thread, on first open. We must not
  // reload on every reopen: the panel now stays mounted across close/open (see
  // the always-mounted aside below), so a running turn keeps streaming into
  // state while the panel is hidden. Re-fetching here would clobber that live
  // turn with the not-yet-persisted DB snapshot (Viktor's reply is only saved
  // when the whole run finishes — ~minutes on the slow image model).
  const loadedThreadRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open) return
    if (loadedThreadRef.current === thread) return
    if (busy) return // never overwrite an in-flight conversation
    let cancelled = false
    apiLoadChatHistory(slug, thread).then((items) => {
      if (cancelled) return
      const hist: Message[] = items
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      loadedThreadRef.current = thread
      setMessages(hist)
    })
    return () => {
      cancelled = true
    }
  }, [open, slug, thread, busy])

  // Autoscroll the actual scroll container (not an inner div).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  // ESC closes (since we're not using a modal Dialog anymore, wire it ourselves).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || busy) return
      setBusy(true)
      const userMsg: Message = { role: 'user', content: text }
      const assistantMsg: Message = { role: 'assistant', content: '', tools: [], streaming: true }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInput('')

      const historyTurns: ChatTurn[] = messages
        .filter((m) => !m.streaming)
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))

      const ac = new AbortController()
      abortRef.current = ac
      try {
        for await (const ev of apiChatStream({
          slug,
          thread,
          message: text,
          history: historyTurns,
          signal: ac.signal,
        })) {
          if (ev.type === 'token') {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + ev.text }
              }
              return next
            })
          } else if (ev.type === 'tool') {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  tools: [...(last.tools ?? []), { label: ev.label, status: ev.status }],
                }
              }
              return next
            })
          } else if (ev.type === 'tool_call') {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  toolCalls: [
                    ...(last.toolCalls ?? []),
                    { id: ev.id, name: ev.name, arguments: ev.arguments, done: false },
                  ],
                }
              }
              return next
            })
          } else if (ev.type === 'tool_result') {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  toolCalls: (last.toolCalls ?? []).map((tc) =>
                    tc.id === ev.id ? { ...tc, result: ev.result, done: true } : tc,
                  ),
                }
              }
              return next
            })
            // If a write tool just finished successfully, refresh the dashboard
            // so the kanban / drawer / suggestions reflect the new state.
            if (isWriteTool(ev.name)) {
              const ok =
                typeof ev.result === 'object' &&
                ev.result !== null &&
                (ev.result as { ok?: boolean }).ok === true
              if (ok) onWroteSomething?.()
            }
          } else if (ev.type === 'error') {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + `\n\n_${t('chat.errorPrefix')}${ev.detail}_`,
                  streaming: false,
                }
              }
              return next
            })
          } else if (ev.type === 'done') {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, streaming: false }
              }
              return next
            })
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: last.content + `\n\n_${t('chat.networkError')}_`,
                streaming: false,
              }
            }
            return next
          })
        }
      } finally {
        setBusy(false)
        abortRef.current = null
      }
    },
    [busy, messages, slug, thread, onWroteSomething],
  )

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  return (
    <>
        <motion.aside
          // Fixed panel docked to the right. No overlay, no pointer-events
          // block on the dashboard underneath.
          //
          // IMPORTANT: this stays MOUNTED when closed (we slide it off-screen
          // instead of unmounting via AnimatePresence). That's what lets a
          // long-running turn keep streaming, and preserves the conversation,
          // when you close the panel mid-task and reopen it. Unmounting used to
          // throw the live reply away and make it look like Viktor "forgot".
          initial={false}
          animate={open ? { x: 0, opacity: 1 } : { x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className={cn(
            'fixed top-0 right-0 z-50 h-full w-full',
            'bg-paper border-l border-border-subtle shadow-2xl',
            'flex flex-col',
            !open && 'pointer-events-none', // don't trap clicks while hidden
          )}
          style={{ maxWidth: '100vw', width: `min(100vw, ${width}px)` }}
          role="dialog"
          aria-label={t('chat.askViktor')}
          aria-hidden={!open}
        >
          {/* Drag handle to resize. Hidden on mobile (panel is full-width). */}
          <div
            onPointerDown={onResizeStart}
            className="hidden sm:block absolute left-0 top-0 h-full w-1.5 -translate-x-1/2 cursor-ew-resize z-10 group"
            role="separator"
            aria-orientation="vertical"
            aria-label={t('chat.resize')}
            title={t('chat.dragToResize')}
          >
            <div className="h-full w-px mx-auto bg-border-subtle group-hover:bg-brand-blue/60 transition-colors" />
          </div>
          {/* Header */}
          <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
            <div className="min-w-0">
              <h2 className="font-heading text-base font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-blue" />
                {t('chat.askViktor')}
              </h2>
              <p className="text-[11px] text-ink-muted mt-0.5">
                {t('chat.scopedToPrefix')}<code>{slug}</code>{t('chat.scopedToSuffix')}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 shrink-0"
              aria-label={t('chat.close')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Scrolling message list.
              min-h-0 is the key — without it, flex-1 children expand to
              content size and overflow the parent instead of scrolling. */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
          >
            {messages.length === 0 && (
              <EmptyState onPick={(cmd) => setInput(cmd)} />
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} m={m} />
            ))}
            {/* If we're not actively streaming in THIS mount but the last saved
                turn is an unanswered user message, a run is still in flight (or
                was interrupted) — e.g. after a full page reload during a slow
                image generation. Viktor's reply only persists when the whole
                run finishes, so surface that instead of looking "forgotten". */}
            {!busy &&
              messages.length > 0 &&
              messages[messages.length - 1].role === 'user' && (
                <div className="flex items-center gap-2 text-[12px] text-ink-muted px-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-blue" />
                  {t('chat.stillWorking')}
                </div>
              )}
          </div>

          {/* Composer */}
          <div className="border-t border-border-subtle p-3 space-y-2 shrink-0">
            <div className="flex gap-1.5 flex-wrap">
              {SLASH_CHIPS.map((c) => (
                <Button
                  key={c.cmd}
                  variant="outline"
                  size="sm"
                  onClick={() => setInput(c.cmd)}
                  className="h-7 text-[11px] font-mono"
                  disabled={busy}
                >
                  {c.cmd.trim()}
                </Button>
              ))}
            </div>
            <form onSubmit={onSubmit} className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  // Enter sends, Shift+Enter newline.
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send(input)
                  }
                }}
                rows={1}
                placeholder={t('chat.placeholder')}
                className="flex-1 resize-y min-h-[40px] max-h-[200px] border border-border-subtle rounded-md px-3 py-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30 leading-snug"
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !input.trim()} className="shrink-0">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </motion.aside>
    </>
  )
}

function MessageBubble({ m }: { m: Message }) {
  const t = useT()
  // Collapsible synthetic tool steps. Default: collapsed once the message is
  // done streaming. Real tool CALLS (set_approval etc.) always render — they're
  // the value, not noise.
  const [showTools, setShowTools] = useState(true)
  useEffect(() => {
    if (m.role === 'assistant' && !m.streaming) setShowTools(false)
  }, [m.streaming, m.role])

  const hasTools = m.role === 'assistant' && (m.tools?.length ?? 0) > 0
  const hasToolCalls = m.role === 'assistant' && (m.toolCalls?.length ?? 0) > 0

  return (
    <div className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
          m.role === 'user'
            ? 'bg-brand-blue text-white'
            : 'bg-paper-muted text-ink border border-border-subtle',
        )}
      >
        {hasTools && (
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowTools((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-ink-muted hover:text-ink transition-colors"
            >
              {showTools ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <Wrench className="h-2.5 w-2.5" />
              <span>
                {(() => {
                  const n = m.tools!.length
                  const key = showTools
                    ? n === 1 ? 'chat.thoughtsHide' : 'chat.thoughtsHidePlural'
                    : n === 1 ? 'chat.thoughtsShow' : 'chat.thoughtsShowPlural'
                  return t(key, { n })
                })()}
              </span>
            </button>
            {showTools && (
              <div className="mt-1 space-y-0.5 pl-3 border-l border-border-subtle/70">
                {m.tools!.map((te, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-[10px] text-ink-muted"
                  >
                    <span className="font-mono">{te.label}</span>
                    {te.status === 'done' && (
                      <Badge variant="outline" className="h-4 text-[9px] px-1">{t('common.ok')}</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {hasToolCalls && (
          <div className="mb-2 space-y-1.5">
            {m.toolCalls!.map((tc) => (
              <ToolCallChip key={tc.id} tc={tc} />
            ))}
          </div>
        )}
        {m.content || (m.streaming ? <span className="opacity-60">…</span> : null)}
      </div>
    </div>
  )
}

const TOOL_ICON: Record<string, typeof Wrench> = {
  read_brief:        Wrench,
  read_plan:         Wrench,
  read_posts:        Wrench,
  read_post:         Wrench,
  read_suggestions:  Wrench,
  set_approval:      CheckCircle2,
  patch_post:        PencilLine,
  create_post:       Plus,
  delete_post:       Trash2,
  patch_suggestion:  PencilLine,
  patch_brief:       FileText,
  patch_plan:        FileText,
  patch_goals:       FileText,
  patch_learnings:   FileText,
}

function ToolCallChip({ tc }: { tc: ToolCall }) {
  const t = useT()
  const Icon = TOOL_ICON[tc.name] ?? Wrench
  const labelKey = `chat.tool.${tc.name}`
  const label = t(labelKey) === labelKey ? tc.name : t(labelKey)
  const write = isWriteTool(tc.name)
  const args = parseArgs(tc.arguments)
  const ok = tc.done && typeof tc.result === 'object' && tc.result !== null && (tc.result as { ok?: boolean }).ok !== false
  const failed = tc.done && !ok
  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1.5 text-[11px] flex items-start gap-1.5',
        write ? 'border-brand-blue/30 bg-brand-blue-50/60' : 'border-border-subtle bg-paper',
        failed && 'border-rose-300 bg-rose-50',
      )}
    >
      {!tc.done ? (
        <Loader2 className="h-3 w-3 animate-spin shrink-0 mt-0.5 text-ink-muted" />
      ) : failed ? (
        <XCircle className="h-3 w-3 shrink-0 mt-0.5 text-rose-600" />
      ) : (
        <Icon className={cn('h-3 w-3 shrink-0 mt-0.5', write ? 'text-brand-blue' : 'text-ink-muted')} />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        {args && (
          <div className="text-[10px] text-ink-muted font-mono break-all">
            {args}
          </div>
        )}
        {failed && (
          <div className="text-[10px] text-rose-700 mt-0.5">
            {(tc.result as { detail?: string })?.detail ?? t('common.failed')}
          </div>
        )}
      </div>
    </div>
  )
}

function parseArgs(raw: string): string | null {
  if (!raw) return null
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const entries = Object.entries(obj)
    if (entries.length === 0) return null
    return entries
      .map(([k, v]) => {
        const sv = typeof v === 'string' ? v : JSON.stringify(v)
        const trimmed = sv.length > 60 ? sv.slice(0, 57) + '…' : sv
        return `${k}=${trimmed}`
      })
      .join(' · ')
  } catch {
    return raw.slice(0, 120)
  }
}

function EmptyState({ onPick }: { onPick: (cmd: string) => void }) {
  const t = useT()
  return (
    <div className="text-center py-8 space-y-3">
      <Sparkles className="h-8 w-8 mx-auto text-brand-blue/40" />
      <p className="text-sm font-medium">{t('chat.empty.title')}</p>
      <p className="text-xs text-ink-muted max-w-xs mx-auto">
        {t('chat.empty.body')}
      </p>
      <div className="flex flex-col gap-1.5 max-w-xs mx-auto">
        {SLASH_CHIPS.map((c) => (
          <button
            key={c.cmd}
            onClick={() => onPick(c.cmd)}
            className="text-left text-xs px-3 py-2 rounded-md border border-border-subtle hover:bg-paper-muted transition-colors flex items-center justify-between"
          >
            <code className="font-mono text-brand-blue">{c.cmd.trim()}</code>
            <span className="text-ink-muted">{t(c.hintKey)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ChatTrigger({ onClick }: { onClick: () => void }) {
  const t = useT()
  if (!isApiEnabled) return null
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="h-9 px-3 hidden sm:inline-flex"
      title={t('chat.open')}
    >
      <Sparkles className="h-3.5 w-3.5 sm:mr-1.5 text-brand-blue" />
      <span className="hidden md:inline">{t('chat.button')}</span>
    </Button>
  )
}

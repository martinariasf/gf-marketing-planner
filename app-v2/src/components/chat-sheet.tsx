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
import { motion, AnimatePresence } from 'framer-motion'
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
} from 'lucide-react'
import {
  apiChatStream,
  apiLoadChatHistory,
  isApiEnabled,
  type ChatTurn,
} from '@/lib/api-client'
import { cn } from '@/lib/utils'

interface ToolEvent {
  label: string
  status: 'start' | 'done'
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  tools?: ToolEvent[]
  streaming?: boolean
}

const SLASH_CHIPS: Array<{ cmd: string; hint: string }> = [
  { cmd: '/suggest', hint: '3 next post ideas' },
  { cmd: '/weekly', hint: 'weekly summary' },
  { cmd: '/sync metrics', hint: 'metrics plan' },
  { cmd: '/draft ', hint: 'draft a post on <topic>' },
]

export function ChatSheet({
  slug,
  open,
  onOpenChange,
}: {
  slug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const thread = `dash-${slug}`

  // Load history on open.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    apiLoadChatHistory(slug, thread).then((items) => {
      if (cancelled) return
      const hist: Message[] = items
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
      setMessages(hist)
    })
    return () => {
      cancelled = true
    }
  }, [open, slug, thread])

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
          } else if (ev.type === 'error') {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last?.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + `\n\n_Error: ${ev.detail}_`,
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
                content: last.content + `\n\n_Network error_`,
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
    [busy, messages, slug, thread],
  )

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          // Fixed panel docked to the right. No overlay, no pointer-events
          // block on the dashboard underneath.
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className={cn(
            'fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] md:w-[460px]',
            'bg-paper border-l border-border-subtle shadow-2xl',
            'flex flex-col',
          )}
          role="dialog"
          aria-label="Chat with Viktor"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-border-subtle shrink-0">
            <div className="min-w-0">
              <h2 className="font-heading text-base font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-blue" />
                Ask Viktor (staging chat)
              </h2>
              <p className="text-[11px] text-ink-muted mt-0.5">
                Read-only assistant scoped to <code>{slug}</code>. For real changes, use Telegram or the kanban.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-7 w-7 shrink-0"
              aria-label="Close chat"
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
            <form onSubmit={onSubmit} className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about brief, posts, suggestions…"
                className="flex-1 border border-border-subtle rounded-md px-3 py-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !input.trim()}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function MessageBubble({ m }: { m: Message }) {
  // Collapsible tool events. Default: collapsed once the message is done
  // streaming (keeps the steps available without cluttering the answer);
  // expanded while streaming so the user sees activity.
  const [showTools, setShowTools] = useState(true)
  useEffect(() => {
    if (m.role === 'assistant' && !m.streaming) setShowTools(false)
  }, [m.streaming, m.role])

  const hasTools = m.role === 'assistant' && (m.tools?.length ?? 0) > 0

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
                {showTools ? 'Hide' : 'Show'} {m.tools!.length} thought
                {m.tools!.length === 1 ? '' : 's'}
              </span>
            </button>
            {showTools && (
              <div className="mt-1 space-y-0.5 pl-3 border-l border-border-subtle/70">
                {m.tools!.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 text-[10px] text-ink-muted"
                  >
                    <span className="font-mono">{t.label}</span>
                    {t.status === 'done' && (
                      <Badge variant="outline" className="h-4 text-[9px] px-1">ok</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {m.content || (m.streaming ? <span className="opacity-60">…</span> : null)}
      </div>
    </div>
  )
}

function EmptyState({ onPick }: { onPick: (cmd: string) => void }) {
  return (
    <div className="text-center py-8 space-y-3">
      <Sparkles className="h-8 w-8 mx-auto text-brand-blue/40" />
      <p className="text-sm font-medium">Hi. Ask anything about this client.</p>
      <p className="text-xs text-ink-muted max-w-xs mx-auto">
        I can read the brief, plan, posts and suggestions, and reason over them. Try a slash command:
      </p>
      <div className="flex flex-col gap-1.5 max-w-xs mx-auto">
        {SLASH_CHIPS.map((c) => (
          <button
            key={c.cmd}
            onClick={() => onPick(c.cmd)}
            className="text-left text-xs px-3 py-2 rounded-md border border-border-subtle hover:bg-paper-muted transition-colors flex items-center justify-between"
          >
            <code className="font-mono text-brand-blue">{c.cmd.trim()}</code>
            <span className="text-ink-muted">{c.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function ChatTrigger({ onClick }: { onClick: () => void }) {
  if (!isApiEnabled) return null
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="h-9 px-3 hidden sm:inline-flex"
      title="Open chat"
    >
      <Sparkles className="h-3.5 w-3.5 sm:mr-1.5 text-brand-blue" />
      <span className="hidden md:inline">Chat</span>
    </Button>
  )
}

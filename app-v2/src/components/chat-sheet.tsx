// Phase 6 — right-side chat widget. Streams via SSE from
// /api/v1/clients/:slug/chat/stream. Read-only assistant with slash chips.

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Loader2, Sparkles, Wrench } from 'lucide-react'
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

  // Autoscroll on new content.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text || busy) return
      setBusy(true)
      const userMsg: Message = { role: 'user', content: text }
      const assistantMsg: Message = { role: 'assistant', content: '', tools: [], streaming: true }
      setMessages((prev) => [...prev, userMsg, assistantMsg])
      setInput('')

      // Build history from previous messages (cap last 10).
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b border-border-subtle">
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-blue" />
            Ask Viktor (staging chat)
          </SheetTitle>
          <SheetDescription className="text-[11px]">
            Read-only assistant scoped to <code>{slug}</code>. For real changes, use Telegram or the kanban.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div ref={scrollRef} className="px-4 py-4 space-y-4">
            {messages.length === 0 && (
              <EmptyState onPick={(cmd) => setInput(cmd)} />
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} m={m} />
            ))}
          </div>
        </ScrollArea>

        <div className="border-t border-border-subtle p-3 space-y-2">
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
      </SheetContent>
    </Sheet>
  )
}

function MessageBubble({ m }: { m: Message }) {
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
        {m.role === 'assistant' && m.tools && m.tools.length > 0 && (
          <div className="mb-2 space-y-1">
            {m.tools.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-1.5 text-[10px] text-ink-muted"
              >
                <Wrench className="h-2.5 w-2.5" />
                <span className="font-mono">{t.label}</span>
                {t.status === 'done' && (
                  <Badge variant="outline" className="h-4 text-[9px] px-1">ok</Badge>
                )}
              </div>
            ))}
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

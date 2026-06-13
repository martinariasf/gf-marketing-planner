import { useState, useEffect, useMemo } from 'react'
import {
  NavLink,
  Outlet,
  useParams,
  useLocation,
  Navigate,
  Link,
} from 'react-router'
import { motion } from 'framer-motion'
import {
  Building2,
  Target,
  Compass,
  CalendarDays,
  ShieldCheck,
  Images,
  TrendingUp,
  Lightbulb,
  Sparkles,
  Plug,
  Loader2,
  Menu,
  ChevronLeft,
  HelpCircle,
  Pencil,
  Save,
  PanelLeftClose,
  PanelLeftOpen,
  Video,
} from 'lucide-react'
import { GFLogo } from '@/components/gf-logo'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WorkflowStrip, type WorkflowPhase } from '@/components/workflow-strip'
import { EditBar } from '@/components/edit-bar'
import { ChatSheet, ChatTrigger } from '@/components/chat-sheet'
import { LanguageSwitcher } from '@/components/language-switcher'
import { SyncIndicator } from '@/components/sync-indicator'
import { useT } from '@/lib/i18n'
import { useClient } from '@/hooks/use-client'
import { useEdit, deepMerge } from '@/lib/edit-store'
import type { ClientBundle } from '@/lib/client-data'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  labelKey: string
  icon: typeof Building2
  phase: WorkflowPhase
  disabled?: boolean
}

const NAV: NavItem[] = [
  { to: 'context',     labelKey: 'nav.context',     icon: Building2,     phase: 'plan'    as WorkflowPhase },
  { to: 'goals',       labelKey: 'nav.goals',       icon: Target,        phase: 'plan'    as WorkflowPhase },
  { to: 'strategy',    labelKey: 'nav.strategy',    icon: Compass,       phase: 'plan'    as WorkflowPhase },
  { to: 'suggestions', labelKey: 'nav.suggestions', icon: Sparkles,      phase: 'plan'    as WorkflowPhase },
  { to: 'calendar',    labelKey: 'nav.calendar',    icon: CalendarDays,  phase: 'draft'   as WorkflowPhase },
  { to: 'approvals',   labelKey: 'nav.approvals',   icon: ShieldCheck,   phase: 'prepare' as WorkflowPhase },
  { to: 'assets',      labelKey: 'nav.assets',      icon: Images,        phase: 'prepare' as WorkflowPhase },
  { to: 'videos',      labelKey: 'nav.videos',      icon: Video,         phase: 'prepare' as WorkflowPhase, disabled: true },
  { to: 'performance', labelKey: 'nav.performance', icon: TrendingUp,    phase: 'learn'   as WorkflowPhase },
  { to: 'learnings',   labelKey: 'nav.learnings',   icon: Lightbulb,     phase: 'learn'   as WorkflowPhase },
  { to: 'integration', labelKey: 'nav.integration', icon: Plug,          phase: 'learn'   as WorkflowPhase },
]

export default function ClientLayout() {
  const t = useT()
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatPrefill, setChatPrefill] = useState('')
  const [chatWidth, setChatWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('mp.chatWidth'))
    return Number.isFinite(saved) && saved >= 340 && saved <= 820 ? saved : 460
  })
  useEffect(() => {
    localStorage.setItem('mp.chatWidth', String(chatWidth))
  }, [chatWidth])
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => localStorage.getItem('mp.sidebarCollapsed') === '1',
  )
  useEffect(() => {
    localStorage.setItem('mp.sidebarCollapsed', sidebarCollapsed ? '1' : '0')
  }, [sidebarCollapsed])
  const { data, loading, error, refetch } = useClient(slug ?? 'fitvibe-demo')

  // Any component (e.g. the calendar's "Change picture" button) can ask the
  // chat to open pre-filled by dispatching a `mp:open-chat` CustomEvent with
  // { message }. ChatSheet fills its composer when it opens or when the message
  // changes — both covered here since we set the message then open the panel.
  useEffect(() => {
    const onOpenChat = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail
      setChatPrefill(detail?.message ?? '')
      setChatOpen(true)
    }
    window.addEventListener('mp:open-chat', onOpenChat as EventListener)
    return () => window.removeEventListener('mp:open-chat', onOpenChat as EventListener)
  }, [])
  const { editMode, setEditMode, patches } = useEdit()

  // Build a "merged" bundle: original data + any locally-edited patches.
  // Pages consume this via useOutletContext, so wiring is transparent to them.
  const mergedData = useMemo<ClientBundle | null>(() => {
    if (!data || !slug) return data
    const slugPatches = patches[slug]
    if (!slugPatches) return data
    return {
      ...data,
      brief: deepMerge(data.brief, slugPatches.brief),
      plan: deepMerge(data.plan, slugPatches.plan),
      goals: deepMerge(data.goals, slugPatches.goals),
      learnings: data.learnings
        ? deepMerge(data.learnings, slugPatches.learnings)
        : data.learnings,
    }
  }, [data, slug, patches])

  // Close the mobile nav whenever the route changes
  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  if (!slug) return <Navigate to="/fitvibe-demo/context" replace />

  const currentSegment = location.pathname.split('/').filter(Boolean)[1] ?? 'context'
  const currentNav = NAV.find((n) => n.to === currentSegment)
  const currentPhase = currentNav?.phase ?? 'plan'

  // Only show the blocking skeleton when we genuinely have nothing to render
  // yet (first load / client switch). A background refetch keeps `data`
  // populated, so we must keep the app mounted — otherwise a mid-chat refetch
  // (Viktor running a write tool) would unmount the ChatSheet and drop the
  // streaming reply, which looked like a spurious page reload.
  if (loading && !data) {
    return <LoadingState slug={slug} />
  }

  if (error || !data || !mergedData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md space-y-3 text-center">
          <h2 className="text-lg font-semibold text-rose-700">
            {t('loading.couldNotLoad')}
          </h2>
          <p className="text-sm text-ink-muted">{error}</p>
          <p className="text-xs text-ink-muted">
            {t('loading.expectedFiles', { slug })}
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              {t('loading.backToClients')}
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const openSuggestions = (mergedData.suggestions?.items ?? []).filter(
    (s) => s.status === 'open',
  ).length

  const navContent = (
    <NavContent
      currentSegment={currentSegment}
      openSuggestions={openSuggestions}
    />
  )

  // When chat is open on sm+ we shift everything left so the panel doesn't
  // cover content. Mobile chat is full-width — no shift needed there.
  const chatShift =
    chatOpen && typeof window !== 'undefined' && window.innerWidth >= 640
      ? chatWidth
      : 0

  return (
    <div
      className="min-h-screen bg-paper-muted transition-[padding] duration-200"
      style={{ paddingRight: chatShift }}
    >
      <header className="border-b border-border-subtle bg-paper sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 flex-wrap">
          {/* Mobile hamburger */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-9 w-9 shrink-0"
                aria-label={t('nav.openNav')}
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col">
              <SheetHeader className="p-5 pb-3 border-b border-border-subtle">
                <SheetTitle className="text-base">
                  {mergedData.brief.company.name}
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-3">
                {navContent}
              </div>
              <div className="border-t border-border-subtle p-3 space-y-1">
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <Link to="/">
                    <ChevronLeft className="h-3.5 w-3.5 mr-1.5" />
                    {t('nav.allClients')}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <a href="https://gfinnov.com" target="_blank" rel="noreferrer">
                    <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                    {t('nav.help')}
                  </a>
                </Button>
                <div className="pt-2 flex justify-center opacity-70">
                  <GFLogo size="sm" />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Logo + client */}
          <Link
            to="/"
            className="flex items-center gap-3 min-w-0 flex-1 group focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue rounded-md"
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.15 }}
              className="h-10 w-10 rounded-lg bg-brand-blue flex items-center justify-center text-white font-bold text-sm shrink-0"
            >
              {mergedData.plan.client.logoInitials}
            </motion.div>
            <div className="min-w-0 hidden sm:block">
              <p className="text-[11px] uppercase tracking-wider text-ink-muted leading-tight">
                {mergedData.plan.agency.name}
              </p>
              <h1 className="text-base font-semibold leading-tight truncate group-hover:text-brand-blue transition-colors">
                {mergedData.brief.company.name}
              </h1>
            </div>
            <h1 className="sm:hidden text-base font-semibold leading-tight truncate">
              {mergedData.brief.company.name}
            </h1>
          </Link>

          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="secondary" className="bg-brand-green-100 text-brand-green-600 hidden md:inline-flex">
              {t('header.viktorV2')}
            </Badge>
            <SyncIndicator slug={slug} />
            <LanguageSwitcher />
            <ChatTrigger onClick={() => setChatOpen(true)} />
            <Button
              variant={editMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEditMode(!editMode)}
              title={editMode ? t('header.exitEdit') : t('header.editSetup')}
              className={cn(
                'h-9 px-3 hidden sm:inline-flex',
                editMode && 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500',
              )}
            >
              {editMode ? (
                <>
                  <Save className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden md:inline">{t('common.save')}</span>
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden md:inline">{t('common.edit')}</span>
                </>
              )}
            </Button>
            <Button
              variant={editMode ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setEditMode(!editMode)}
              title={editMode ? t('header.exitEdit') : t('header.editSetup')}
              aria-label={editMode ? t('header.exitEdit') : t('header.editSetup')}
              className={cn(
                'h-9 w-9 sm:hidden',
                editMode && 'bg-amber-500 hover:bg-amber-600 text-white',
              )}
            >
              {editMode ? <Save className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title={t('header.help')}
              aria-label={t('header.help')}
              className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-ink-muted hover:text-brand-blue hover:bg-paper-muted transition-colors"
            >
              <GFLogo size="sm" />
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title={t('header.help')}
              aria-label={t('header.help')}
              className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md text-ink-muted hover:text-brand-blue hover:bg-paper-muted transition-colors"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
        <WorkflowStrip current={currentPhase} />
      </header>

      <div
        className="mx-auto max-w-7xl px-4 sm:px-6 py-6 grid grid-cols-1 gap-6"
        style={{
          gridTemplateColumns:
            typeof window !== 'undefined' && window.innerWidth >= 1024
              ? `${sidebarCollapsed ? 60 : 220}px 1fr`
              : undefined,
        }}
      >
        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:sticky lg:top-[150px] lg:self-start">
          <div className="flex items-center justify-end pb-2">
            <button
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? t('header.expandSidebar') : t('header.collapseSidebar')}
              aria-label={sidebarCollapsed ? t('header.expandSidebar') : t('header.collapseSidebar')}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:text-brand-blue hover:bg-paper transition-colors"
            >
              {sidebarCollapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>
          <ScrollArea className="lg:max-h-[calc(100vh-180px)]">
            <NavContent
              currentSegment={currentSegment}
              openSuggestions={openSuggestions}
              collapsed={sidebarCollapsed}
            />
          </ScrollArea>
        </aside>

        {/* Content */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="min-w-0"
        >
          <Outlet context={{ ...mergedData, refetch }} />
        </motion.main>
      </div>

      {/* Floating edit toggle + dirty-files panel.
          Passes the ORIGINAL bundle so downloads always include latest patches. */}
      <EditBar slug={slug} bundle={data} onSaved={refetch} />

      {/* Phase 6 chat widget — LLM scoped to this client. Write tools
          (set_approval, patch_post, patch_suggestion) refresh the
          dashboard via onWroteSomething so the kanban/drawer reflect
          changes immediately. */}
      <ChatSheet
        slug={slug}
        open={chatOpen}
        onOpenChange={setChatOpen}
        onWroteSomething={refetch}
        initialMessage={chatPrefill}
        width={chatWidth}
        onWidthChange={setChatWidth}
      />

      {/* Help dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('help.title')}</DialogTitle>
            <DialogDescription>
              {t('help.description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold mb-1">{t('help.navigationTitle')}</p>
              <ul className="text-ink-muted text-xs space-y-1">
                <li>{t('help.navLine1')}</li>
                <li>{t('help.navLine2.prefix')}<kbd className="px-1 py-0.5 rounded bg-paper-muted border text-[10px]">←</kbd> / <kbd className="px-1 py-0.5 rounded bg-paper-muted border text-[10px]">→</kbd>{t('help.navLine2.suffix')}</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-1">{t('help.editingTitle')}</p>
              <ul className="text-ink-muted text-xs space-y-1">
                <li>{t('help.editLine1.prefix')}<strong>{t('common.edit')}</strong>{t('help.editLine1.suffix')}</li>
                <li>{t('help.editLine2.prefix')}<kbd className="px-1 py-0.5 rounded bg-paper-muted border text-[10px]">Ctrl/Cmd+Enter</kbd>{t('help.editLine2.suffix')}</li>
                <li>{t('help.editLine3')}</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-1">{t('help.approvalsTitle')}</p>
              <p className="text-ink-muted text-xs">{t('help.approvalsBody.prefix')}<code className="px-1 py-0.5 rounded bg-paper-muted text-[11px]">approve p###</code>{t('help.approvalsBody.suffix')}</p>
            </div>
            <div className="pt-2 border-t border-border-subtle">
              <a
                href="https://gfinnov.com"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-blue hover:underline"
              >
                gfinnov.com ↗
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function NavContent({
  currentSegment,
  openSuggestions,
  collapsed = false,
}: {
  currentSegment: string
  openSuggestions: number
  collapsed?: boolean
}) {
  const t = useT()
  return (
    <nav className="space-y-0.5">
      {NAV.map((n) => {
        const label = t(n.labelKey)
        const isActive = currentSegment === n.to
        const badge =
          n.to === 'suggestions' && openSuggestions > 0
            ? openSuggestions
            : null
        return (
          <NavLink
            key={n.to}
            to={n.disabled ? '#' : n.to}
            onClick={(e) => n.disabled && e.preventDefault()}
            title={collapsed ? label : undefined}
            className={cn(
              'relative flex items-center gap-2.5 rounded-md py-2 text-sm transition-colors',
              collapsed ? 'px-2 justify-center' : 'px-3',
              n.disabled
                ? 'text-ink-muted/50 cursor-not-allowed'
                : isActive
                  ? 'text-white'
                  : 'text-ink hover:bg-paper',
            )}
          >
            {isActive && !n.disabled && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-md bg-brand-blue"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span
              className={cn(
                'relative flex items-center gap-2.5',
                collapsed ? '' : 'flex-1',
              )}
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                <n.icon className="h-4 w-4 shrink-0" />
              </span>
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{label}</span>
                  {badge !== null && (
                    <span
                      className={cn(
                        'flex h-5 min-w-[20px] items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                        isActive
                          ? 'bg-white/25 text-white'
                          : 'bg-brand-green-100 text-brand-green-600',
                      )}
                    >
                      {badge}
                    </span>
                  )}
                  {n.disabled && (
                    <span className="text-[10px] tracking-wide opacity-70">
                      {t('nav.soon')}
                    </span>
                  )}
                </>
              )}
              {collapsed && badge !== null && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-semibold bg-brand-green-100 text-brand-green-600">
                  {badge}
                </span>
              )}
            </span>
          </NavLink>
        )
      })}
    </nav>
  )
}

function LoadingState({ slug }: { slug: string }) {
  const t = useT()
  return (
    <div className="min-h-screen bg-paper-muted">
      <header className="border-b border-border-subtle bg-paper">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="h-10 w-48 rounded bg-paper-muted animate-pulse" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-4">
          <div className="h-8 w-72 rounded bg-paper animate-pulse" />
          <div className="h-4 w-96 rounded bg-paper animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-paper animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-ink-muted text-xs mt-8">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t('loading.loadingClient', { slug })}
        </div>
      </main>
    </div>
  )
}

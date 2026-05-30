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
  KanbanSquare,
  ShieldCheck,
  Images,
  TrendingUp,
  Lightbulb,
  Sparkles,
  Loader2,
  Menu,
  ChevronLeft,
  HelpCircle,
  Pencil,
  Eye,
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
import { useClient } from '@/hooks/use-client'
import { useEdit, deepMerge } from '@/lib/edit-store'
import type { ClientBundle } from '@/lib/client-data'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: typeof Building2
  phase: WorkflowPhase
  disabled?: boolean
}

const NAV: NavItem[] = [
  { to: 'context',     label: 'Company Context',  icon: Building2,     phase: 'plan'    as WorkflowPhase },
  { to: 'goals',       label: 'Goals vs Actuals', icon: Target,        phase: 'plan'    as WorkflowPhase },
  { to: 'strategy',    label: 'Strategy',         icon: Compass,       phase: 'plan'    as WorkflowPhase },
  { to: 'suggestions', label: 'AI Suggestions',   icon: Sparkles,      phase: 'plan'    as WorkflowPhase },
  { to: 'calendar',    label: 'Content Calendar', icon: CalendarDays,  phase: 'draft'   as WorkflowPhase },
  { to: 'pipeline',    label: 'Pipeline',         icon: KanbanSquare,  phase: 'refine'  as WorkflowPhase },
  { to: 'approvals',   label: 'Approvals',        icon: ShieldCheck,   phase: 'prepare' as WorkflowPhase },
  { to: 'assets',      label: 'Assets',           icon: Images,        phase: 'prepare' as WorkflowPhase },
  { to: 'performance', label: 'Performance',      icon: TrendingUp,    phase: 'learn'   as WorkflowPhase },
  { to: 'learnings',   label: 'Learnings',        icon: Lightbulb,     phase: 'learn'   as WorkflowPhase },
]

export default function ClientLayout() {
  const { slug } = useParams<{ slug: string }>()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { data, loading, error, refetch } = useClient(slug ?? 'fitvibe-demo')
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

  if (loading) {
    return <LoadingState slug={slug} />
  }

  if (error || !data || !mergedData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md space-y-3 text-center">
          <h2 className="text-lg font-semibold text-rose-700">
            Could not load client data
          </h2>
          <p className="text-sm text-ink-muted">{error}</p>
          <p className="text-xs text-ink-muted">
            Expected files in <code>/data/{slug}/</code>.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/">
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Back to clients
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

  return (
    <div className="min-h-screen bg-paper-muted">
      <header className="border-b border-border-subtle bg-paper sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 sm:py-4 flex items-center gap-3 flex-wrap">
          {/* Mobile hamburger */}
          <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden h-9 w-9 shrink-0"
                aria-label="Open navigation"
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
                    All clients
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="w-full justify-start">
                  <a href="https://gfinnov.com" target="_blank" rel="noreferrer">
                    <HelpCircle className="h-3.5 w-3.5 mr-1.5" />
                    Help &middot; gfinnov.com
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
            <Badge variant="secondary" className="bg-brand-blue-50 text-brand-blue hidden sm:inline-flex">
              {mergedData.plan.quarter.label}
            </Badge>
            <Badge variant="secondary" className="bg-brand-green-100 text-brand-green-600 hidden md:inline-flex">
              Viktor v2
            </Badge>
            <Button
              variant={editMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setEditMode(!editMode)}
              title={editMode ? 'Exit edit mode' : 'Edit setup data'}
              className={cn(
                'h-9 px-3 hidden sm:inline-flex',
                editMode && 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500',
              )}
            >
              {editMode ? (
                <>
                  <Eye className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden md:inline">Preview</span>
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden md:inline">Edit</span>
                </>
              )}
            </Button>
            <Button
              variant={editMode ? 'default' : 'ghost'}
              size="icon"
              onClick={() => setEditMode(!editMode)}
              title={editMode ? 'Exit edit mode' : 'Edit setup data'}
              aria-label={editMode ? 'Exit edit mode' : 'Edit setup data'}
              className={cn(
                'h-9 w-9 sm:hidden',
                editMode && 'bg-amber-500 hover:bg-amber-600 text-white',
              )}
            >
              {editMode ? <Eye className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title="Help & shortcuts"
              aria-label="Help & shortcuts"
              className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-ink-muted hover:text-brand-blue hover:bg-paper-muted transition-colors"
            >
              <GFLogo size="sm" />
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              title="Help & shortcuts"
              aria-label="Help & shortcuts"
              className="md:hidden inline-flex items-center justify-center h-9 w-9 rounded-md text-ink-muted hover:text-brand-blue hover:bg-paper-muted transition-colors"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
        <WorkflowStrip current={currentPhase} />
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:sticky lg:top-[150px] lg:self-start">
          <ScrollArea className="lg:max-h-[calc(100vh-180px)]">
            {navContent}
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

      {/* Help dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Help & shortcuts</DialogTitle>
            <DialogDescription>
              Viktor handles writes via Telegram. This dashboard is the human review surface.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-semibold mb-1">Navigation</p>
              <ul className="text-ink-muted text-xs space-y-1">
                <li>Use the sidebar (or the workflow strip across the top) to move between phases.</li>
                <li>On the Content Calendar, press <kbd className="px-1 py-0.5 rounded bg-paper-muted border text-[10px]">←</kbd> / <kbd className="px-1 py-0.5 rounded bg-paper-muted border text-[10px]">→</kbd> to flip between posts.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-1">Editing</p>
              <ul className="text-ink-muted text-xs space-y-1">
                <li>Toggle <strong>Edit</strong> in the header, then click any field to change it.</li>
                <li>Press <kbd className="px-1 py-0.5 rounded bg-paper-muted border text-[10px]">Ctrl/Cmd+Enter</kbd> to save a single field.</li>
                <li>The bottom bar collects all unsaved files. Save persists; Discard wipes the patch.</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-1">Approvals</p>
              <p className="text-ink-muted text-xs">Nothing publishes without you writing <code className="px-1 py-0.5 rounded bg-paper-muted text-[11px]">approve p###</code> to Viktor on Telegram.</p>
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
}: {
  currentSegment: string
  openSuggestions: number
}) {
  return (
    <nav className="space-y-0.5">
      {NAV.map((n) => {
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
            className={cn(
              'relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
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
            <span className="relative flex items-center gap-2.5 flex-1">
              <n.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{n.label}</span>
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
                <span className="text-[10px] uppercase tracking-wider opacity-70">
                  soon
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
          Loading {slug}…
        </div>
      </main>
    </div>
  )
}

import { NavLink, Outlet, useParams, useLocation, Navigate } from 'react-router'
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
  Loader2,
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { WorkflowStrip, type WorkflowPhase } from '@/components/workflow-strip'
import { useClient } from '@/hooks/use-client'
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
  const { data, loading, error } = useClient(slug ?? 'fitvibe-demo')

  if (!slug) return <Navigate to="/fitvibe-demo/context" replace />

  const currentSegment = location.pathname.split('/').filter(Boolean)[1] ?? 'context'
  const currentNav = NAV.find((n) => n.to === currentSegment)
  const currentPhase = currentNav?.phase ?? 'plan'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading {slug}…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md space-y-2 text-center">
          <h2 className="text-lg font-semibold text-red-700">Could not load client data</h2>
          <p className="text-sm text-ink-muted">{error}</p>
          <p className="text-xs text-ink-muted">
            Expected files in <code>/data/{slug}/</code>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper-muted">
      {/* Top bar */}
      <header className="border-b border-border-subtle bg-paper sticky top-0 z-30">
        <div className="mx-auto max-w-7xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-brand-blue flex items-center justify-center text-white font-bold text-sm">
              {data.plan.client.logoInitials}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-ink-muted leading-tight">
                {data.plan.agency.name}
              </p>
              <h1 className="text-base font-semibold leading-tight">
                {data.brief.company.name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-brand-blue-50 text-brand-blue">
              {data.plan.quarter.label}
            </Badge>
            <Badge variant="secondary" className="bg-brand-green-100 text-brand-green-600">
              Viktor v2
            </Badge>
          </div>
        </div>
        <WorkflowStrip current={currentPhase} />
      </header>

      <div className="mx-auto max-w-7xl px-6 py-6 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar */}
        <aside className="lg:sticky lg:top-[150px] lg:self-start">
          <ScrollArea className="lg:max-h-[calc(100vh-180px)]">
            <nav className="space-y-1">
              {NAV.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.disabled ? '#' : n.to}
                  onClick={(e) => n.disabled && e.preventDefault()}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
                      n.disabled
                        ? 'text-ink-muted/50 cursor-not-allowed'
                        : isActive
                          ? 'bg-brand-blue text-white'
                          : 'text-ink hover:bg-paper',
                    )
                  }
                >
                  <n.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate">{n.label}</span>
                  {n.disabled && (
                    <span className="text-[10px] uppercase tracking-wider opacity-70">
                      soon
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>
          </ScrollArea>
        </aside>

        {/* Content */}
        <motion.main
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <Outlet context={data} />
        </motion.main>
      </div>
    </div>
  )
}

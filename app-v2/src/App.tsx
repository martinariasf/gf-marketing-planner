import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { EditProvider } from '@/lib/edit-store'

const ClientPicker  = lazy(() => import('@/routes/index'))
const ClientLayout  = lazy(() => import('@/routes/client/layout'))
const ContextView   = lazy(() => import('@/routes/client/context'))
const GoalsView     = lazy(() => import('@/routes/client/goals'))
const StrategyView  = lazy(() => import('@/routes/client/strategy'))
const CalendarView  = lazy(() => import('@/routes/client/calendar'))
const PipelineView  = lazy(() => import('@/routes/client/pipeline'))
const ApprovalsView = lazy(() => import('@/routes/client/approvals'))
const AssetsView    = lazy(() => import('@/routes/client/assets'))
const PerformanceView = lazy(() => import('@/routes/client/performance'))
const LearningsView   = lazy(() => import('@/routes/client/learnings'))
const SuggestionsView = lazy(() => import('@/routes/client/suggestions'))

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-ink-muted">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <EditProvider>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<ClientPicker />} />
          <Route path="/:slug" element={<ClientLayout />}>
            <Route index element={<Navigate to="context" replace />} />
            <Route path="context"     element={<ContextView />} />
            <Route path="goals"       element={<GoalsView />} />
            <Route path="strategy"    element={<StrategyView />} />
            <Route path="calendar"    element={<CalendarView />} />
            <Route path="pipeline"    element={<PipelineView />} />
            <Route path="approvals"   element={<ApprovalsView />} />
            <Route path="assets"      element={<AssetsView />} />
            <Route path="performance" element={<PerformanceView />} />
            <Route path="learnings"   element={<LearningsView />} />
            <Route path="suggestions" element={<SuggestionsView />} />
            <Route path="*"           element={<Navigate to="context" replace />} />
          </Route>
        </Routes>
      </Suspense>
      </EditProvider>
    </BrowserRouter>
  )
}

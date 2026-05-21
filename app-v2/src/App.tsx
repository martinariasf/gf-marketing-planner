import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import ClientLayout from '@/routes/client/layout'
import ContextView from '@/routes/client/context'
import GoalsView from '@/routes/client/goals'
import StrategyView from '@/routes/client/strategy'
import CalendarView from '@/routes/client/calendar'
import PipelineView from '@/routes/client/pipeline'
import ApprovalsView from '@/routes/client/approvals'
import AssetsView from '@/routes/client/assets'
import PerformanceView from '@/routes/client/performance'
import LearningsView from '@/routes/client/learnings'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/fitvibe-demo/context" replace />} />
        <Route path="/:slug" element={<ClientLayout />}>
          <Route index element={<Navigate to="context" replace />} />
          <Route path="context"   element={<ContextView />} />
          <Route path="goals"     element={<GoalsView />} />
          <Route path="strategy"  element={<StrategyView />} />
          <Route path="calendar"  element={<CalendarView />} />
          <Route path="pipeline"  element={<PipelineView />} />
          <Route path="approvals"   element={<ApprovalsView />} />
          <Route path="assets"      element={<AssetsView />} />
          <Route path="performance" element={<PerformanceView />} />
          <Route path="learnings"   element={<LearningsView />} />
          <Route path="*"           element={<Navigate to="context" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

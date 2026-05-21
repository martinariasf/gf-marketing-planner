import { BrowserRouter, Routes, Route, Navigate } from 'react-router'
import ClientLayout from '@/routes/client/layout'
import ContextView from '@/routes/client/context'
import GoalsView from '@/routes/client/goals'
import StrategyView from '@/routes/client/strategy'
import CalendarView from '@/routes/client/calendar'

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
          <Route path="*"         element={<Navigate to="context" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

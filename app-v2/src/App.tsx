import { lazy, Suspense, Component, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router'
import { Loader2 } from 'lucide-react'
import { EditProvider } from '@/lib/edit-store'
import { LanguageProvider, tStatic } from '@/lib/i18n'
import { needsLogin } from '@/lib/api-client'

const Login         = lazy(() => import('@/routes/login'))
const ClientPicker  = lazy(() => import('@/routes/index'))
const ClientLayout  = lazy(() => import('@/routes/client/layout'))
const ContextView   = lazy(() => import('@/routes/client/context'))
const GoalsView     = lazy(() => import('@/routes/client/goals'))
const StrategyView  = lazy(() => import('@/routes/client/strategy'))
const CalendarView  = lazy(() => import('@/routes/client/calendar'))
const ApprovalsView = lazy(() => import('@/routes/client/approvals'))
const AssetsView    = lazy(() => import('@/routes/client/assets'))
const PerformanceView = lazy(() => import('@/routes/client/performance'))
const LearningsView   = lazy(() => import('@/routes/client/learnings'))
const SuggestionsView = lazy(() => import('@/routes/client/suggestions'))
const IntegrationView = lazy(() => import('@/routes/client/integration'))
const VideosView      = lazy(() => import('@/routes/client/videos'))
// GF-4 — external reviewer page. Standalone, code-gated, OUTSIDE client layout.
const ExternalReview  = lazy(() => import('@/routes/review/external'))
// Product changelog. Standalone page, OUTSIDE the client layout — must precede /:slug.
const Changelog       = lazy(() => import('@/routes/changelog'))

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-ink-muted">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

/**
 * GF-58 — auth gate. When the SPA talks to the API and has no session (and no
 * build-time fallback token), send the user to the login screen. Public routes
 * (external review, changelog, login) live OUTSIDE this gate.
 */
function RequireAuth() {
  if (needsLogin()) return <Navigate to="/login" replace />
  return <Outlet />
}

/**
 * App-wide error boundary. A render error in any route used to unmount the
 * whole tree and leave a blank white page — and because unsaved edits are
 * replayed from localStorage on every load, a single bad edit could brick the
 * app permanently for that browser. This catches the error, shows a readable
 * message, and offers a one-click "discard local edits & reload" recovery.
 */
const EDITS_STORAGE_KEY = 'gf-mp:edits:v1'

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error('[app] render error caught by boundary:', error)
  }

  private discardEditsAndReload = () => {
    try {
      localStorage.removeItem(EDITS_STORAGE_KEY)
    } catch {
      /* ignore */
    }
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-paper-muted">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-lg font-semibold text-rose-700">
            {tStatic('errorBoundary.title')}
          </h1>
          <p className="text-sm text-ink-muted">
            {tStatic('errorBoundary.body')}
          </p>
          <pre className="text-left text-[11px] text-ink-muted bg-paper border border-border-subtle rounded-md p-2 overflow-auto max-h-32">
            {this.state.error.message}
          </pre>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.discardEditsAndReload}
              className="rounded-md bg-brand-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-blue-700"
            >
              {tStatic('errorBoundary.discardReload')}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm hover:bg-paper"
            >
              {tStatic('errorBoundary.justReload')}
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
      <EditProvider>
      <AppErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public external review — must precede the /:slug catch-all layout. */}
          <Route path="/review/:publicId" element={<ExternalReview />} />
          {/* Changelog — also must precede /:slug or it'd be read as a client slug. */}
          <Route path="/changelog" element={<Changelog />} />
          {/* Public login — outside the auth gate. */}
          <Route path="/login" element={<Login />} />
          {/* Everything below requires a logged-in dashboard session (GF-58). */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<ClientPicker />} />
            <Route path="/:slug" element={<ClientLayout />}>
              <Route index element={<Navigate to="context" replace />} />
              <Route path="context"     element={<ContextView />} />
              <Route path="goals"       element={<GoalsView />} />
              <Route path="strategy"    element={<StrategyView />} />
              <Route path="calendar"    element={<CalendarView />} />
              <Route path="approvals"   element={<ApprovalsView />} />
              <Route path="assets"      element={<AssetsView />} />
              <Route path="performance" element={<PerformanceView />} />
              <Route path="learnings"   element={<LearningsView />} />
              <Route path="suggestions" element={<SuggestionsView />} />
              <Route path="integration" element={<IntegrationView />} />
              <Route path="videos"      element={<VideosView />} />
              <Route path="brand-kit"   element={<Navigate to="../context" replace />} />
              <Route path="references"  element={<Navigate to="../assets" replace />} />
              <Route path="*"           element={<Navigate to="context" replace />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
      </AppErrorBoundary>
      </EditProvider>
      </LanguageProvider>
    </BrowserRouter>
  )
}

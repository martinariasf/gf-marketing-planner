import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { GFLogo } from '@/components/gf-logo'
import { login } from '@/lib/api-client'

/**
 * GF-58 — dashboard login. A person signs in with email + password; the API
 * (PocketBase) returns a session JWT that the SPA stores. Replaces the old
 * per-client basicauth. External review links are a separate flow and do NOT
 * pass through here.
 */
export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-paper-muted flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <GFLogo variant="lockup" size="lg" />
          <div>
            <h1 className="text-lg font-semibold text-ink">Sign in to Viktor</h1>
            <p className="text-sm text-ink-muted mt-1">
              Use your account email and password.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <label htmlFor="email" className="text-xs font-medium text-ink">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  placeholder="you@agency.com"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="password" className="text-xs font-medium text-ink">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-border-subtle bg-paper px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-blue"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p className="text-sm text-rose-700 bg-rose-50/60 border border-rose-200 rounded-md px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={busy || !email || !password}
                className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-brand-blue px-3 py-2 text-sm font-medium text-white hover:bg-brand-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-ink-muted">
          Trouble signing in? Contact your GF administrator.
        </p>
      </div>
    </div>
  )
}

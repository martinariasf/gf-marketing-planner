import { useCallback, useEffect, useState } from 'react'
import { loadClient, type ClientBundle } from '@/lib/client-data'

export interface UseClientState {
  data: ClientBundle | null
  loading: boolean
  error: string | null
  /** Re-fetch the current client. Useful after a PocketBase save. */
  refetch: () => void
}

export function useClient(slug: string): UseClientState {
  const [state, setState] = useState<{
    data: ClientBundle | null
    loading: boolean
    error: string | null
  }>({
    data: null,
    loading: true,
    error: null,
  })

  const [tick, setTick] = useState(0)

  const refetch = useCallback(() => {
    setTick((t) => t + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    loadClient(slug)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : String(e)
          setState({ data: null, loading: false, error: msg })
        }
      })
    return () => {
      cancelled = true
    }
  }, [slug, tick])

  return { ...state, refetch }
}

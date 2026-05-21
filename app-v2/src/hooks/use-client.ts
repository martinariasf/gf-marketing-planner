import { useEffect, useState } from 'react'
import { loadClient, type ClientBundle } from '@/lib/client-data'

export interface UseClientState {
  data: ClientBundle | null
  loading: boolean
  error: string | null
}

export function useClient(slug: string): UseClientState {
  const [state, setState] = useState<UseClientState>({
    data: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    setState({ data: null, loading: true, error: null })
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
  }, [slug])

  return state
}

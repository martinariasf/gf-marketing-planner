import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Track the slug the current `data` belongs to so we can tell a genuine
  // client switch (or first load) apart from a same-client refetch.
  const lastSlug = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // A refetch (same slug, data already present) must NOT flip `loading` to
    // true: the client layout renders a full-screen skeleton while `loading`,
    // which unmounts the whole app — including the chat panel — mid-stream.
    // That looked like a spurious page reload and dropped Viktor's reply
    // (the assistant message only persists when the run finishes). Only a
    // first load or a real client switch should blank the screen.
    const slugChanged = lastSlug.current !== slug
    lastSlug.current = slug
    setState((s) => ({
      data: slugChanged ? null : s.data,
      loading: slugChanged || s.data === null,
      error: null,
    }))
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

import { useCallback, useEffect } from 'react'

import { describeError, fetchNetwork } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'

/**
 * Loads the network state once on mount and exposes a manual refresh.
 *
 * The backend may not be running during frontend development, so a failure
 * here is an expected state the shell renders around rather than a crash.
 */
export function useNetwork() {
  const network = useAppStore((state) => state.network)
  const error = useAppStore((state) => state.networkError)
  const loading = useAppStore((state) => state.networkLoading)
  const setNetwork = useAppStore((state) => state.setNetwork)
  const setError = useAppStore((state) => state.setNetworkError)
  const setLoading = useAppStore((state) => state.setNetworkLoading)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setNetwork(await fetchNetwork())
    } catch (caught) {
      setError(describeError(caught))
    }
  }, [setNetwork, setError, setLoading])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { network, error, loading, refresh }
}

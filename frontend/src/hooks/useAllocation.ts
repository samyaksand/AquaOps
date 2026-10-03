import { useCallback } from 'react'

import { describeError, runAllocation } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import type { StrategyName } from '@/types/network'

/**
 * Runs the allocation engine for the current strategy on demand. The result
 * is computed server-side; this hook only manages the request lifecycle.
 */
export function useAllocation() {
  const allocation = useAppStore((state) => state.allocation)
  const error = useAppStore((state) => state.allocationError)
  const loading = useAppStore((state) => state.allocationLoading)
  const setAllocation = useAppStore((state) => state.setAllocation)
  const setError = useAppStore((state) => state.setAllocationError)
  const setLoading = useAppStore((state) => state.setAllocationLoading)

  const allocate = useCallback(
    async (strategy: StrategyName) => {
      setLoading(true)
      try {
        setAllocation(await runAllocation(strategy))
      } catch (caught) {
        setError(describeError(caught))
      }
    },
    [setAllocation, setError, setLoading],
  )

  return { allocation, error, loading, allocate }
}

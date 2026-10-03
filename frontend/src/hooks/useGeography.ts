import { useEffect, useState } from 'react'

import { describeError, fetchGeography } from '@/lib/api'
import type { Geography } from '@/types/network'

/**
 * Loads entity coordinates once. Geography is static presentation data, so it
 * does not need the refresh plumbing the network state has.
 */
export function useGeography() {
  const [geography, setGeography] = useState<Geography | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchGeography()
      .then((data) => {
        if (active) setGeography(data)
      })
      .catch((caught: unknown) => {
        if (active) setError(describeError(caught))
      })
    return () => {
      active = false
    }
  }, [])

  return { geography, error }
}

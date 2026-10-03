import { useEffect, useRef, useState } from 'react'

import { useAppStore } from '@/store/useAppStore'
import type {
  AllocationResult,
  NetworkState,
  ScenarioSummary,
} from '@/types/network'

/**
 * Subscribes to the backend's `/ws` endpoint and folds allocation/scenario
 * events into the existing app state, the same state a direct REST call
 * would set — this never computes anything itself, only applies results the
 * server already computed (whether triggered by this tab, another tab, or
 * the Kafka → Redis relay).
 *
 * Reconnects with backoff on drop. The rest of the UI works the same
 * without a live connection, since every state-changing action also has a
 * REST path; this only adds "stay in sync automatically".
 */

export type RealtimeStatus = 'connecting' | 'live' | 'offline'

interface ServerEvent {
  type: string
  allocation?: AllocationResult
  network?: NetworkState
  scenario?: ScenarioSummary
}

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000]

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/v1/ws`
}

export function useRealtime() {
  const [status, setStatus] = useState<RealtimeStatus>('connecting')
  const [lastEventAt, setLastEventAt] = useState<number | null>(null)
  const setAllocation = useAppStore((state) => state.setAllocation)

  const attempt = useRef(0)
  const closedByUs = useRef(false)

  useEffect(() => {
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      setStatus('connecting')
      socket = new WebSocket(wsUrl())

      socket.onopen = () => {
        attempt.current = 0
        setStatus('live')
      }

      socket.onmessage = (event: MessageEvent<string>) => {
        let frame: ServerEvent
        try {
          frame = JSON.parse(event.data)
        } catch {
          return
        }
        handleFrame(frame, setAllocation)
        setLastEventAt(Date.now())
      }

      socket.onclose = () => {
        if (closedByUs.current) return
        setStatus('offline')
        const delay =
          RECONNECT_DELAYS_MS[
            Math.min(attempt.current, RECONNECT_DELAYS_MS.length - 1)
          ]
        attempt.current += 1
        reconnectTimer = setTimeout(connect, delay)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      closedByUs.current = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      socket?.close()
    }
  }, [setAllocation])

  return { status, lastEventAt }
}

/**
 * Only `allocation_computed` (the plain, non-scenario allocation) updates
 * the normal-mode store here. Scenario events are intentionally not applied
 * globally: a scenario computed in one browser tab/session is that tab's
 * working state, not something that should silently replace what another
 * tab is comparing against. Normal allocations are shared baseline state,
 * so keeping every tab's "Normal" in sync is the useful default.
 */
function handleFrame(
  frame: ServerEvent,
  setAllocation: (allocation: AllocationResult) => void,
): void {
  if (frame.type === 'allocation_computed' || frame.type === 'allocation') {
    if (frame.allocation) setAllocation(frame.allocation)
  }
}

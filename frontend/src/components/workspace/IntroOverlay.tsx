import { X } from 'lucide-react'
import { useState } from 'react'

import { formatCompact, formatPercent } from '@/lib/format'
import { summarizeNetwork } from '@/lib/networkSummary'
import type { NetworkState } from '@/types/network'

const STORAGE_KEY = 'aquaops-intro-dismissed'

interface IntroOverlayProps {
  network: NetworkState | null
}

/**
 * A one-time, dismissible first-visit banner — states the actual stakes
 * (real supply/demand numbers for the loaded network) rather than generic
 * feature bullets, and sits as a thin strip pinned to the top of the map
 * canvas rather than a centered modal, so the network itself is visible
 * underneath immediately instead of being mostly covered on first paint.
 * Dismissal persists (mirroring `useThemeStore`'s localStorage pattern) so
 * it never reappears for a returning visitor.
 */
export function IntroOverlay({ network }: IntroOverlayProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  const dismiss = () => {
    setDismissed(true)
    try {
      window.localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // Best-effort only — the banner just reappears next visit.
    }
  }

  if (dismissed || !network) return null

  const summary = summarizeNetwork(network)
  const shortfall = summary.demand - summary.supply

  return (
    <div className="rise-in pointer-events-none absolute inset-x-3 top-3 z-30 flex justify-center">
      <div className="pointer-events-auto flex w-full max-w-2xl items-start gap-3 rounded-xl border border-aqua-500/30 bg-depth/98 px-4 py-3 shadow-xl backdrop-blur">
        <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-muted">
          {shortfall > 0 ? (
            <>
              <span className="font-semibold text-ink">
                Rivertown's reservoirs can't fully cover today's demand
              </span>{' '}
              - {formatCompact(summary.demand)} m³/day needed,{' '}
              {formatCompact(summary.supply)} m³/day available (
              {formatPercent(summary.coverage)} covered). AquaOps decides who
              gets water first, and lets you compare how that decision
              changes under disruption.
            </>
          ) : (
            <>
              <span className="font-semibold text-ink">
                Rivertown's network has headroom today
              </span>{' '}
              - {formatCompact(summary.supply)} m³/day available against{' '}
              {formatCompact(summary.demand)} m³/day of demand. AquaOps lets
              you simulate a disruption and see how allocation decisions
              change when that headroom disappears.
            </>
          )}
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            Simulated decision support - not connected to live
            infrastructure.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss introduction"
          className="shrink-0 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-raised hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}

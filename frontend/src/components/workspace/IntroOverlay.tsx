import { Droplets, GitCompareArrows, ScatterChart, Waves, X } from 'lucide-react'
import { useState } from 'react'

const STORAGE_KEY = 'aquaops-intro-dismissed'

const CAPABILITIES = [
  { icon: Waves, text: 'Allocate limited water across competing demands' },
  { icon: GitCompareArrows, text: 'Test disruptions and compare strategies' },
  { icon: ScatterChart, text: 'Explore trade-offs and operational impact' },
]

/**
 * A one-time, dismissible overlay on first visit — not a tutorial, just
 * enough to orient a first-time visitor before they start clicking. Floats
 * over the map rather than pushing it down, so the network stays the first
 * thing seen and this never costs vertical space once dismissed. Dismissal
 * persists (mirroring `useThemeStore`'s localStorage pattern) so it never
 * reappears for a returning visitor.
 */
export function IntroOverlay() {
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
      // Best-effort only — the overlay just reappears next visit.
    }
  }

  if (dismissed) return null

  return (
    <div className="rise-in pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-6">
      <div className="pointer-events-auto w-full max-w-sm rounded-2xl border border-aqua-500/30 bg-depth/98 p-5 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-aqua-500/15 ring-1 ring-aqua-500/25">
              <Droplets className="size-4.5 text-aqua-400" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold text-ink">AquaOps</h2>
              <p className="text-xs text-ink-subtle">
                Explore how urban water can be allocated under pressure
              </p>
            </div>
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

        <ul className="mt-4 space-y-2">
          {CAPABILITIES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-2.5 text-[13px] text-ink-muted">
              <Icon className="size-3.5 shrink-0 text-aqua-400" aria-hidden="true" />
              {text}
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full rounded-xl bg-aqua-500 py-2 text-sm font-semibold text-abyss transition-colors hover:bg-aqua-400"
        >
          Explore the network
        </button>
      </div>
    </div>
  )
}

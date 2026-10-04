import { AnimatePresence, motion } from 'framer-motion'
import { Maximize2, X } from 'lucide-react'

import { MapWorkspace } from '@/components/workspace/MapWorkspace'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { formatPercent, formatVolume } from '@/lib/format'
import type { AllocationResult, NetworkState } from '@/types/network'

interface ScenarioMapOverlayProps {
  open: boolean
  onClose: () => void
  network: NetworkState | null
  loading: boolean
  error: string | null
  onRetry: () => void
  allocation: AllocationResult | null
  showingScenario: boolean
  highlightCodes: Set<string>
  scenarioName: string
  changeSummary: string | null
}

/** A small trigger button for opening the full-viewport map — placed where
 * the always-visible map panel used to sit, so the Scenario Lab's own
 * workflow gets that space instead. */
export function ScenarioMapTrigger({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3.5 text-left transition-colors hover:border-ink-subtle/30 hover:bg-raised/40"
    >
      <div className="flex items-center gap-2.5">
        <Maximize2 className="size-4 text-ink-muted" aria-hidden="true" />
        <div>
          <p className="text-[13px] font-semibold text-ink">View Network Map</p>
          <p className="text-[11px] text-ink-subtle">
            See affected assets highlighted on the full network
          </p>
        </div>
      </div>
      <span className="shrink-0 text-xs font-medium text-ink-subtle">Open →</span>
    </button>
  )
}

/**
 * Full-viewport map overlay — reuses `MapWorkspace`/`NetworkMap`/`MapCanvas`
 * as-is (no second map implementation), just hosted in a fixed, full-screen
 * layer instead of a small sidebar panel. Keeps the active scenario's
 * highlight set and a compact header naming the scenario, its changes, and
 * its real impact metrics so the map stays legible without leaving this
 * view's context.
 */
export function ScenarioMapOverlay({
  open,
  onClose,
  network,
  loading,
  error,
  onRetry,
  allocation,
  showingScenario,
  highlightCodes,
  scenarioName,
  changeSummary,
}: ScenarioMapOverlayProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Network map"
          className="fixed inset-0 z-50 flex flex-col bg-abyss p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <IconButton label="Back to Scenario Lab" onClick={onClose}>
                <X className="size-4" />
              </IconButton>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {scenarioName || 'Untitled scenario'}
                  </p>
                  {showingScenario ? <Badge tone="warn">Scenario</Badge> : null}
                </div>
                {changeSummary ? (
                  <p className="truncate text-[11px] text-ink-subtle">
                    {changeSummary}
                  </p>
                ) : null}
              </div>
            </div>
            {allocation ? (
              <div className="flex shrink-0 items-center gap-4 text-[11px]">
                <ImpactStat
                  label="Allocated"
                  value={`${formatVolume(allocation.metrics.total_supplied_m3_per_day)} m³/d`}
                />
                <ImpactStat
                  label="Unmet"
                  value={`${formatVolume(allocation.metrics.total_unmet_m3_per_day)} m³/d`}
                />
                <ImpactStat
                  label="Coverage"
                  value={formatPercent(allocation.metrics.demand_coverage_ratio)}
                />
              </div>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              Back to Scenario Lab
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 flex-col">
            <MapWorkspace
              network={network}
              loading={loading}
              error={error}
              onRetry={onRetry}
              allocation={allocation}
              showingScenario={showingScenario}
              highlightCodes={highlightCodes}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function ImpactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="text-[10px] tracking-wide text-ink-subtle uppercase">{label}</p>
      <p className="tabular text-sm font-semibold text-ink">{value}</p>
    </div>
  )
}

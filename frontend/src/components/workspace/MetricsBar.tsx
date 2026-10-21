import {
  CheckCircle2,
  Droplets,
  Gauge,
  Hospital,
  Truck,
  Users,
  Waves,
} from 'lucide-react'
import { useMemo } from 'react'

import { StatusBadge } from '@/components/ui/Badge'
import { Metric } from '@/components/ui/Metric'
import { formatCompact, formatPercent, formatPopulation } from '@/lib/format'
import { summarizeNetwork } from '@/lib/networkSummary'
import type { AllocationResult, NetworkState } from '@/types/network'

interface MetricsBarProps {
  network: NetworkState | null
  /** When an allocation has actually run, its real demand-served/unmet
   * figures are shown alongside the network's structural supply/demand
   * ratio — these are two different things (capacity vs. an actual
   * computed outcome) and are kept visually and semantically separate
   * rather than collapsed into one ambiguous "coverage" number. */
  allocation?: AllocationResult | null
}

export function MetricsBar({ network, allocation = null }: MetricsBarProps) {
  const summary = useMemo(
    () => (network ? summarizeNetwork(network) : null),
    [network],
  )

  return (
    <section
      aria-label="Network metrics"
      // `shrink-0` would force the map (this section's flex sibling,
      // and the primary workspace per CLAUDE.md) to give up height to this
      // section instead at short viewports — capping this section's own
      // height and letting IT scroll internally when space is tight keeps
      // the map's own box intact, which is the more important one to
      // protect. The allocation-result block below the base metrics (added
      // alongside this change) made this section noticeably taller than
      // before, which is what first exposed the squeeze.
      className="max-h-[45vh] shrink-0 overflow-y-auto rounded-2xl border border-hairline bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Gauge className="size-4 text-ink-muted" aria-hidden="true" />
          <h2 className="text-[15px] font-semibold text-ink">Network Posture</h2>
        </div>
        {summary ? (
          <StatusBadge
            state={
              summary.impaired === 0
                ? 'online'
                : summary.coverage < 1
                  ? 'unavailable'
                  : 'derated'
            }
          />
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-5 px-5 py-5 sm:grid-cols-3 lg:grid-cols-6">
        {summary ? (
          <>
            <Metric
              label="Supply-to-demand ratio"
              value={formatPercent(summary.coverage)}
              tone={
                summary.coverage >= 1
                  ? 'ok'
                  : summary.coverage >= 0.75
                    ? 'warn'
                    : 'critical'
              }
              hint={
                summary.coverage < 1
                  ? 'Available supply is below total demand'
                  : 'Available supply meets or exceeds demand'
              }
              icon={<Gauge className="size-3.5" />}
            />
            <Metric
              label="Available supply"
              value={formatCompact(summary.supply)}
              unit="m³/day"
              icon={<Waves className="size-3.5" />}
            />
            <Metric
              label="Total demand"
              value={formatCompact(summary.demand)}
              unit="m³/day"
              icon={<Droplets className="size-3.5" />}
            />
            <Metric
              label="Residents"
              value={formatPopulation(summary.population)}
              icon={<Users className="size-3.5" />}
            />
            <Metric
              label="Critical facilities"
              value={String(summary.facilities)}
              icon={<Hospital className="size-3.5" />}
            />
            <Metric
              label="Tankers ready"
              value={String(summary.tankersReady)}
              hint={`of ${network?.tankers.length ?? 0} in fleet`}
              icon={<Truck className="size-3.5" />}
            />
          </>
        ) : (
          Array.from({ length: 6 }).map((_, index) => <MetricSkeleton key={index} />)
        )}
      </div>

      {allocation ? (
        <div className="border-t border-hairline px-5 py-5">
          <p className="mb-3 text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
            Allocation result - {allocation.strategy}
          </p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
            <Metric
              label="Demand served"
              value={formatPercent(allocation.metrics.demand_coverage_ratio)}
              tone={
                allocation.metrics.demand_coverage_ratio >= 1
                  ? 'ok'
                  : allocation.metrics.demand_coverage_ratio >= 0.75
                    ? 'warn'
                    : 'critical'
              }
              hint="Share of total demand actually delivered"
              icon={<CheckCircle2 className="size-3.5" />}
            />
            <Metric
              label="Allocated supply"
              value={formatCompact(allocation.metrics.total_supplied_m3_per_day)}
              unit="m³/day"
              hint="Volume actually delivered by this allocation"
              icon={<Waves className="size-3.5" />}
            />
            <Metric
              label="Unmet demand"
              value={formatCompact(allocation.metrics.total_unmet_m3_per_day)}
              unit="m³/day"
              tone={allocation.metrics.total_unmet_m3_per_day > 0 ? 'critical' : 'ok'}
              hint="Demand this allocation could not deliver"
              icon={<Droplets className="size-3.5" />}
            />
            <Metric
              label="Below minimum"
              value={String(allocation.metrics.minimum_demand_shortfalls.length)}
              tone={allocation.metrics.minimum_demand_shortfalls.length > 0 ? 'critical' : 'ok'}
              hint="Demand points under their lifeline minimum"
              icon={<Hospital className="size-3.5" />}
            />
          </div>
        </div>
      ) : null}
    </section>
  )
}

function MetricSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-2.5 w-20 rounded bg-overlay" />
      <div className="mt-2.5 h-6 w-16 rounded bg-overlay" />
    </div>
  )
}

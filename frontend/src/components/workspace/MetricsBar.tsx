import { clsx } from 'clsx'
import {
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
import type { NetworkState } from '@/types/network'

/**
 * Derived network-wide figures. These are structural facts about the loaded
 * network — not allocation results, which the engine computes server-side.
 */
function summarize(network: NetworkState) {
  const supply = network.sources
    .filter((item) => item.state !== 'unavailable')
    .reduce((total, item) => total + item.available_m3_per_day, 0)

  const demand = network.demands.reduce(
    (total, item) => total + item.demand_m3_per_day,
    0,
  )

  const population = network.demands
    .filter((item) => item.kind === 'zone')
    .reduce((total, item) => total + item.population, 0)

  const facilities = network.demands.filter(
    (item) => item.kind === 'facility',
  ).length

  const tankersReady = network.tankers.filter(
    (item) => item.state === 'online',
  ).length

  const impaired = [...network.sources, ...network.transits, ...network.links]
    .filter((item) => item.state !== 'online').length

  return {
    supply,
    demand,
    population,
    facilities,
    tankersReady,
    impaired,
    coverage: demand > 0 ? Math.min(supply / demand, 1) : 1,
  }
}

export function MetricsBar({ network }: { network: NetworkState | null }) {
  const summary = useMemo(
    () => (network ? summarize(network) : null),
    [network],
  )

  return (
    <section
      aria-label="Network metrics"
      className="shrink-0 rounded-panel border border-hairline bg-surface"
    >
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-aqua-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink">Network Posture</h2>
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

      <div
        className={clsx(
          'grid gap-x-6 gap-y-4 px-4 py-3.5',
          'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
        )}
      >
        {summary ? (
          <>
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
              label="Supply coverage"
              value={formatPercent(summary.coverage)}
              tone={
                summary.coverage >= 1
                  ? 'ok'
                  : summary.coverage >= 0.75
                    ? 'warn'
                    : 'critical'
              }
              hint={summary.coverage < 1 ? 'Demand exceeds supply' : 'Headroom available'}
              icon={<Gauge className="size-3.5" />}
            />
            <Metric
              label="Residents"
              value={formatPopulation(summary.population)}
              icon={<Users className="size-3.5" />}
            />
            <Metric
              label="Critical facilities"
              value={String(summary.facilities)}
              tone="info"
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
    </section>
  )
}

function MetricSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-2.5 w-20 rounded bg-overlay" />
      <div className="mt-2 h-5 w-14 rounded bg-overlay" />
    </div>
  )
}

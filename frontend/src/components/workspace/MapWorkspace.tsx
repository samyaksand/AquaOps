import { Building2, Factory, Hospital, Map, Truck, Waves } from 'lucide-react'

import { NetworkMap } from '@/components/map/NetworkMap'
import { Badge } from '@/components/ui/Badge'
import {
  STRATEGY_LABELS,
  type AllocationResult,
  type NetworkState,
  type StrategyName,
} from '@/types/network'

interface MapWorkspaceProps {
  network: NetworkState | null
  loading: boolean
  error: string | null
  onRetry: () => void
  allocation?: AllocationResult | null
  showingScenario?: boolean
}

/** Chrome around the interactive network map: title bar and type legend. */
export function MapWorkspace({
  network,
  loading,
  error,
  onRetry,
  allocation = null,
  showingScenario = false,
}: MapWorkspaceProps) {
  return (
    <div
      className={
        showingScenario
          ? 'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-status-warn/35 bg-surface'
          : 'relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel border border-hairline bg-surface'
      }
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Map className="size-4 text-ink-muted" aria-hidden="true" />
          <h2 className="text-[15px] font-semibold text-ink">Network Map</h2>
          <Badge tone="neutral">Rivertown</Badge>
          {showingScenario ? <Badge tone="warn">Scenario</Badge> : null}
          {allocation ? (
            <Badge tone="info">{STRATEGY_LABELS[allocation.strategy as StrategyName] ?? allocation.strategy} allocated</Badge>
          ) : null}
        </div>
        {network ? (
          <span className="tabular hidden text-xs text-ink-subtle sm:block">
            {network.sources.length +
              network.transits.length +
              network.demands.length}{' '}
            nodes · {network.links.length} pipelines
          </span>
        ) : null}
      </div>

      <div className="relative min-h-0 flex-1">
        <NetworkMap
          network={network}
          loading={loading}
          error={error}
          onRetry={onRetry}
          allocation={allocation}
        />
      </div>

      <Legend network={network} />
    </div>
  )
}

const ENTRIES = [
  { kind: 'reservoir', icon: Waves, label: 'Reservoir' },
  { kind: 'plant', icon: Factory, label: 'Plant' },
  { kind: 'zone', icon: Building2, label: 'Demand zone' },
  { kind: 'facility', icon: Hospital, label: 'Critical facility' },
  { kind: 'tanker', icon: Truck, label: 'Tanker' },
] as const

function Legend({ network }: { network: NetworkState | null }) {
  const counts: Record<string, number> = network
    ? {
        reservoir: network.sources.length,
        plant: network.transits.length,
        zone: network.demands.filter((item) => item.kind === 'zone').length,
        facility: network.demands.filter((item) => item.kind === 'facility')
          .length,
        tanker: network.tankers.length,
      }
    : {}

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2 border-t border-hairline px-5 py-3">
      {ENTRIES.map(({ kind, icon: Icon, label }) => (
        <div key={kind} className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-ink-subtle" aria-hidden="true" />
          <span className="text-xs text-ink-muted">{label}</span>
          {network ? (
            <span className="tabular text-xs font-semibold text-ink">
              {counts[kind]}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

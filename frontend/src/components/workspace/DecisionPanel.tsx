import { clsx } from 'clsx'
import { Hospital, Building2, PlayCircle, SlidersHorizontal } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { Bar } from '@/components/ui/Metric'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/States'
import { formatPopulation, formatVolume } from '@/lib/format'
import { useAppStore } from '@/store/useAppStore'
import {
  PRIORITY_LABELS,
  STRATEGIES,
  STRATEGY_LABELS,
  type DemandPoint,
  type NetworkState,
  type StrategyName,
} from '@/types/network'

const STRATEGY_OPTIONS = STRATEGIES.map((value) => ({
  value,
  label: STRATEGY_LABELS[value],
}))

const PRIORITY_TONES = ['critical', 'warn', 'info', 'neutral'] as const

export function DecisionPanel({ network }: { network: NetworkState | null }) {
  const strategy = useAppStore((state) => state.strategy)
  const setStrategy = useAppStore((state) => state.setStrategy)

  return (
    <aside
      aria-label="Decision panel"
      className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto xl:w-80"
    >
      <Panel>
        <PanelHeader
          title="Allocation Strategy"
          subtitle="Choose whose needs come first"
          icon={<SlidersHorizontal className="size-4" />}
        />
        <PanelBody className="space-y-3">
          <Select
            aria-label="Allocation strategy"
            value={strategy}
            options={STRATEGY_OPTIONS}
            onChange={(event) =>
              setStrategy(event.target.value as StrategyName)
            }
          />
          <p className="text-xs leading-relaxed text-ink-subtle">
            Strategies trade off differently. No single one is optimal — the
            comparison is the point.
          </p>
          <Button
            variant="primary"
            className="w-full"
            disabled
            icon={<PlayCircle className="size-4" />}
          >
            Run Allocation
          </Button>
          <p className="text-center text-[11px] text-ink-subtle">
            Available once the allocation view lands
          </p>
        </PanelBody>
      </Panel>

      <Panel className="flex min-h-0 flex-col">
        <PanelHeader
          title="Demand Priorities"
          subtitle={
            network ? `${network.demands.length} demand points` : undefined
          }
          icon={<Building2 className="size-4" />}
        />
        {network && network.demands.length > 0 ? (
          <ul className="divide-y divide-hairline">
            {[...network.demands]
              .sort(
                (a, b) =>
                  a.priority_rank - b.priority_rank ||
                  b.demand_m3_per_day - a.demand_m3_per_day,
              )
              .map((point) => (
                <DemandRow key={point.code} point={point} />
              ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Building2 className="size-4" />}
            title="No demand points"
            description="Demand zones and critical facilities will appear here."
          />
        )}
      </Panel>
    </aside>
  )
}

function DemandRow({ point }: { point: DemandPoint }) {
  const selected = useAppStore((state) => state.selectedNodeCode)
  const select = useAppStore((state) => state.selectNode)
  const isSelected = selected === point.code
  const minimumShare =
    point.demand_m3_per_day > 0
      ? point.minimum_demand_m3_per_day / point.demand_m3_per_day
      : 0

  return (
    <li>
      <button
        type="button"
        onClick={() => select(isSelected ? null : point.code)}
        aria-pressed={isSelected}
        className={clsx(
          'w-full px-4 py-3 text-left transition-colors',
          isSelected ? 'bg-raised' : 'hover:bg-raised/50',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            {point.kind === 'facility' ? (
              <Hospital
                className="size-3.5 shrink-0 text-status-critical"
                aria-hidden="true"
              />
            ) : (
              <Building2
                className="size-3.5 shrink-0 text-ink-subtle"
                aria-hidden="true"
              />
            )}
            <span className="truncate text-sm font-medium text-ink">
              {point.name}
            </span>
          </div>
          <Badge tone={PRIORITY_TONES[point.priority_rank] ?? 'neutral'}>
            {PRIORITY_LABELS[point.priority_rank] ?? 'Unranked'}
          </Badge>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="tabular text-ink-muted">
            {formatVolume(point.demand_m3_per_day)}
            <span className="text-ink-subtle"> m³/day</span>
          </span>
          {point.population > 0 ? (
            <span className="tabular text-ink-subtle">
              {formatPopulation(point.population)} served
            </span>
          ) : null}
        </div>

        <div className="mt-2">
          <Bar
            ratio={minimumShare}
            tone={point.kind === 'facility' ? 'critical' : 'neutral'}
          />
          <p className="mt-1 text-[11px] text-ink-subtle">
            Lifeline minimum {formatVolume(point.minimum_demand_m3_per_day)} m³
          </p>
        </div>
      </button>
    </li>
  )
}

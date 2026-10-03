import { clsx } from 'clsx'
import {
  AlertTriangle,
  Building2,
  Droplets,
  Hospital,
  PlayCircle,
  SlidersHorizontal,
} from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { Bar, Metric } from '@/components/ui/Metric'
import { Select } from '@/components/ui/Select'
import { EmptyState, Spinner } from '@/components/ui/States'
import { useAllocation } from '@/hooks/useAllocation'
import { formatPercent, formatPopulation, formatVolume } from '@/lib/format'
import { useAppStore } from '@/store/useAppStore'
import {
  PRIORITY_LABELS,
  STRATEGIES,
  STRATEGY_LABELS,
  type DemandAllocation,
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
  const { allocation, error, loading, allocate } = useAllocation()

  return (
    <aside
      aria-label="Decision panel"
      className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto"
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
            disabled={!network || loading}
            onClick={() => void allocate(strategy)}
            icon={
              loading ? (
                <Spinner className="text-abyss" />
              ) : (
                <PlayCircle className="size-4" />
              )
            }
          >
            {loading ? 'Allocating…' : 'Run Allocation'}
          </Button>

          {error ? (
            <div className="flex items-start gap-2 rounded-md bg-status-critical/10 px-2.5 py-2 text-xs text-status-critical">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {allocation ? (
            <div className="space-y-2 rounded-md border border-hairline bg-raised/50 p-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
                  {STRATEGY_LABELS[allocation.strategy as StrategyName] ??
                    allocation.strategy}
                </span>
                <Badge
                  tone={
                    allocation.metrics.demand_coverage_ratio >= 1
                      ? 'ok'
                      : allocation.metrics.demand_coverage_ratio >= 0.75
                        ? 'warn'
                        : 'critical'
                  }
                >
                  {formatPercent(allocation.metrics.demand_coverage_ratio)} met
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                <Metric
                  label="Allocated"
                  value={formatVolume(allocation.metrics.total_supplied_m3_per_day)}
                  unit="m³/day"
                  tone="ok"
                  icon={<Droplets className="size-3.5" />}
                />
                <Metric
                  label="Unmet"
                  value={formatVolume(allocation.metrics.total_unmet_m3_per_day)}
                  unit="m³/day"
                  tone={
                    allocation.metrics.total_unmet_m3_per_day > 0
                      ? 'critical'
                      : 'ok'
                  }
                  icon={<AlertTriangle className="size-3.5" />}
                />
              </div>
              {allocation.metrics.minimum_demand_shortfalls.length > 0 ? (
                <p className="text-[11px] text-status-critical">
                  {allocation.metrics.minimum_demand_shortfalls.length} point(s)
                  below lifeline minimum
                </p>
              ) : (
                <p className="text-[11px] text-status-ok">
                  All demand points meet their minimum
                </p>
              )}
            </div>
          ) : !loading && !error ? (
            <p className="text-center text-[11px] text-ink-subtle">
              Run an allocation to see results on the map
            </p>
          ) : null}
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
                <DemandRow
                  key={point.code}
                  point={point}
                  allocation={
                    allocation?.allocations.find(
                      (item) => item.code === point.code,
                    ) ?? null
                  }
                />
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

function DemandRow({
  point,
  allocation,
}: {
  point: DemandPoint
  allocation: DemandAllocation | null
}) {
  const selected = useAppStore((state) => state.selectedNodeCode)
  const select = useAppStore((state) => state.selectNode)
  const isSelected = selected === point.code
  const minimumShare =
    point.demand_m3_per_day > 0
      ? point.minimum_demand_m3_per_day / point.demand_m3_per_day
      : 0
  const suppliedShare = allocation
    ? point.demand_m3_per_day > 0
      ? allocation.supplied_m3_per_day / point.demand_m3_per_day
      : 1
    : null

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

        <div className="mt-2.5 flex items-center justify-between text-xs">
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

        {allocation && suppliedShare !== null ? (
          <div className="mt-2">
            <Bar
              ratio={suppliedShare}
              tone={
                allocation.fully_supplied
                  ? 'ok'
                  : allocation.meets_minimum
                    ? 'warn'
                    : 'critical'
              }
            />
            <div className="mt-1 flex items-center justify-between text-[11px]">
              <span className="text-ink-subtle">
                {formatVolume(allocation.supplied_m3_per_day)} m³ supplied
              </span>
              <span
                className={
                  allocation.unmet_m3_per_day > 0
                    ? 'text-status-critical'
                    : 'text-status-ok'
                }
              >
                {allocation.unmet_m3_per_day > 0
                  ? `${formatVolume(allocation.unmet_m3_per_day)} m³ unmet`
                  : 'Fully met'}
              </span>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <Bar
              ratio={minimumShare}
              tone={point.kind === 'facility' ? 'critical' : 'neutral'}
            />
            <p className="mt-1 text-[11px] text-ink-subtle">
              Lifeline minimum {formatVolume(point.minimum_demand_m3_per_day)} m³
            </p>
          </div>
        )}
      </button>
    </li>
  )
}

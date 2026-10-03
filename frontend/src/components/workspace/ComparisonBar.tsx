import { GitCompareArrows, TrendingDown, TrendingUp } from 'lucide-react'

import { formatPercent, formatVolume } from '@/lib/format'
import type { AllocationResult } from '@/types/network'

interface ComparisonBarProps {
  normal: AllocationResult | null
  scenario: AllocationResult | null
}

/**
 * Before/after strip comparing the normal allocation against the scenario
 * allocation. Both results come straight from the API; nothing here is
 * recomputed, only differenced for display.
 */
export function ComparisonBar({ normal, scenario }: ComparisonBarProps) {
  if (!scenario) return null

  return (
    <section
      aria-label="Normal vs scenario comparison"
      className="shrink-0 rounded-panel border border-status-warn/30 bg-surface"
    >
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <GitCompareArrows className="size-4 text-status-warn" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">Normal vs Scenario</h2>
        {!normal ? (
          <span className="text-[11px] text-ink-subtle">
            — run a normal allocation to compare against it
          </span>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-4">
        <CompareMetric
          label="Allocated"
          before={normal?.metrics.total_supplied_m3_per_day}
          after={scenario.metrics.total_supplied_m3_per_day}
          unit="m³/day"
        />
        <CompareMetric
          label="Unmet"
          before={normal?.metrics.total_unmet_m3_per_day}
          after={scenario.metrics.total_unmet_m3_per_day}
          unit="m³/day"
          invert
        />
        <CompareMetric
          label="Coverage"
          before={normal?.metrics.demand_coverage_ratio}
          after={scenario.metrics.demand_coverage_ratio}
          percent
        />
        <CompareMetric
          label="Below minimum"
          before={normal?.metrics.minimum_demand_shortfalls.length}
          after={scenario.metrics.minimum_demand_shortfalls.length}
          invert
        />
      </div>
    </section>
  )
}

function CompareMetric({
  label,
  before,
  after,
  unit,
  percent,
  invert,
}: {
  label: string
  before: number | undefined
  after: number
  unit?: string
  percent?: boolean
  invert?: boolean
}) {
  const format = (value: number) =>
    percent ? formatPercent(value) : formatVolume(value)

  const delta = before !== undefined ? after - before : null
  const worse = delta !== null && delta !== 0 && (invert ? delta > 0 : delta < 0)
  const better = delta !== null && delta !== 0 && (invert ? delta < 0 : delta > 0)
  const toneClass = worse
    ? 'text-status-critical'
    : better
      ? 'text-status-ok'
      : 'text-ink'

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`tabular text-lg font-semibold ${toneClass}`}>
          {format(after)}
        </span>
        {unit ? <span className="text-[11px] text-ink-subtle">{unit}</span> : null}
      </div>
      {delta !== null && delta !== 0 ? (
        <div
          className={`mt-0.5 flex items-center gap-1 text-[11px] ${toneClass}`}
        >
          {delta > 0 ? (
            <TrendingUp className="size-3" aria-hidden="true" />
          ) : (
            <TrendingDown className="size-3" aria-hidden="true" />
          )}
          <span className="tabular">
            {delta > 0 ? '+' : ''}
            {format(delta)} vs normal
          </span>
        </div>
      ) : before !== undefined ? (
        <p className="mt-0.5 text-[11px] text-ink-subtle">No change</p>
      ) : null}
    </div>
  )
}

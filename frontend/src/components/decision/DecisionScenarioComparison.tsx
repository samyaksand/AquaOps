import { GitCompareArrows } from 'lucide-react'

import { formatPercent } from '@/lib/format'
import {
  OBJECTIVE_KEYS,
  OBJECTIVE_LABELS,
  type DecisionAnalysisResult,
} from '@/types/network'

interface DecisionScenarioComparisonProps {
  normal: DecisionAnalysisResult
  scenario: DecisionAnalysisResult
}

/**
 * How the feasible decision space itself changes after a disruption: not
 * one allocation's numbers, but the frontier's shape — how many candidates
 * remain non-dominated, and where the best achievable value on each
 * objective moved. Kept to one compact row per the task's "visually simple"
 * ask.
 */
export function DecisionScenarioComparison({
  normal,
  scenario,
}: DecisionScenarioComparisonProps) {
  const normalBestByObjective = bestPerObjective(normal)
  const scenarioBestByObjective = bestPerObjective(scenario)

  return (
    <div className="rounded-panel border border-status-warn/30 bg-surface">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <GitCompareArrows className="size-4 text-status-warn" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-ink">
          Decision space: Normal vs Scenario
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          label="Pareto-optimal options"
          normal={String(normal.frontier_candidate_ids.length)}
          scenario={String(scenario.frontier_candidate_ids.length)}
          worse={
            scenario.frontier_candidate_ids.length <
            normal.frontier_candidate_ids.length
          }
        />
        {OBJECTIVE_KEYS.map((key) => (
          <Metric
            key={key}
            label={`Best ${OBJECTIVE_LABELS[key]}`}
            normal={formatPercent(normalBestByObjective[key])}
            scenario={formatPercent(scenarioBestByObjective[key])}
            worse={scenarioBestByObjective[key] < normalBestByObjective[key]}
          />
        ))}
      </div>
    </div>
  )
}

function bestPerObjective(
  analysis: DecisionAnalysisResult,
): Record<(typeof OBJECTIVE_KEYS)[number], number> {
  const result = {} as Record<(typeof OBJECTIVE_KEYS)[number], number>
  for (const key of OBJECTIVE_KEYS) {
    result[key] = Math.max(
      0,
      ...analysis.candidates.map((c) => c.objectives[key]),
    )
  }
  return result
}

function Metric({
  label,
  normal,
  scenario,
  worse,
}: {
  label: string
  normal: string
  scenario: string
  worse: boolean
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10px] tracking-wide text-ink-subtle uppercase">
        {label}
      </p>
      <div className="mt-0.5 flex items-baseline gap-1.5 text-sm">
        <span className="tabular text-ink-subtle">{normal}</span>
        <span className="text-ink-subtle">→</span>
        <span
          className={
            worse
              ? 'tabular font-semibold text-status-critical'
              : 'tabular font-semibold text-ink'
          }
        >
          {scenario}
        </span>
      </div>
    </div>
  )
}

import { BarChart3, PlayCircle, ScatterChart } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { useDecisionAnalysis } from '@/hooks/useDecisionAnalysis'
import { useAppStore } from '@/store/useAppStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { NetworkState } from '@/types/network'

import { CandidateDetails } from './CandidateDetails'
import { DecisionScenarioComparison } from './DecisionScenarioComparison'
import { ParetoChart } from './ParetoChart'

interface DecisionAnalysisViewProps {
  network: NetworkState | null
  /** Switches the app to the Network view with the inspected candidate's
   * allocation applied — see AppShell, which owns the actual view routing. */
  onInspectOnMap: () => void
}

/**
 * Decision Analysis: generate candidate allocations across a fixed weight
 * grid, Pareto-filter them, and let the operator explore the trade-off
 * space — the Pareto scatter is the visual centerpiece, with the selected
 * candidate's trade-offs and its route to the map alongside it.
 */
export function DecisionAnalysisView({
  network,
  onInspectOnMap,
}: DecisionAnalysisViewProps) {
  const {
    analysis,
    loading,
    error,
    analyzedScenario,
    selectedCandidateId,
    baselineObjectives,
    normalAnalysis,
    analyze,
    selectCandidate,
  } = useDecisionAnalysis()

  const scenarioMode = useScenarioStore((state) => state.mode)
  const scenarioDrafts = useScenarioStore((state) => state.drafts)
  const setSelectedAllocation = useAppStore(
    (state) => state.setInspectedAllocation,
  )

  const frontierIds = useMemo(
    () => new Set(analysis?.frontier_candidate_ids ?? []),
    [analysis],
  )
  const selected = useMemo(
    () =>
      analysis?.candidates.find(
        (c) => c.candidate_id === selectedCandidateId,
      ) ?? null,
    [analysis, selectedCandidateId],
  )

  const canUseScenario = scenarioMode === 'scenario' && scenarioDrafts.length > 0

  const handleInspect = () => {
    if (!selected) return
    setSelectedAllocation(selected.allocation, selected.candidate_id)
    onInspectOnMap()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Panel>
        <PanelHeader
          title="Decision Analysis"
          subtitle="Generate candidate allocations and explore their trade-offs"
          icon={<ScatterChart className="size-4" />}
          actions={
            <div className="flex items-center gap-2">
              {canUseScenario ? (
                <Badge tone="warn">Analyzing scenario</Badge>
              ) : (
                <Badge tone="ok">Analyzing normal network</Badge>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => void analyze()}
                disabled={!network || loading}
                icon={
                  loading ? (
                    <Spinner className="text-abyss" />
                  ) : (
                    <PlayCircle className="size-3.5" />
                  )
                }
              >
                {loading
                  ? 'Analyzing…'
                  : analysis
                    ? 'Re-run Analysis'
                    : 'Run Analysis'}
              </Button>
            </div>
          }
        />
        {!network ? (
          <PanelBody>
            <EmptyState
              icon={<BarChart3 className="size-4" />}
              title="Waiting for the network"
              description="Decision Analysis needs the network loaded first."
            />
          </PanelBody>
        ) : error ? (
          <PanelBody>
            <ErrorState message={error} onRetry={() => void analyze()} />
          </PanelBody>
        ) : loading ? (
          <PanelBody>
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <Spinner className="size-6 text-aqua-400" />
              <p className="text-sm text-ink-muted">
                Computing candidate allocations…
              </p>
              <p className="text-xs text-ink-subtle">
                Running the allocation engine across a weighted grid of
                strategies.
              </p>
            </div>
          </PanelBody>
        ) : !analysis ? (
          <PanelBody>
            <EmptyState
              icon={<ScatterChart className="size-4" />}
              title="No analysis yet"
              description={
                canUseScenario
                  ? 'Run Analysis to generate candidate allocations for the active scenario and see the trade-offs between them.'
                  : 'Run Analysis to generate candidate allocations for the current network and see the trade-offs between them.'
              }
            />
          </PanelBody>
        ) : (
          <PanelBody className="space-y-4">
            <p className="text-xs leading-relaxed text-ink-subtle">
              Each point is one allocation, computed by the real engine under
              a different balance of priorities.{' '}
              <span className="font-medium text-ink-muted">
                Bright points are Pareto-optimal
              </span>{' '}
              — no other candidate improves on them without giving something
              up elsewhere. Hover a point for its numbers, click to select
              it.
            </p>
            <ParetoChart
              candidates={analysis.candidates}
              frontierIds={frontierIds}
              selectedId={selectedCandidateId}
              onSelect={selectCandidate}
              baseline={baselineObjectives}
            />
          </PanelBody>
        )}
      </Panel>

      {analysis && analyzedScenario && normalAnalysis ? (
        <DecisionScenarioComparison
          normal={normalAnalysis}
          scenario={analysis}
        />
      ) : null}

      {analysis ? (
        <Panel>
          <PanelHeader
            title="Selected decision"
            subtitle={
              selected
                ? undefined
                : 'Click a point on the chart to inspect it'
            }
          />
          <PanelBody>
            {selected ? (
              <CandidateDetails
                candidate={selected}
                baseline={baselineObjectives}
                onInspectOnMap={handleInspect}
              />
            ) : (
              <EmptyState
                icon={<ScatterChart className="size-4" />}
                title="No decision selected"
                description="Select a point on the Pareto chart to see its metrics and trade-offs."
              />
            )}
          </PanelBody>
        </Panel>
      ) : null}
    </div>
  )
}

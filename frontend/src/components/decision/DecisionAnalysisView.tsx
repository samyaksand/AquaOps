import { BarChart3, RotateCcw, ScatterChart, Sparkles } from 'lucide-react'
import { useMemo } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { useDecisionAnalysis } from '@/hooks/useDecisionAnalysis'
import { useAppStore } from '@/store/useAppStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { NetworkState } from '@/types/network'

import { CandidateComparison } from './CandidateComparison'
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
 * space. The Pareto scatter is the visual centerpiece on the left; the
 * selected candidate's detail — metrics, trade-off vs the current
 * allocation, and the route to the map — sits alongside it on the right so
 * reading the chart and acting on a choice never require scrolling between
 * two separate sections.
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
    compareCandidateId,
    setCompareCandidate,
    baselineObjectives,
    normalAnalysis,
    analyze,
    selectCandidate,
    reset,
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
  const comparing = useMemo(
    () =>
      analysis?.candidates.find(
        (c) => c.candidate_id === compareCandidateId,
      ) ?? null,
    [analysis, compareCandidateId],
  )

  const canUseScenario = scenarioMode === 'scenario' && scenarioDrafts.length > 0

  const handleInspect = () => {
    if (!selected) return
    setSelectedAllocation(selected.allocation, selected.candidate_id)
    onInspectOnMap()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <Toolbar
        hasNetwork={!!network}
        loading={loading}
        hasAnalysis={!!analysis}
        canUseScenario={canUseScenario}
        onRun={() => void analyze()}
        onReset={reset}
      />

      {!network ? (
        <Panel>
          <PanelBody>
            <EmptyState
              icon={<BarChart3 className="size-4" />}
              title="Waiting for the network"
              description="Decision Analysis needs the network loaded first."
            />
          </PanelBody>
        </Panel>
      ) : error ? (
        <Panel>
          <PanelBody>
            <ErrorState message={error} onRetry={() => void analyze()} />
          </PanelBody>
        </Panel>
      ) : loading ? (
        <Panel>
          <PanelBody>
            <div className="flex flex-col items-center gap-3 p-14 text-center">
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
        </Panel>
      ) : !analysis ? (
        <Panel>
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
        </Panel>
      ) : (
        <>
          {analyzedScenario && normalAnalysis ? (
            <DecisionScenarioComparison
              normal={normalAnalysis}
              scenario={analysis}
            />
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Panel className="flex min-h-0 flex-col">
              <PanelHeader
                title="Pareto frontier"
                subtitle="Every point is a real allocation — hover for its numbers, click to select it"
                icon={<ScatterChart className="size-4" />}
              />
              <PanelBody className="min-h-0 flex-1">
                <ParetoChart
                  candidates={analysis.candidates}
                  frontierIds={frontierIds}
                  selectedId={selectedCandidateId}
                  compareId={compareCandidateId}
                  onSelect={selectCandidate}
                  onCompare={setCompareCandidate}
                  baseline={baselineObjectives}
                />
              </PanelBody>
            </Panel>

            <Panel className="flex min-h-0 flex-col xl:sticky xl:top-0">
              <PanelHeader
                title={comparing ? 'Comparing decisions' : 'Selected decision'}
                subtitle={
                  selected
                    ? undefined
                    : 'Click a point on the chart to inspect it'
                }
                icon={<Sparkles className="size-4" />}
                actions={
                  comparing ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCompareCandidate(null)}
                    >
                      End compare
                    </Button>
                  ) : undefined
                }
              />
              <PanelBody className="min-h-0 flex-1 overflow-y-auto">
                {comparing && selected ? (
                  <CandidateComparison a={selected} b={comparing} />
                ) : selected ? (
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
          </div>
        </>
      )}
    </div>
  )
}

function Toolbar({
  hasNetwork,
  loading,
  hasAnalysis,
  canUseScenario,
  onRun,
  onReset,
}: {
  hasNetwork: boolean
  loading: boolean
  hasAnalysis: boolean
  canUseScenario: boolean
  onRun: () => void
  onReset: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface px-5 py-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold text-ink">Decision Analysis</h1>
          {canUseScenario ? (
            <Badge tone="warn">Analyzing scenario</Badge>
          ) : (
            <Badge tone="ok">Analyzing normal network</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-subtle">
          Generate candidate allocations and explore their trade-offs — no
          candidate is ever marked "best".
        </p>
      </div>
      <div className="flex items-center gap-2">
        {hasAnalysis ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={onReset}
            icon={<RotateCcw className="size-3.5" />}
          >
            Reset
          </Button>
        ) : null}
        <Button
          variant="primary"
          size="sm"
          onClick={onRun}
          disabled={!hasNetwork || loading}
          icon={
            loading ? (
              <Spinner className="text-abyss" />
            ) : (
              <ScatterChart className="size-3.5" />
            )
          }
        >
          {loading ? 'Analyzing…' : hasAnalysis ? 'Re-run Analysis' : 'Run Analysis'}
        </Button>
      </div>
    </div>
  )
}

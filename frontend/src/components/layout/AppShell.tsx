import { Eye, X } from 'lucide-react'

import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { Badge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { ComparisonBar } from '@/components/workspace/ComparisonBar'
import { DecisionPanel } from '@/components/workspace/DecisionPanel'
import { MapWorkspace } from '@/components/workspace/MapWorkspace'
import { MetricsBar } from '@/components/workspace/MetricsBar'
import { ScenarioPanel } from '@/components/workspace/ScenarioPanel'
import { DecisionAnalysisView } from '@/components/decision/DecisionAnalysisView'
import { useAllocation } from '@/hooks/useAllocation'
import { useNetwork } from '@/hooks/useNetwork'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppStore } from '@/store/useAppStore'
import { useScenarioStore } from '@/store/useScenarioStore'

/**
 * The dashboard frame: fixed sidebar and header, a scrollable workspace that
 * splits into map plus a decision panel, and a metrics strip pinned below.
 *
 * The workspace stacks on narrow viewports; the side panel moves beneath the
 * map rather than collapsing away, since it carries the demand priorities
 * (or, in the Scenarios view, the scenario builder).
 *
 * The Scenarios nav view swaps the decision panel for the scenario builder
 * and, once a scenario has been applied, shows the map and metrics for the
 * scenario's network instead of the normal one — the normal allocation
 * underneath is untouched and the comparison strip holds both.
 *
 * The Decision Analysis nav view replaces the map/panel split entirely with
 * a full-width page (the Pareto chart is meant to be the strongest surface
 * in the app). "Inspect on Map" from there sets `inspectedAllocation` and
 * switches to Network, which shows that exact allocation on the map with a
 * visible "Inspecting: <candidate>" badge until cleared.
 */
export function AppShell() {
  const { network, error, loading, refresh } = useNetwork()
  const { allocation: normalAllocation } = useAllocation()
  const { status: realtimeStatus } = useRealtime()
  const view = useAppStore((state) => state.view)
  const setView = useAppStore((state) => state.setView)

  const inspectedAllocation = useAppStore((state) => state.inspectedAllocation)
  const inspectedCandidateId = useAppStore(
    (state) => state.inspectedCandidateId,
  )
  const clearInspectedAllocation = useAppStore(
    (state) => state.clearInspectedAllocation,
  )

  const scenarioMode = useScenarioStore((state) => state.mode)
  const scenarioNetwork = useScenarioStore((state) => state.network)
  const scenarioAllocation = useScenarioStore((state) => state.allocation)

  const inScenarioView = view === 'scenarios'
  const inDecisionView = view === 'decision'
  const showingScenario = inScenarioView && scenarioMode === 'scenario'
  const showingInspected = !inScenarioView && inspectedAllocation !== null

  const displayedNetwork = showingScenario ? scenarioNetwork ?? network : network
  const displayedAllocation = showingScenario
    ? scenarioAllocation ?? normalAllocation
    : showingInspected
      ? inspectedAllocation
      : normalAllocation

  if (inDecisionView) {
    return (
      <div className="flex h-screen overflow-hidden bg-abyss">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header
            connected={network !== null && error === null}
            loading={loading}
            onRefresh={() => void refresh()}
            realtimeStatus={realtimeStatus}
          />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3">
            <DecisionAnalysisView
              network={network}
              onInspectOnMap={() => setView('network')}
            />
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-abyss">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          connected={network !== null && error === null}
          loading={loading}
          onRefresh={() => void refresh()}
          realtimeStatus={realtimeStatus}
        />
        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          {showingInspected ? (
            <InspectedBanner
              candidateId={inspectedCandidateId}
              onClear={clearInspectedAllocation}
            />
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
            <div className="flex min-h-100 flex-1 flex-col xl:min-h-0">
              <MapWorkspace
                network={displayedNetwork}
                loading={loading}
                error={error}
                onRetry={() => void refresh()}
                allocation={displayedAllocation}
                showingScenario={showingScenario}
              />
            </div>
            {inScenarioView ? (
              <ScenarioPanel network={network} />
            ) : (
              <DecisionPanel network={network} />
            )}
          </div>
          {showingScenario ? (
            <ComparisonBar
              normal={normalAllocation}
              scenario={scenarioAllocation}
            />
          ) : null}
          <MetricsBar network={displayedNetwork} />
        </main>
      </div>
    </div>
  )
}

function InspectedBanner({
  candidateId,
  onClear,
}: {
  candidateId: string | null
  onClear: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-aqua-500/30 bg-aqua-500/10 px-3 py-2">
      <div className="flex items-center gap-2">
        <Eye className="size-3.5 text-aqua-300" aria-hidden="true" />
        <Badge tone="info">Inspecting</Badge>
        <span className="text-[11px] text-ink-muted">
          {candidateId
            ? candidateId.replace('candidate-', 'Decision Analysis option ')
            : 'a selected decision'}{' '}
          — not the live allocation
        </span>
      </div>
      <IconButton label="Stop inspecting" onClick={onClear} className="size-6">
        <X className="size-3.5" />
      </IconButton>
    </div>
  )
}

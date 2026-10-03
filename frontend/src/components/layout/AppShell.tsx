import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { ComparisonBar } from '@/components/workspace/ComparisonBar'
import { DecisionPanel } from '@/components/workspace/DecisionPanel'
import { MapWorkspace } from '@/components/workspace/MapWorkspace'
import { MetricsBar } from '@/components/workspace/MetricsBar'
import { ScenarioPanel } from '@/components/workspace/ScenarioPanel'
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
 */
export function AppShell() {
  const { network, error, loading, refresh } = useNetwork()
  const { allocation: normalAllocation } = useAllocation()
  const { status: realtimeStatus } = useRealtime()
  const view = useAppStore((state) => state.view)

  const scenarioMode = useScenarioStore((state) => state.mode)
  const scenarioNetwork = useScenarioStore((state) => state.network)
  const scenarioAllocation = useScenarioStore((state) => state.allocation)

  const inScenarioView = view === 'scenarios'
  const showingScenario = inScenarioView && scenarioMode === 'scenario'

  const displayedNetwork = showingScenario ? scenarioNetwork ?? network : network
  const displayedAllocation = showingScenario
    ? scenarioAllocation ?? normalAllocation
    : normalAllocation

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

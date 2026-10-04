import { clsx } from 'clsx'
import { Eye, PanelRightClose, PanelRightOpen, X } from 'lucide-react'

import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { DecisionPanel } from '@/components/workspace/DecisionPanel'
import { MapWorkspace } from '@/components/workspace/MapWorkspace'
import { MetricsBar } from '@/components/workspace/MetricsBar'
import { OverviewView } from '@/components/workspace/OverviewView'
import { ScenarioLabView } from '@/components/scenario/ScenarioLabView'
import { DecisionAnalysisView } from '@/components/decision/DecisionAnalysisView'
import { DemoMode } from '@/components/demo/DemoMode'
import { useAllocation } from '@/hooks/useAllocation'
import { useNetwork } from '@/hooks/useNetwork'
import { useRealtime } from '@/hooks/useRealtime'
import { useAppStore } from '@/store/useAppStore'

/**
 * The dashboard frame: fixed sidebar and header, a scrollable workspace that
 * splits into map plus a decision panel, and a metrics strip pinned below.
 *
 * The map is the primary workspace and always keeps its full box on Network/
 * Strategies: the controls panel (demand priorities / strategy) is an
 * absolutely-positioned overlay drawer on top of the map, never a flex
 * sibling, so opening it never shrinks or re-fits the network. It opens via
 * a small floating button and closes via its own button or a click on the
 * dimmed backdrop.
 *
 * The Scenarios nav view and the Decision Analysis nav view both replace the
 * map/panel split entirely with a full-width page — Scenario Lab makes
 * scenario exploration (choose → configure → impact → compare → Pareto) the
 * primary workspace rather than a small drawer, and Decision Analysis makes
 * the Pareto chart the strongest surface in the app. "Inspect on Map" from
 * there sets `inspectedAllocation` and switches to Network, which shows that
 * exact allocation on the map with a visible "Inspecting: <candidate>" badge
 * until cleared.
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

  const sidePanelCollapsed = useAppStore((state) => state.sidePanelCollapsed)
  const toggleSidePanel = useAppStore((state) => state.toggleSidePanel)

  const inOverviewView = view === 'overview'
  const inScenarioView = view === 'scenarios'
  const inDecisionView = view === 'decision'
  const showingInspected = !inScenarioView && inspectedAllocation !== null

  const displayedNetwork = network
  const displayedAllocation = showingInspected ? inspectedAllocation : normalAllocation

  if (inScenarioView) {
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
            <ScenarioLabView
              network={network}
              normalAllocation={normalAllocation}
              loading={loading}
              error={error}
              onRetry={() => void refresh()}
              onOpenDecisionAnalysis={() => setView('decision')}
            />
          </main>
        </div>
        <DemoMode network={network} />
      </div>
    )
  }

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
        <DemoMode network={network} />
      </div>
    )
  }

  if (inOverviewView) {
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
            <OverviewView
              network={network}
              loading={loading}
              error={error}
              onRetry={() => void refresh()}
            />
          </main>
        </div>
        <DemoMode network={network} />
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
          <div className="relative flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex min-h-100 flex-1 flex-col">
              <MapWorkspace
                network={displayedNetwork}
                loading={loading}
                error={error}
                onRetry={() => void refresh()}
                allocation={displayedAllocation}
              />
            </div>

            {/* The controls panel is an overlay, never a layout sibling —
                opening it must not shrink the map's own box (see CLAUDE.md,
                Network Map: controls overlay the map). */}
            {!sidePanelCollapsed ? (
              <button
                type="button"
                aria-label="Close controls panel"
                onClick={toggleSidePanel}
                className="absolute inset-0 z-10 bg-abyss/40 backdrop-blur-[1px]"
              />
            ) : null}

            <button
              type="button"
              onClick={toggleSidePanel}
              className={
                sidePanelCollapsed
                  ? 'absolute top-16 right-3 z-20 flex items-center gap-2 rounded-xl border border-hairline bg-depth/95 px-3 py-2 text-ink-muted shadow-lg backdrop-blur transition-colors hover:text-ink'
                  : 'hidden'
              }
              aria-label="Open controls panel"
            >
              <PanelRightOpen className="size-4" />
              <span className="text-xs font-medium">Controls</span>
            </button>

            <aside
              className={clsx(
                'absolute top-0 right-0 z-20 flex h-full w-full max-w-sm flex-col gap-2 p-3 transition-transform duration-200 ease-out',
                sidePanelCollapsed ? 'translate-x-full' : 'translate-x-0',
              )}
            >
              <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-2xl border border-hairline bg-depth/98 p-3 shadow-2xl backdrop-blur">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={toggleSidePanel}
                  icon={<PanelRightClose className="size-3.5" />}
                  className="self-end"
                >
                  Hide panel
                </Button>
                <DecisionPanel network={network} />
              </div>
            </aside>
          </div>
          <MetricsBar network={displayedNetwork} />
        </main>
      </div>
      <DemoMode network={network} />
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

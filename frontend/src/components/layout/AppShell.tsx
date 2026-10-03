import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { DecisionPanel } from '@/components/workspace/DecisionPanel'
import { MapWorkspace } from '@/components/workspace/MapWorkspace'
import { MetricsBar } from '@/components/workspace/MetricsBar'
import { useAllocation } from '@/hooks/useAllocation'
import { useNetwork } from '@/hooks/useNetwork'

/**
 * The dashboard frame: fixed sidebar and header, a scrollable workspace that
 * splits into map plus decision panel, and a metrics strip pinned below.
 *
 * The workspace stacks on narrow viewports; the decision panel moves beneath
 * the map rather than collapsing away, since it carries the demand priorities.
 */
export function AppShell() {
  const { network, error, loading, refresh } = useNetwork()
  const { allocation } = useAllocation()

  return (
    <div className="flex h-screen overflow-hidden bg-abyss">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          connected={network !== null && error === null}
          loading={loading}
          onRefresh={() => void refresh()}
        />
        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
          <div className="flex min-h-0 flex-1 flex-col gap-3 xl:flex-row">
            <div className="flex min-h-100 flex-1 flex-col xl:min-h-0">
              <MapWorkspace
                network={network}
                loading={loading}
                error={error}
                onRetry={() => void refresh()}
                allocation={allocation}
              />
            </div>
            <DecisionPanel network={network} />
          </div>
          <MetricsBar network={network} />
        </main>
      </div>
    </div>
  )
}

import { MapWorkspace } from '@/components/workspace/MapWorkspace'
import { MetricsBar } from '@/components/workspace/MetricsBar'
import { OverviewActions } from '@/components/workspace/OverviewActions'
import { AttentionStrip } from '@/components/workspace/AttentionStrip'
import { useAllocation } from '@/hooks/useAllocation'
import { useAppStore, type ViewId } from '@/store/useAppStore'
import type { NetworkState } from '@/types/network'

interface OverviewViewProps {
  network: NetworkState | null
  loading: boolean
  error: string | null
  onRetry: () => void
}

/**
 * The map is the hero: it gets first claim on the viewport as a true
 * `flex-1` region, with only a thin action bar above it. Secondary context
 * (what needs attention, headline metrics) sits below in a fixed-height
 * block that never competes with the map for space — on a short viewport it
 * scrolls, the map does not shrink to make room for it. The deeper per-point
 * list lives on Network for anyone who wants it; Overview exists to orient.
 */
export function OverviewView({
  network,
  loading,
  error,
  onRetry,
}: OverviewViewProps) {
  const setView = useAppStore((state) => state.setView)
  const selectNode = useAppStore((state) => state.selectNode)
  const setViewAndSelect = (view: ViewId, code?: string) => {
    if (code) selectNode(code)
    setView(view)
  }
  const { allocation } = useAllocation()

  return (
    <div className="flex min-h-full flex-1 flex-col gap-3">
      <OverviewActions onNavigate={(view) => setViewAndSelect(view)} />

      <div className="flex h-[min(78vh,900px)] shrink-0 flex-col">
        <MapWorkspace
          network={network}
          loading={loading}
          error={error}
          onRetry={onRetry}
          allocation={allocation}
        />
      </div>

      <AttentionStrip
        network={network}
        allocation={allocation}
        onSelect={(code) => setViewAndSelect('network', code)}
      />

      <MetricsBar network={network} />
    </div>
  )
}

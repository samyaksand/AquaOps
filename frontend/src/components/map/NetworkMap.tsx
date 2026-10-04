import { useMemo, useState } from 'react'

import { ErrorState, LoadingState } from '@/components/ui/States'
import { useGeography } from '@/hooks/useGeography'
import type { Point } from '@/lib/projection'
import { useAppStore } from '@/store/useAppStore'
import type { AllocationResult, NetworkState } from '@/types/network'

import { MapCanvas } from './MapCanvas'
import { MapControls, MapHint } from './MapControls'
import { MapTooltip } from './MapTooltip'
import { NodeDetails } from './NodeDetails'
import { buildMapModel, type MapEntity } from './model'

interface NetworkMapProps {
  network: NetworkState | null
  loading: boolean
  error: string | null
  onRetry: () => void
  allocation?: AllocationResult | null
}

export function NetworkMap({
  network,
  loading,
  error,
  onRetry,
  allocation = null,
}: NetworkMapProps) {
  const { geography, error: geographyError } = useGeography()
  const [hover, setHover] = useState<{
    entity: MapEntity
    screen: Point
  } | null>(null)
  const selectedNodeCode = useAppStore((state) => state.selectedNodeCode)

  const model = useMemo(
    () =>
      network && geography ? buildMapModel(network, geography, allocation) : null,
    [network, geography, allocation],
  )

  if (error && !network) {
    return <ErrorState message={error} onRetry={onRetry} />
  }
  if (geographyError && !geography) {
    return <ErrorState message={geographyError} onRetry={onRetry} />
  }
  if (!model) {
    return <LoadingState label={loading ? 'Loading network' : 'Preparing map'} />
  }

  return (
    <div className="absolute inset-0">
      <MapCanvas
        model={model}
        onHoverChange={(entity, screen) =>
          setHover(entity && screen ? { entity, screen } : null)
        }
      />
      <NodeDetails model={model} />
      <MapControls />
      <MapHint />
      {hover && hover.entity.code !== selectedNodeCode ? (
        <MapTooltip entity={hover.entity} screen={hover.screen} />
      ) : null}
    </div>
  )
}

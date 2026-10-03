import { clsx } from 'clsx'
import { Layers, Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { IconButton } from '@/components/ui/Button'
import {
  LAYER_LABELS,
  LAYER_ORDER,
  useMapStore,
  type LayerId,
} from '@/store/useMapStore'

export function MapControls() {
  const zoom = useMapStore((state) => state.zoom)
  const zoomBy = useMapStore((state) => state.zoomBy)
  const resetLayout = useMapStore((state) => state.resetLayout)
  const moved = useMapStore((state) => state.hasMoved())

  return (
    <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
      <div className="flex items-center gap-1 rounded-lg border border-hairline bg-depth/90 p-1 backdrop-blur">
        <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
          <Minus className="size-4" />
        </IconButton>
        <span className="tabular w-10 text-center text-[11px] text-ink-muted">
          {Math.round(zoom * 100)}%
        </span>
        <IconButton label="Zoom in" onClick={() => zoomBy(1.25)}>
          <Plus className="size-4" />
        </IconButton>
        <span className="mx-0.5 h-5 w-px bg-divider" aria-hidden="true" />
        <IconButton
          label="Reset layout"
          onClick={resetLayout}
          disabled={!moved}
          className={clsx(moved && 'text-aqua-400')}
        >
          <RotateCcw className="size-4" />
        </IconButton>
      </div>
      <LayerMenu />
    </div>
  )
}

function LayerMenu() {
  const [open, setOpen] = useState(false)
  const layers = useMapStore((state) => state.layers)
  const toggleLayer = useMapStore((state) => state.toggleLayer)
  const hiddenCount = LAYER_ORDER.filter((id) => !layers[id]).length

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={clsx(
          'flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5',
          'bg-depth/90 text-xs text-ink-muted backdrop-blur transition-colors',
          'hover:text-ink',
          open && 'text-ink',
        )}
      >
        <Layers className="size-3.5" aria-hidden="true" />
        Layers
        {hiddenCount > 0 ? (
          <span className="tabular rounded bg-aqua-500/15 px-1 text-[10px] text-aqua-300">
            {LAYER_ORDER.length - hiddenCount}/{LAYER_ORDER.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute top-full right-0 mt-1.5 w-48 rounded-lg border border-hairline bg-depth/95 p-1 shadow-xl backdrop-blur">
          {LAYER_ORDER.map((id: LayerId) => (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            >
              <input
                type="checkbox"
                checked={layers[id]}
                onChange={() => toggleLayer(id)}
                className="size-3.5 accent-aqua-500"
              />
              {LAYER_LABELS[id]}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function MapHint() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-1.5 rounded-md border border-hairline bg-depth/80 px-2 py-1 backdrop-blur">
      <Maximize2 className="size-3 text-ink-subtle" aria-hidden="true" />
      <span className="text-[10px] text-ink-subtle">
        Drag nodes to rearrange · scroll to zoom · view only
      </span>
    </div>
  )
}

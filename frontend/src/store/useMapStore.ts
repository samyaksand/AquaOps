import { create } from 'zustand'

import type { Point } from '@/lib/projection'

export type LayerId =
  | 'reservoirs'
  | 'plants'
  | 'zones'
  | 'facilities'
  | 'pipelines'
  | 'tankers'
  | 'labels'

export const LAYER_ORDER: LayerId[] = [
  'reservoirs',
  'plants',
  'zones',
  'facilities',
  'pipelines',
  'tankers',
  'labels',
]

export const LAYER_LABELS: Record<LayerId, string> = {
  reservoirs: 'Reservoirs',
  plants: 'Treatment plants',
  zones: 'Demand zones',
  facilities: 'Critical facilities',
  pipelines: 'Pipelines',
  tankers: 'Tankers',
  labels: 'Labels',
}

export const MIN_ZOOM = 0.45
export const MAX_ZOOM = 4

interface MapState {
  /**
   * Per-entity drag offsets in world units. These are view state only and are
   * never sent to the backend — the stored PostGIS coordinates stay canonical.
   */
  offsets: Record<string, Point>
  zoom: number
  pan: Point
  layers: Record<LayerId, boolean>
  hoveredCode: string | null

  dragBy: (code: string, dx: number, dy: number) => void
  setZoom: (zoom: number, pan?: Point) => void
  zoomBy: (factor: number) => void
  setPan: (pan: Point) => void
  panBy: (dx: number, dy: number) => void
  toggleLayer: (layer: LayerId) => void
  setHovered: (code: string | null) => void
  resetLayout: () => void
  hasMoved: () => boolean
}

const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  reservoirs: true,
  plants: true,
  zones: true,
  facilities: true,
  pipelines: true,
  tankers: true,
  labels: true,
}

const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export const useMapStore = create<MapState>((set, get) => ({
  offsets: {},
  zoom: 1,
  pan: { x: 0, y: 0 },
  layers: { ...DEFAULT_LAYERS },
  hoveredCode: null,

  dragBy: (code, dx, dy) =>
    set((state) => {
      const current = state.offsets[code] ?? { x: 0, y: 0 }
      return {
        offsets: {
          ...state.offsets,
          [code]: { x: current.x + dx, y: current.y + dy },
        },
      }
    }),

  setZoom: (zoom, pan) =>
    set((state) => ({ zoom: clampZoom(zoom), pan: pan ?? state.pan })),

  zoomBy: (factor) => set((state) => ({ zoom: clampZoom(state.zoom * factor) })),

  setPan: (pan) => set({ pan }),

  panBy: (dx, dy) =>
    set((state) => ({ pan: { x: state.pan.x + dx, y: state.pan.y + dy } })),

  toggleLayer: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer]: !state.layers[layer] },
    })),

  setHovered: (hoveredCode) => set({ hoveredCode }),

  resetLayout: () =>
    set({ offsets: {}, zoom: 1, pan: { x: 0, y: 0 } }),

  hasMoved: () => {
    const state = get()
    return (
      Object.keys(state.offsets).length > 0 ||
      state.zoom !== 1 ||
      state.pan.x !== 0 ||
      state.pan.y !== 0
    )
  },
}))

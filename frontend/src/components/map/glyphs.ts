/** Visual vocabulary for the map: shape conveys type, colour conveys state. */

import type { OperationalState } from '@/types/network'

import type { EntityKind } from './model'

export const KIND_COLORS: Record<EntityKind, string> = {
  reservoir: 'var(--color-aqua-400)',
  plant: 'var(--color-status-info)',
  zone: 'var(--color-ink-muted)',
  facility: 'var(--color-status-critical)',
  tanker: 'var(--color-status-warn)',
}

export const STATE_RING: Record<OperationalState, string> = {
  online: 'var(--color-status-ok)',
  derated: 'var(--color-status-warn)',
  unavailable: 'var(--color-status-critical)',
}

export const KIND_RADIUS: Record<EntityKind, number> = {
  reservoir: 17,
  plant: 15,
  zone: 16,
  facility: 14,
  tanker: 10,
}

/**
 * Shape path for a node, centred on the origin. Distinct silhouettes let an
 * operator identify entity types without reading the legend.
 */
export function glyphPath(kind: EntityKind, r: number): string {
  switch (kind) {
    case 'reservoir':
      // Circle, drawn as two arcs.
      return `M ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 Z`
    case 'plant': {
      // Square with clipped corners, suggesting a facility footprint.
      const c = r * 0.38
      return [
        `M ${-r + c} ${-r}`,
        `L ${r - c} ${-r}`,
        `L ${r} ${-r + c}`,
        `L ${r} ${r - c}`,
        `L ${r - c} ${r}`,
        `L ${-r + c} ${r}`,
        `L ${-r} ${r - c}`,
        `L ${-r} ${-r + c}`,
        'Z',
      ].join(' ')
    }
    case 'zone': {
      // Hexagon: a settled area.
      const pts: string[] = []
      for (let i = 0; i < 6; i += 1) {
        const a = (Math.PI / 3) * i - Math.PI / 2
        pts.push(`${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`)
      }
      return `M ${pts.join(' L ')} Z`
    }
    case 'facility':
      // Diamond: elevated consequence.
      return `M 0 ${-r} L ${r} 0 L 0 ${r} L ${-r} 0 Z`
    case 'tanker': {
      // Rounded pill, wider than tall: a vehicle.
      const w = r * 1.5
      const h = r * 0.85
      return [
        `M ${-w + h} ${-h}`,
        `L ${w - h} ${-h}`,
        `A ${h} ${h} 0 0 1 ${w - h} ${h}`,
        `L ${-w + h} ${h}`,
        `A ${h} ${h} 0 0 1 ${-w + h} ${-h}`,
        'Z',
      ].join(' ')
    }
  }
}

/** Pipeline stroke width scaled by capacity, clamped to stay legible. */
export function edgeWidth(capacity: number, maxCapacity: number): number {
  if (maxCapacity <= 0) return 2
  const normalized = Math.sqrt(capacity / maxCapacity)
  return 1.6 + normalized * 4.4
}

/** Allocation flow overlay width, scaled by delivered volume on the link. */
export function flowWidth(flow: number, maxFlow: number): number {
  if (maxFlow <= 0 || flow <= 0) return 0
  const normalized = Math.sqrt(flow / maxFlow)
  return 1.2 + normalized * 3.6
}

export const EDGE_COLORS: Record<OperationalState, string> = {
  online: 'var(--color-aqua-600)',
  derated: 'var(--color-status-warn)',
  unavailable: 'var(--color-status-critical)',
}

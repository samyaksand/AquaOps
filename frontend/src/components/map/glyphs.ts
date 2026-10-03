/** Visual vocabulary for the map.
 *
 * Icon is the primary identifier (see icons.tsx); colour is reserved for
 * operational state so it carries one meaning, not two. A node's ring/fill
 * is a neutral ink tone when online, and only shifts to a status hue when
 * something is actually wrong (derated/unavailable) or under an active
 * allocation (unmet demand) — colour you see should always mean "look here".
 */

import type { OperationalState } from '@/types/network'

import type { EntityKind } from './model'

export const STATE_RING: Record<OperationalState, string> = {
  online: 'var(--color-status-ok)',
  derated: 'var(--color-status-warn)',
  unavailable: 'var(--color-status-critical)',
}

export const KIND_RADIUS: Record<EntityKind, number> = {
  reservoir: 22,
  plant: 20,
  zone: 20,
  facility: 19,
  tanker: 14,
}

/** Icon size as a fraction of the node radius, tuned per Lucide's own padding. */
export const ICON_SCALE = 1.05

/** Pipeline stroke width scaled by capacity, clamped to stay legible. */
export function edgeWidth(capacity: number, maxCapacity: number): number {
  if (maxCapacity <= 0) return 2
  const normalized = Math.sqrt(capacity / maxCapacity)
  return 1.8 + normalized * 4.2
}

/** Allocation flow overlay width, scaled by delivered volume on the link. */
export function flowWidth(flow: number, maxFlow: number): number {
  if (maxFlow <= 0 || flow <= 0) return 0
  const normalized = Math.sqrt(flow / maxFlow)
  return 1.4 + normalized * 3.6
}

export const EDGE_COLORS: Record<OperationalState, string> = {
  online: 'var(--color-ink-subtle)',
  derated: 'var(--color-status-warn)',
  unavailable: 'var(--color-status-critical)',
}

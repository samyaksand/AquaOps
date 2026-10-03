/** Entity → Lucide icon mapping. Icon is the primary identifier on the map;
 * colour is reserved for operational state. Lucide's React components
 * render a real <svg>, which nests validly inside the map's own <svg> — no
 * rasterization or foreignObject needed. */

import {
  Building2,
  Factory,
  Hospital,
  type LucideIcon,
  School,
  Truck,
  Warehouse,
  Waves,
} from 'lucide-react'

import type { EntityKind } from './model'

/** Demand-point category strings as returned by the API's `category` field
 * (backend `ZoneType`/`FacilityType` enum values). Anything unrecognized
 * falls back to the kind-level default below. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  hospital: Hospital,
  school: School,
  industrial: Warehouse,
  residential: Building2,
  commercial: Building2,
  mixed: Building2,
  agricultural: Building2,
}

const KIND_DEFAULT_ICONS: Record<EntityKind, LucideIcon> = {
  reservoir: Waves,
  plant: Factory,
  zone: Building2,
  facility: Hospital,
  tanker: Truck,
}

export function iconFor(kind: EntityKind, category: string | null): LucideIcon {
  if (category) {
    const byCategory = CATEGORY_ICONS[category]
    if (byCategory) return byCategory
  }
  return KIND_DEFAULT_ICONS[kind]
}

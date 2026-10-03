/** Normalises network state + geography into one drawable model. */

import { projectAll, type Point } from '@/lib/projection'
import type { LayerId } from '@/store/useMapStore'
import type {
  Geography,
  NetworkState,
  OperationalState,
} from '@/types/network'

export type EntityKind = 'reservoir' | 'plant' | 'zone' | 'facility' | 'tanker'

export const KIND_LABELS: Record<EntityKind, string> = {
  reservoir: 'Reservoir',
  plant: 'Treatment plant',
  zone: 'Demand zone',
  facility: 'Critical facility',
  tanker: 'Tanker',
}

const KIND_LAYER: Record<EntityKind, LayerId> = {
  reservoir: 'reservoirs',
  plant: 'plants',
  zone: 'zones',
  facility: 'facilities',
  tanker: 'tankers',
}

export interface DetailRow {
  label: string
  value: string
}

export interface MapEntity {
  code: string
  name: string
  kind: EntityKind
  layer: LayerId
  state: OperationalState
  base: Point
  /** Headline figure shown on hover. */
  headline: string
  /** Full breakdown shown on click. */
  details: DetailRow[]
  /** Priority rank for demand points, else null. */
  priorityRank: number | null
}

export interface MapEdge {
  code: string
  sourceCode: string
  targetCode: string
  state: OperationalState
  capacity: number
  lossRatio: number
}

export interface MapModel {
  entities: MapEntity[]
  byCode: Record<string, MapEntity>
  edges: MapEdge[]
}

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ratio = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function buildMapModel(
  network: NetworkState,
  geography: Geography,
): MapModel {
  // One projection over every drawable coordinate. Projecting nodes and
  // tankers separately would fit them to different bounds, so a tanker
  // outside the node envelope would land in the wrong place.
  const points = projectAll({ ...geography.nodes, ...geography.tankers })

  const entities: MapEntity[] = []

  for (const source of network.sources) {
    const base = points[source.code]
    if (!base) continue
    entities.push({
      code: source.code,
      name: source.name,
      kind: 'reservoir',
      layer: KIND_LAYER.reservoir,
      state: source.state,
      base,
      headline: `${num.format(source.available_m3_per_day)} m³/day available`,
      priorityRank: null,
      details: [
        { label: 'Releasable supply', value: `${num.format(source.available_m3_per_day)} m³/day` },
      ],
    })
  }

  for (const plant of network.transits) {
    const base = points[plant.code]
    if (!base) continue
    entities.push({
      code: plant.code,
      name: plant.name,
      kind: 'plant',
      layer: KIND_LAYER.plant,
      state: plant.state,
      base,
      headline: `${num.format(plant.capacity_m3_per_day)} m³/day capacity`,
      priorityRank: null,
      details: [
        { label: 'Throughput capacity', value: `${num.format(plant.capacity_m3_per_day)} m³/day` },
        { label: 'Recovery ratio', value: ratio.format(plant.recovery_ratio) },
      ],
    })
  }

  for (const demand of network.demands) {
    const base = points[demand.code]
    if (!base) continue
    const kind: EntityKind = demand.kind === 'facility' ? 'facility' : 'zone'
    entities.push({
      code: demand.code,
      name: demand.name,
      kind,
      layer: KIND_LAYER[kind],
      state: 'online',
      base,
      headline: `${num.format(demand.demand_m3_per_day)} m³/day demand`,
      priorityRank: demand.priority_rank,
      details: [
        { label: 'Demand', value: `${num.format(demand.demand_m3_per_day)} m³/day` },
        { label: 'Lifeline minimum', value: `${num.format(demand.minimum_demand_m3_per_day)} m³/day` },
        { label: 'Population', value: num.format(demand.population) },
        { label: 'Local reserve', value: `${num.format(demand.reserve_m3)} m³` },
      ],
    })
  }

  for (const tanker of network.tankers) {
    const base = points[tanker.code]
    if (!base) continue
    entities.push({
      code: tanker.code,
      name: tanker.name,
      kind: 'tanker',
      layer: KIND_LAYER.tanker,
      state: tanker.state,
      base,
      headline: `${num.format(tanker.capacity_m3 * tanker.trips_per_day)} m³/day haulage`,
      priorityRank: null,
      details: [
        { label: 'Capacity', value: `${num.format(tanker.capacity_m3)} m³` },
        { label: 'Trips per day', value: String(tanker.trips_per_day) },
        { label: 'Daily haulage', value: `${num.format(tanker.capacity_m3 * tanker.trips_per_day)} m³` },
      ],
    })
  }

  const byCode: Record<string, MapEntity> = {}
  for (const entity of entities) byCode[entity.code] = entity

  const edges: MapEdge[] = network.links
    .filter(
      (link) => byCode[link.source_code] && byCode[link.target_code],
    )
    .map((link) => ({
      code: link.code,
      sourceCode: link.source_code,
      targetCode: link.target_code,
      state: link.state,
      capacity: link.capacity_m3_per_day,
      lossRatio: link.loss_ratio,
    }))

  return { entities, byCode, edges }
}

export function describeEdge(edge: MapEdge): DetailRow[] {
  return [
    { label: 'Capacity', value: `${num.format(edge.capacity)} m³/day` },
    { label: 'Transit loss', value: ratio.format(edge.lossRatio) },
  ]
}

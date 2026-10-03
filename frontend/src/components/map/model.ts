/** Normalises network state + geography into one drawable model. */

import { projectAll, type Point } from '@/lib/projection'
import type { LayerId } from '@/store/useMapStore'
import type {
  AllocationResult,
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
  /** Set only for demand points once an allocation result is loaded. */
  allocation: EntityAllocation | null
}

export interface EntityAllocation {
  suppliedM3PerDay: number
  unmetM3PerDay: number
  satisfactionRatio: number
  meetsMinimum: boolean
  fullySupplied: boolean
}

export interface MapEdge {
  code: string
  sourceCode: string
  targetCode: string
  state: OperationalState
  capacity: number
  lossRatio: number
  /** Volume flowing along this pipeline under the current allocation, if any. */
  flowM3PerDay: number
}

export interface TankerTether {
  tankerCode: string
  /** Nearest non-tanker node, used only to anchor the tanker visually. */
  hubCode: string
}

export interface MapModel {
  entities: MapEntity[]
  byCode: Record<string, MapEntity>
  edges: MapEdge[]
  /** True once an allocation result has been folded into this model. */
  hasAllocation: boolean
  /**
   * Tankers are mobile and carry no pipeline connection. A tether just
   * anchors each one to its nearest node so it doesn't read as orphaned —
   * it is not a real pipeline and never implies a routed allocation.
   */
  tankerTethers: TankerTether[]
}

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const ratio = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
})

export function buildMapModel(
  network: NetworkState,
  geography: Geography,
  allocation: AllocationResult | null = null,
): MapModel {
  // One projection over every drawable coordinate. Projecting nodes and
  // tankers separately would fit them to different bounds, so a tanker
  // outside the node envelope would land in the wrong place.
  const points = projectAll({ ...geography.nodes, ...geography.tankers })

  const allocationByCode: Record<string, EntityAllocation> = {}
  if (allocation) {
    for (const item of allocation.allocations) {
      allocationByCode[item.code] = {
        suppliedM3PerDay: item.supplied_m3_per_day,
        unmetM3PerDay: item.unmet_m3_per_day,
        satisfactionRatio: item.satisfaction_ratio,
        meetsMinimum: item.meets_minimum,
        fullySupplied: item.fully_supplied,
      }
    }
  }

  const withdrawnByCode: Record<string, number> = {}
  if (allocation) {
    for (const item of allocation.source_withdrawals) {
      withdrawnByCode[item.source_code] = item.withdrawn_m3_per_day
    }
  }

  const entities: MapEntity[] = []

  for (const source of network.sources) {
    const base = points[source.code]
    if (!base) continue
    const withdrawn = withdrawnByCode[source.code]
    entities.push({
      code: source.code,
      name: source.name,
      kind: 'reservoir',
      layer: KIND_LAYER.reservoir,
      state: source.state,
      base,
      headline:
        withdrawn !== undefined
          ? `${num.format(withdrawn)} m³/day withdrawn`
          : `${num.format(source.available_m3_per_day)} m³/day available`,
      priorityRank: null,
      allocation: null,
      details: [
        { label: 'Releasable supply', value: `${num.format(source.available_m3_per_day)} m³/day` },
        ...(withdrawn !== undefined
          ? [{ label: 'Withdrawn (allocated)', value: `${num.format(withdrawn)} m³/day` }]
          : []),
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
      allocation: null,
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
    const demandAllocation = allocationByCode[demand.code] ?? null
    entities.push({
      code: demand.code,
      name: demand.name,
      kind,
      layer: KIND_LAYER[kind],
      state: 'online',
      base,
      headline: demandAllocation
        ? `${num.format(demandAllocation.suppliedM3PerDay)} of ${num.format(demand.demand_m3_per_day)} m³/day supplied`
        : `${num.format(demand.demand_m3_per_day)} m³/day demand`,
      priorityRank: demand.priority_rank,
      allocation: demandAllocation,
      details: [
        { label: 'Demand', value: `${num.format(demand.demand_m3_per_day)} m³/day` },
        { label: 'Lifeline minimum', value: `${num.format(demand.minimum_demand_m3_per_day)} m³/day` },
        ...(demandAllocation
          ? [
              { label: 'Supplied', value: `${num.format(demandAllocation.suppliedM3PerDay)} m³/day` },
              { label: 'Unmet', value: `${num.format(demandAllocation.unmetM3PerDay)} m³/day` },
              { label: 'Satisfaction', value: ratio.format(demandAllocation.satisfactionRatio) },
            ]
          : []),
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
      headline:
        tanker.state === 'unavailable'
          ? 'Out of service'
          : `Standby · ${num.format(tanker.capacity_m3 * tanker.trips_per_day)} m³/day haulage`,
      priorityRank: null,
      allocation: null,
      details: [
        {
          label: 'Status',
          value: tanker.state === 'unavailable' ? 'Out of service' : 'Standby',
        },
        { label: 'Capacity', value: `${num.format(tanker.capacity_m3)} m³` },
        { label: 'Trips per day', value: String(tanker.trips_per_day) },
        { label: 'Daily haulage', value: `${num.format(tanker.capacity_m3 * tanker.trips_per_day)} m³` },
      ],
    })
  }

  const byCode: Record<string, MapEntity> = {}
  for (const entity of entities) byCode[entity.code] = entity

  // Map each directed node pair to the pipeline connecting them, so a
  // route's node sequence can be resolved back to link codes.
  const linkByPair = new Map<string, string>()
  for (const link of network.links) {
    linkByPair.set(`${link.source_code}>${link.target_code}`, link.code)
    linkByPair.set(`${link.target_code}>${link.source_code}`, link.code)
  }

  const flowByLinkCode: Record<string, number> = {}
  if (allocation) {
    for (const item of allocation.allocations) {
      for (const route of item.routes) {
        // A route's path is [source, ...intermediate transit nodes, demand].
        const path = [route.source_code, ...route.node_codes]
        for (let i = 0; i < path.length - 1; i += 1) {
          const linkCode = linkByPair.get(`${path[i]}>${path[i + 1]}`)
          if (!linkCode) continue
          flowByLinkCode[linkCode] =
            (flowByLinkCode[linkCode] ?? 0) + route.delivered_m3_per_day
        }
      }
    }
  }

  // Tankers are mobile and never appear as pipeline endpoints, so each one
  // is tethered to whichever node sits physically closest to it. This is a
  // presentation anchor only — it is not a routed allocation path.
  const nonTankerEntities = entities.filter((entity) => entity.kind !== 'tanker')
  const tankerTethers: TankerTether[] = []
  for (const tanker of network.tankers) {
    const base = points[tanker.code]
    if (!base) continue
    let nearest: MapEntity | null = null
    let nearestDistance = Infinity
    for (const candidate of nonTankerEntities) {
      const distance = Math.hypot(
        candidate.base.x - base.x,
        candidate.base.y - base.y,
      )
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearest = candidate
      }
    }
    if (nearest) {
      tankerTethers.push({ tankerCode: tanker.code, hubCode: nearest.code })
    }
  }

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
      flowM3PerDay: flowByLinkCode[link.code] ?? 0,
    }))

  return {
    entities,
    byCode,
    edges,
    hasAllocation: allocation !== null,
    tankerTethers,
  }
}

export function describeEdge(edge: MapEdge): DetailRow[] {
  return [
    { label: 'Capacity', value: `${num.format(edge.capacity)} m³/day` },
    { label: 'Transit loss', value: ratio.format(edge.lossRatio) },
    ...(edge.flowM3PerDay > 0
      ? [{ label: 'Allocated flow', value: `${num.format(edge.flowM3PerDay)} m³/day` }]
      : []),
  ]
}

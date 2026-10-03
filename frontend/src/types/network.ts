/** Mirrors the backend `NetworkStateOut` schema at GET /api/v1/network. */

export type OperationalState = 'online' | 'derated' | 'unavailable'

export type DemandKind = 'zone' | 'facility'

export interface SupplySource {
  code: string
  name: string
  available_m3_per_day: number
  state: OperationalState
}

export interface TransitNode {
  code: string
  name: string
  capacity_m3_per_day: number
  recovery_ratio: number
  state: OperationalState
}

export interface DemandPoint {
  code: string
  name: string
  kind: DemandKind
  demand_m3_per_day: number
  minimum_demand_m3_per_day: number
  priority_rank: number
  population: number
  reserve_m3: number
}

export interface NetworkLink {
  code: string
  source_code: string
  target_code: string
  capacity_m3_per_day: number
  loss_ratio: number
  state: OperationalState
}

export interface Tanker {
  code: string
  name: string
  capacity_m3: number
  trips_per_day: number
  state: OperationalState
}

export interface NetworkState {
  sources: SupplySource[]
  transits: TransitNode[]
  demands: DemandPoint[]
  links: NetworkLink[]
  tankers: Tanker[]
}

/** Mirrors `GeographyOut` at GET /api/v1/network/geography. */
export interface Position {
  longitude: number
  latitude: number
}

export interface Geography {
  nodes: Record<string, Position>
  tankers: Record<string, Position>
}

export const STRATEGIES = [
  'population_first',
  'critical_infrastructure_first',
  'efficiency_first',
  'balanced',
] as const

export type StrategyName = (typeof STRATEGIES)[number]

export const STRATEGY_LABELS: Record<StrategyName, string> = {
  population_first: 'Population First',
  critical_infrastructure_first: 'Critical Infrastructure First',
  efficiency_first: 'Efficiency First',
  balanced: 'Balanced',
}

/** Priority ranks come from the backend as 0 (most critical) to 3. */
export const PRIORITY_LABELS: Record<number, string> = {
  0: 'Critical',
  1: 'High',
  2: 'Medium',
  3: 'Low',
}

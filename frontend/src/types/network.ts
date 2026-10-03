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
  /** Presentation only (e.g. "hospital", "residential"); drives map icons. */
  category: string | null
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

/** Mirrors `AllocationResultOut` at POST /api/v1/allocate. */
export interface RouteFlow {
  source_code: string
  node_codes: string[]
  delivered_m3_per_day: number
  withdrawn_m3_per_day: number
  efficiency: number
}

export interface DemandAllocation {
  code: string
  name: string
  kind: DemandKind
  priority_rank: number
  population: number
  demand_m3_per_day: number
  minimum_demand_m3_per_day: number
  supplied_m3_per_day: number
  unmet_m3_per_day: number
  withdrawn_m3_per_day: number
  transit_loss_m3_per_day: number
  satisfaction_ratio: number
  meets_minimum: boolean
  fully_supplied: boolean
  routes: RouteFlow[]
}

export interface SourceWithdrawal {
  source_code: string
  withdrawn_m3_per_day: number
}

export interface AllocationMetrics {
  total_demand_m3_per_day: number
  total_supplied_m3_per_day: number
  total_unmet_m3_per_day: number
  total_withdrawn_m3_per_day: number
  total_transit_loss_m3_per_day: number
  total_supply_available_m3_per_day: number
  demand_coverage_ratio: number
  total_population: number
  population_served: number
  population_fully_served: number
  population_weighted_satisfaction: number
  critical_facility_coverage: number
  critical_facility_full_coverage: number
  delivery_efficiency: number
  supply_utilization: number
  minimum_demand_shortfalls: string[]
}

export interface AllocationResult {
  strategy: string
  metrics: AllocationMetrics
  allocations: DemandAllocation[]
  source_withdrawals: SourceWithdrawal[]
}

/** Mirrors the backend's `ScenarioChangeIn` discriminated union. */
export type ScenarioChangeType =
  | 'reduce_reservoir_supply'
  | 'reduce_treatment_capacity'
  | 'reduce_pipeline_capacity'
  | 'set_pipeline_unavailable'
  | 'change_zone_demand'
  | 'change_facility_demand'
  | 'set_tanker_unavailable'

export interface ReduceReservoirSupplyIn {
  type: 'reduce_reservoir_supply'
  target_code: string
  fraction: number
}

export interface ReduceTreatmentCapacityIn {
  type: 'reduce_treatment_capacity'
  target_code: string
  fraction: number
}

export interface ReducePipelineCapacityIn {
  type: 'reduce_pipeline_capacity'
  target_code: string
  fraction: number
}

export interface SetPipelineUnavailableIn {
  type: 'set_pipeline_unavailable'
  target_code: string
}

export interface ChangeZoneDemandIn {
  type: 'change_zone_demand'
  target_code: string
  factor: number
}

export interface ChangeFacilityDemandIn {
  type: 'change_facility_demand'
  target_code: string
  factor: number
}

export interface SetTankerUnavailableIn {
  type: 'set_tanker_unavailable'
  target_code: string
}

export type ScenarioChangeIn =
  | ReduceReservoirSupplyIn
  | ReduceTreatmentCapacityIn
  | ReducePipelineCapacityIn
  | SetPipelineUnavailableIn
  | ChangeZoneDemandIn
  | ChangeFacilityDemandIn
  | SetTankerUnavailableIn

export const SCENARIO_CHANGE_LABELS: Record<ScenarioChangeType, string> = {
  reduce_reservoir_supply: 'Reduce reservoir supply',
  reduce_treatment_capacity: 'Reduce treatment capacity',
  reduce_pipeline_capacity: 'Reduce pipeline capacity',
  set_pipeline_unavailable: 'Take pipeline offline',
  change_zone_demand: 'Change zone demand',
  change_facility_demand: 'Change facility demand',
  set_tanker_unavailable: 'Take tanker out of service',
}

/** Which entity collection a scenario change type targets. */
export const SCENARIO_CHANGE_TARGET_KIND: Record<
  ScenarioChangeType,
  'source' | 'transit' | 'link' | 'zone' | 'facility' | 'tanker'
> = {
  reduce_reservoir_supply: 'source',
  reduce_treatment_capacity: 'transit',
  reduce_pipeline_capacity: 'link',
  set_pipeline_unavailable: 'link',
  change_zone_demand: 'zone',
  change_facility_demand: 'facility',
  set_tanker_unavailable: 'tanker',
}

export interface ScenarioIn {
  name: string
  description?: string
  changes: ScenarioChangeIn[]
}

/** Mirrors `ScenarioSummaryOut`: an echo of the applied scenario. */
export interface ScenarioSummary {
  name: string
  description: string
  changes: string[]
}

/** Mirrors `ScenarioAllocationOut` at POST /api/v1/scenarios/allocate. */
export interface ScenarioAllocationResult {
  scenario: ScenarioSummary
  network: NetworkState
  allocation: AllocationResult
}

/**
 * Mirrors `ObjectiveScoresOut`. All five objectives are normalized to
 * [0, 1] with a consistent direction — higher is always better, including
 * `unmet_demand_score` (already inverted: 1 = nothing unmet).
 */
export interface ObjectiveScores {
  critical_coverage: number
  population_served: number
  unmet_demand_score: number
  logistics_efficiency: number
  equity: number
}

export const OBJECTIVE_LABELS: Record<keyof ObjectiveScores, string> = {
  critical_coverage: 'Critical coverage',
  population_served: 'Population served',
  unmet_demand_score: 'Demand met',
  logistics_efficiency: 'Logistics efficiency',
  equity: 'Equity',
}

export const OBJECTIVE_KEYS = Object.keys(
  OBJECTIVE_LABELS,
) as (keyof ObjectiveScores)[]

/** Mirrors `CandidateOut`: one generated allocation plus its scores. */
export interface Candidate {
  candidate_id: string
  criticality_weight: number
  population_weight: number
  efficiency_weight: number
  objectives: ObjectiveScores
  is_pareto_optimal: boolean
  allocation: AllocationResult
}

/** Mirrors `DecisionAnalysisOut` at POST /api/v1/decision/analyze. */
export interface DecisionAnalysisResult {
  candidates: Candidate[]
  frontier_candidate_ids: string[]
}

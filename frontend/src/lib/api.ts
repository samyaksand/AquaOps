import axios from 'axios'

import type {
  AllocationResult,
  DecisionAnalysisResult,
  Geography,
  NetworkState,
  ObjectiveScores,
  ScenarioAllocationResult,
  ScenarioIn,
  StrategyName,
} from '@/types/network'

export const api = axios.create({
  baseURL: '/api/v1',
  timeout: 10_000,
})

export async function fetchNetwork(): Promise<NetworkState> {
  const { data } = await api.get<NetworkState>('/network')
  return data
}

export async function runAllocation(
  strategy: StrategyName,
): Promise<AllocationResult> {
  const { data } = await api.post<AllocationResult>('/allocate', { strategy })
  return data
}

export async function applyScenario(scenario: ScenarioIn): Promise<NetworkState> {
  const { data } = await api.post<NetworkState>('/scenarios/apply', scenario)
  return data
}

export async function allocateScenario(
  scenario: ScenarioIn,
  strategy: StrategyName,
): Promise<ScenarioAllocationResult> {
  const { data } = await api.post<ScenarioAllocationResult>(
    '/scenarios/allocate',
    { scenario, strategy },
  )
  return data
}

export async function analyzeDecisions(
  scenario?: ScenarioIn,
): Promise<DecisionAnalysisResult> {
  const { data } = await api.post<DecisionAnalysisResult>('/decision/analyze', {
    scenario: scenario ?? null,
  })
  return data
}

export async function scoreAllocation(
  strategy: StrategyName,
  scenario?: ScenarioIn,
): Promise<ObjectiveScores> {
  const { data } = await api.post<ObjectiveScores>('/decision/score', {
    strategy,
    scenario: scenario ?? null,
  })
  return data
}

export async function fetchGeography(): Promise<Geography> {
  const { data } = await api.get<Geography>('/network/geography')
  return data
}

export async function fetchHealth(): Promise<{ status: string }> {
  const { data } = await api.get<{ status: string }>('/health')
  return data
}

/** Turns an unknown thrown value into something worth showing a user. */
export function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'The request timed out.'
    if (!error.response) {
      return 'Cannot reach the AquaOps API. Is the backend running?'
    }
    const detail = (error.response.data as { detail?: unknown } | undefined)
      ?.detail
    if (typeof detail === 'string') return detail
    return `Request failed with status ${error.response.status}.`
  }
  if (error instanceof Error) return error.message
  return 'An unexpected error occurred.'
}

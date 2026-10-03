import { create } from 'zustand'

import type {
  Candidate,
  DecisionAnalysisResult,
  ObjectiveScores,
} from '@/types/network'

interface DecisionState {
  analysis: DecisionAnalysisResult | null
  loading: boolean
  error: string | null

  /** True when the current analysis was run against the active scenario
   * (useScenarioStore's disrupted network) rather than the normal network. */
  analyzedScenario: boolean

  /** The candidate currently selected for inspection — persists across
   * navigating to the Map and back, so "Inspect on Map" survives the trip. */
  selectedCandidateId: string | null

  /** Server-computed objective scores for the current (non-candidate)
   * allocation, fetched alongside the analysis so Trade-off Summary can
   * compare like-for-like without re-deriving the arithmetic client-side. */
  baselineObjectives: ObjectiveScores | null

  /** The normal-network analysis, kept alongside a scenario analysis so
   * DecisionScenarioComparison can show how the feasible decision space
   * itself shifted — only populated when a scenario analysis is run. */
  normalAnalysis: DecisionAnalysisResult | null

  setAnalysis: (analysis: DecisionAnalysisResult, scenario: boolean) => void
  setNormalAnalysis: (analysis: DecisionAnalysisResult | null) => void
  setBaselineObjectives: (objectives: ObjectiveScores | null) => void
  setLoading: (loading: boolean) => void
  setError: (message: string | null) => void
  selectCandidate: (candidateId: string | null) => void
  reset: () => void
}

export const useDecisionStore = create<DecisionState>((set) => ({
  analysis: null,
  loading: false,
  error: null,
  analyzedScenario: false,
  selectedCandidateId: null,
  baselineObjectives: null,
  normalAnalysis: null,

  setAnalysis: (analysis, scenario) =>
    set({ analysis, analyzedScenario: scenario, loading: false, error: null }),
  setNormalAnalysis: (normalAnalysis) => set({ normalAnalysis }),
  setBaselineObjectives: (baselineObjectives) => set({ baselineObjectives }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  selectCandidate: (selectedCandidateId) => set({ selectedCandidateId }),
  reset: () =>
    set({
      analysis: null,
      loading: false,
      error: null,
      analyzedScenario: false,
      selectedCandidateId: null,
      baselineObjectives: null,
      normalAnalysis: null,
    }),
}))

/** Looks up the currently selected candidate, if any, from the loaded analysis. */
export function selectedCandidate(state: {
  analysis: DecisionAnalysisResult | null
  selectedCandidateId: string | null
}): Candidate | null {
  if (!state.analysis || !state.selectedCandidateId) return null
  return (
    state.analysis.candidates.find(
      (c) => c.candidate_id === state.selectedCandidateId,
    ) ?? null
  )
}

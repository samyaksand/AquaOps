import { useCallback, useRef } from 'react'

import { analyzeDecisions, describeError, scoreAllocation } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import { useDecisionStore } from '@/store/useDecisionStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { ScenarioIn } from '@/types/network'

/**
 * Drives Decision Analysis against the existing `/decision/analyze`
 * endpoint. When a scenario is active (`useScenarioStore.mode === 'scenario'`),
 * analyzing re-sends that same scenario so the server computes candidates
 * over the disrupted network — never recomputed client-side.
 */
export function useDecisionAnalysis() {
  const analysis = useDecisionStore((state) => state.analysis)
  const loading = useDecisionStore((state) => state.loading)
  const error = useDecisionStore((state) => state.error)
  const analyzedScenario = useDecisionStore((state) => state.analyzedScenario)
  const selectedCandidateId = useDecisionStore(
    (state) => state.selectedCandidateId,
  )
  const compareCandidateId = useDecisionStore(
    (state) => state.compareCandidateId,
  )
  const setCompareCandidate = useDecisionStore(
    (state) => state.setCompareCandidate,
  )
  const baselineObjectives = useDecisionStore(
    (state) => state.baselineObjectives,
  )
  const normalAnalysis = useDecisionStore((state) => state.normalAnalysis)
  const setLoading = useDecisionStore((state) => state.setLoading)
  const setError = useDecisionStore((state) => state.setError)
  const setAnalysis = useDecisionStore((state) => state.setAnalysis)
  const setNormalAnalysis = useDecisionStore(
    (state) => state.setNormalAnalysis,
  )
  const setBaselineObjectives = useDecisionStore(
    (state) => state.setBaselineObjectives,
  )
  const selectCandidate = useDecisionStore((state) => state.selectCandidate)
  const reset = useDecisionStore((state) => state.reset)

  const currentStrategy = useAppStore((state) => state.strategy)
  const scenarioMode = useScenarioStore((state) => state.mode)
  const scenarioDrafts = useScenarioStore((state) => state.drafts)
  const scenarioName = useScenarioStore((state) => state.name)
  const scenarioDescription = useScenarioStore((state) => state.description)

  // Guards against a stale response overwriting a newer one: if `analyze()`
  // is called again (e.g. a fast double-click on "Run Analysis", or the
  // scenario changing mid-request) before the first call's requests
  // resolve, only the most recently issued call is allowed to commit its
  // result to the store. Mirrors the `cancelled`-flag pattern already used
  // in ScenarioComparison's RunDiff for the same class of race.
  const requestId = useRef(0)

  const analyze = useCallback(async () => {
    const thisRequestId = ++requestId.current
    setLoading(true)
    const useScenario = scenarioMode === 'scenario' && scenarioDrafts.length > 0
    const scenario: ScenarioIn | undefined = useScenario
      ? {
          name: scenarioName,
          description: scenarioDescription,
          changes: scenarioDrafts.map((d) => d.change),
        }
      : undefined
    try {
      const [result, baseline, normal] = await Promise.all([
        analyzeDecisions(scenario),
        scoreAllocation(currentStrategy, scenario),
        useScenario ? analyzeDecisions() : Promise.resolve(null),
      ])
      if (thisRequestId !== requestId.current) return // superseded by a newer call
      setAnalysis(result, useScenario)
      setBaselineObjectives(baseline)
      setNormalAnalysis(normal)
      // Selecting nothing by default keeps the first view neutral — the
      // user picks a candidate deliberately rather than one being implied
      // as a starting recommendation.
      selectCandidate(null)
    } catch (caught) {
      if (thisRequestId !== requestId.current) return // superseded by a newer call
      setError(describeError(caught))
    }
  }, [
    currentStrategy,
    scenarioMode,
    scenarioDrafts,
    scenarioName,
    scenarioDescription,
    setAnalysis,
    setNormalAnalysis,
    setBaselineObjectives,
    setError,
    setLoading,
    selectCandidate,
  ])

  return {
    analysis,
    loading,
    error,
    analyzedScenario,
    selectedCandidateId,
    compareCandidateId,
    setCompareCandidate,
    baselineObjectives,
    normalAnalysis,
    analyze,
    selectCandidate,
    reset,
  }
}

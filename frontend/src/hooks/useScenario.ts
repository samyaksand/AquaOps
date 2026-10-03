import { useCallback } from 'react'

import { allocateScenario, applyScenario, describeError } from '@/lib/api'
import { useScenarioStore } from '@/store/useScenarioStore'
import type { ScenarioIn, StrategyName } from '@/types/network'

/**
 * Drives the scenario workflow against the existing scenario endpoints.
 * `apply` previews the disrupted network; `reallocate` applies the same
 * scenario and runs the allocation engine over the result in one call.
 * Nothing here recomputes allocation or scenario effects client-side.
 */
export function useScenario() {
  const drafts = useScenarioStore((state) => state.drafts)
  const name = useScenarioStore((state) => state.name)
  const description = useScenarioStore((state) => state.description)
  const mode = useScenarioStore((state) => state.mode)
  const summary = useScenarioStore((state) => state.summary)
  const network = useScenarioStore((state) => state.network)
  const allocation = useScenarioStore((state) => state.allocation)
  const applying = useScenarioStore((state) => state.applying)
  const applyError = useScenarioStore((state) => state.applyError)
  const reallocating = useScenarioStore((state) => state.reallocating)
  const reallocateError = useScenarioStore((state) => state.reallocateError)

  const setApplying = useScenarioStore((state) => state.setApplying)
  const setApplyError = useScenarioStore((state) => state.setApplyError)
  const setReallocating = useScenarioStore((state) => state.setReallocating)
  const setReallocateError = useScenarioStore((state) => state.setReallocateError)
  const setApplied = useScenarioStore((state) => state.setApplied)
  const setAllocated = useScenarioStore((state) => state.setAllocated)
  const reset = useScenarioStore((state) => state.reset)

  const buildScenario = useCallback((): ScenarioIn => ({
    name,
    description,
    changes: drafts.map((draft) => draft.change),
  }), [name, description, drafts])

  const apply = useCallback(async () => {
    setApplying(true)
    try {
      const scenario = buildScenario()
      const disrupted = await applyScenario(scenario)
      setApplied(disrupted, {
        name: scenario.name,
        description: scenario.description ?? '',
        changes: drafts.map((draft) => draft.change.type),
      })
    } catch (caught) {
      setApplyError(describeError(caught))
    }
  }, [buildScenario, drafts, setApplied, setApplying, setApplyError])

  const reallocate = useCallback(
    async (strategy: StrategyName) => {
      setReallocating(true)
      try {
        const scenario = buildScenario()
        const result = await allocateScenario(scenario, strategy)
        setAllocated(result.network, result.scenario, result.allocation)
      } catch (caught) {
        setReallocateError(describeError(caught))
      }
    },
    [buildScenario, setAllocated, setReallocating, setReallocateError],
  )

  return {
    drafts,
    mode,
    summary,
    network,
    allocation,
    applying,
    applyError,
    reallocating,
    reallocateError,
    apply,
    reallocate,
    reset,
  }
}

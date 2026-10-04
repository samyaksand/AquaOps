import { create } from 'zustand'

import type {
  AllocationResult,
  NetworkState,
  ScenarioChangeIn,
  ScenarioSummary,
} from '@/types/network'

export type ScenarioMode = 'normal' | 'scenario'

let nextDraftId = 1

/** A pending change in the builder, not yet sent to the backend. */
export interface DraftChange {
  id: number
  change: ScenarioChangeIn
}

let nextRunId = 1

/** A completed scenario run — a snapshot taken right after a successful
 * Reallocate, kept only for this session (in-memory, never persisted) so the
 * Scenario Lab can let a user compare two runs they've already seen. */
export interface ScenarioRun {
  id: string
  name: string
  drafts: DraftChange[]
  network: NetworkState
  allocation: AllocationResult
  summary: ScenarioSummary
  createdAt: number
}

/** How many past runs to keep — recent experiments are what's worth
 * comparing; older ones are dropped rather than growing this unbounded. */
const MAX_HISTORY = 8

interface ScenarioState {
  name: string
  description: string
  drafts: DraftChange[]

  mode: ScenarioMode
  applying: boolean
  applyError: string | null

  reallocating: boolean
  reallocateError: string | null

  summary: ScenarioSummary | null
  network: NetworkState | null
  allocation: AllocationResult | null

  /** Past completed runs this session, newest first — see `ScenarioRun`. */
  history: ScenarioRun[]

  setName: (name: string) => void
  setDescription: (description: string) => void
  addChange: (change: ScenarioChangeIn) => void
  updateChange: (id: number, change: ScenarioChangeIn) => void
  removeChange: (id: number) => void
  clearChanges: () => void

  setApplying: (value: boolean) => void
  setApplyError: (message: string | null) => void
  setReallocating: (value: boolean) => void
  setReallocateError: (message: string | null) => void

  setApplied: (network: NetworkState, summary: ScenarioSummary) => void
  setAllocated: (
    network: NetworkState,
    summary: ScenarioSummary,
    allocation: AllocationResult,
  ) => void

  /** Records the current scenario (name, drafts, network, allocation,
   * summary) as a new history entry — called right after `setAllocated`
   * succeeds, so every completed Reallocate becomes something the user can
   * later pick for comparison. */
  commitRun: () => void
  clearHistory: () => void

  reset: () => void
}

export const useScenarioStore = create<ScenarioState>((set) => ({
  name: 'Untitled scenario',
  description: '',
  drafts: [],

  mode: 'normal',
  applying: false,
  applyError: null,

  reallocating: false,
  reallocateError: null,

  summary: null,
  network: null,
  allocation: null,

  history: [],

  setName: (name) => set({ name }),
  setDescription: (description) => set({ description }),
  addChange: (change) =>
    set((state) => ({
      drafts: [...state.drafts, { id: nextDraftId++, change }],
    })),
  updateChange: (id, change) =>
    set((state) => ({
      drafts: state.drafts.map((draft) =>
        draft.id === id ? { ...draft, change } : draft,
      ),
    })),
  removeChange: (id) =>
    set((state) => ({
      drafts: state.drafts.filter((draft) => draft.id !== id),
    })),
  clearChanges: () => set({ drafts: [] }),

  setApplying: (applying) => set({ applying }),
  setApplyError: (applyError) => set({ applyError, applying: false }),
  setReallocating: (reallocating) => set({ reallocating }),
  setReallocateError: (reallocateError) =>
    set({ reallocateError, reallocating: false }),

  setApplied: (network, summary) =>
    set({
      network,
      summary,
      allocation: null,
      mode: 'scenario',
      applying: false,
      applyError: null,
    }),
  setAllocated: (network, summary, allocation) =>
    set({
      network,
      summary,
      allocation,
      mode: 'scenario',
      reallocating: false,
      reallocateError: null,
    }),

  commitRun: () =>
    set((state) => {
      if (!state.network || !state.allocation || !state.summary) return {}
      const run: ScenarioRun = {
        id: `run-${nextRunId++}`,
        name: state.name || 'Untitled scenario',
        drafts: state.drafts,
        network: state.network,
        allocation: state.allocation,
        summary: state.summary,
        createdAt: Date.now(),
      }
      return { history: [run, ...state.history].slice(0, MAX_HISTORY) }
    }),
  clearHistory: () => set({ history: [] }),

  reset: () =>
    set({
      mode: 'normal',
      summary: null,
      network: null,
      allocation: null,
      applyError: null,
      reallocateError: null,
      drafts: [],
    }),
}))

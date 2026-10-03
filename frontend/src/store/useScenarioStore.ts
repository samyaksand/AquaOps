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

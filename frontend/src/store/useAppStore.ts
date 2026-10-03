import { create } from 'zustand'

import type { AllocationResult, NetworkState, StrategyName } from '@/types/network'

export type ViewId = 'overview' | 'network' | 'scenarios' | 'decision' | 'strategies'

interface AppState {
  view: ViewId
  strategy: StrategyName
  sidebarCollapsed: boolean
  /** Collapses the Network/Scenarios side panel to a slim rail so the map
   * stays the dominant surface by default — expand on demand, not always on. */
  sidePanelCollapsed: boolean
  selectedNodeCode: string | null

  network: NetworkState | null
  networkError: string | null
  networkLoading: boolean

  allocation: AllocationResult | null
  allocationError: string | null
  allocationLoading: boolean

  /** A Decision Analysis candidate pinned for map inspection — set only by
   * "Inspect on Map", shown instead of the normal allocation until cleared.
   * Carries the candidate id so the map can badge it clearly as inspected
   * rather than the live allocation. */
  inspectedAllocation: AllocationResult | null
  inspectedCandidateId: string | null

  setView: (view: ViewId) => void
  setStrategy: (strategy: StrategyName) => void
  toggleSidebar: () => void
  toggleSidePanel: () => void
  selectNode: (code: string | null) => void

  setNetwork: (network: NetworkState) => void
  setNetworkError: (message: string | null) => void
  setNetworkLoading: (loading: boolean) => void

  setAllocation: (allocation: AllocationResult) => void
  setAllocationError: (message: string | null) => void
  setAllocationLoading: (loading: boolean) => void
  clearAllocation: () => void

  setInspectedAllocation: (
    allocation: AllocationResult,
    candidateId: string,
  ) => void
  clearInspectedAllocation: () => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'overview',
  strategy: 'balanced',
  sidebarCollapsed: false,
  sidePanelCollapsed: true,
  selectedNodeCode: null,

  network: null,
  networkError: null,
  networkLoading: false,

  allocation: null,
  allocationError: null,
  allocationLoading: false,

  inspectedAllocation: null,
  inspectedCandidateId: null,

  setView: (view) => set({ view }),
  setStrategy: (strategy) => set({ strategy }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleSidePanel: () =>
    set((state) => ({ sidePanelCollapsed: !state.sidePanelCollapsed })),
  selectNode: (selectedNodeCode) => set({ selectedNodeCode }),

  setNetwork: (network) =>
    set({ network, networkError: null, networkLoading: false }),
  setNetworkError: (networkError) =>
    set({ networkError, networkLoading: false }),
  setNetworkLoading: (networkLoading) => set({ networkLoading }),

  setAllocation: (allocation) =>
    set({ allocation, allocationError: null, allocationLoading: false }),
  setAllocationError: (allocationError) =>
    set({ allocationError, allocationLoading: false }),
  setAllocationLoading: (allocationLoading) => set({ allocationLoading }),
  clearAllocation: () =>
    set({ allocation: null, allocationError: null, allocationLoading: false }),

  setInspectedAllocation: (inspectedAllocation, inspectedCandidateId) =>
    set({ inspectedAllocation, inspectedCandidateId }),
  clearInspectedAllocation: () =>
    set({ inspectedAllocation: null, inspectedCandidateId: null }),
}))

import { create } from 'zustand'

import type { AllocationResult, NetworkState, StrategyName } from '@/types/network'

export type ViewId = 'overview' | 'network' | 'scenarios' | 'strategies'

interface AppState {
  view: ViewId
  strategy: StrategyName
  sidebarCollapsed: boolean
  selectedNodeCode: string | null

  network: NetworkState | null
  networkError: string | null
  networkLoading: boolean

  allocation: AllocationResult | null
  allocationError: string | null
  allocationLoading: boolean

  setView: (view: ViewId) => void
  setStrategy: (strategy: StrategyName) => void
  toggleSidebar: () => void
  selectNode: (code: string | null) => void

  setNetwork: (network: NetworkState) => void
  setNetworkError: (message: string | null) => void
  setNetworkLoading: (loading: boolean) => void

  setAllocation: (allocation: AllocationResult) => void
  setAllocationError: (message: string | null) => void
  setAllocationLoading: (loading: boolean) => void
  clearAllocation: () => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'overview',
  strategy: 'balanced',
  sidebarCollapsed: false,
  selectedNodeCode: null,

  network: null,
  networkError: null,
  networkLoading: false,

  allocation: null,
  allocationError: null,
  allocationLoading: false,

  setView: (view) => set({ view }),
  setStrategy: (strategy) => set({ strategy }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
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
}))

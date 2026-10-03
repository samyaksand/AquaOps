import { create } from 'zustand'

import type { NetworkState, StrategyName } from '@/types/network'

export type ViewId = 'overview' | 'network' | 'scenarios' | 'strategies'

interface AppState {
  view: ViewId
  strategy: StrategyName
  sidebarCollapsed: boolean
  selectedNodeCode: string | null

  network: NetworkState | null
  networkError: string | null
  networkLoading: boolean

  setView: (view: ViewId) => void
  setStrategy: (strategy: StrategyName) => void
  toggleSidebar: () => void
  selectNode: (code: string | null) => void

  setNetwork: (network: NetworkState) => void
  setNetworkError: (message: string | null) => void
  setNetworkLoading: (loading: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  view: 'overview',
  strategy: 'balanced',
  sidebarCollapsed: false,
  selectedNodeCode: null,

  network: null,
  networkError: null,
  networkLoading: false,

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
}))

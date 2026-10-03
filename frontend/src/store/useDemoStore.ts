import { create } from 'zustand'

/** Demo Mode's own step cursor. Everything the demo *does* (allocate, apply
 * a scenario, reallocate, switch strategy) goes through the existing
 * stores/hooks — this only tracks which step of the guided walkthrough is
 * showing, never a parallel copy of allocation/scenario state. */
interface DemoState {
  active: boolean
  step: number
  start: () => void
  stop: () => void
  next: () => void
  back: () => void
  goTo: (step: number) => void
}

export const useDemoStore = create<DemoState>((set) => ({
  active: false,
  step: 0,
  start: () => set({ active: true, step: 0 }),
  stop: () => set({ active: false }),
  next: () => set((state) => ({ step: state.step + 1 })),
  back: () => set((state) => ({ step: Math.max(0, state.step - 1) })),
  goTo: (step) => set({ step }),
}))

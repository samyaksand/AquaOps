import { create } from 'zustand'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'aquaops-theme'

function systemPreference(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

/** Reads the persisted choice; falls back to the OS preference on first
 * visit (nothing stored yet) rather than defaulting to dark outright. */
function initialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // Storage can throw in a private window or with site data blocked —
    // fall through to the system preference either way.
  }
  return systemPreference()
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Best-effort persistence only; the app still works for this session.
  }
}

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const theme = initialTheme()
  applyTheme(theme)
  return {
    theme,
    toggle: () => {
      const next = get().theme === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      set({ theme: next })
    },
    setTheme: (next) => {
      applyTheme(next)
      set({ theme: next })
    },
  }
})

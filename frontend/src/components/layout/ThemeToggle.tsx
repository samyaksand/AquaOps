import { Moon, Sun } from 'lucide-react'

import { useThemeStore } from '@/store/useThemeStore'

/** A clearly-labelled light/dark switch — two explicit targets rather than
 * one ambiguous icon, so the current state and the action are both obvious
 * at a glance. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const toggle = useThemeStore((state) => state.toggle)

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        className="flex size-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-raised hover:text-ink"
      >
        {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
      </button>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="flex items-center gap-1 rounded-lg border border-hairline bg-raised/60 p-0.5"
    >
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'light'}
        onClick={() => setTheme('light')}
        className={
          theme === 'light'
            ? 'flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm'
            : 'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-ink-subtle hover:text-ink-muted'
        }
      >
        <Sun className="size-3.5" aria-hidden="true" />
        Light
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={theme === 'dark'}
        onClick={() => setTheme('dark')}
        className={
          theme === 'dark'
            ? 'flex items-center gap-1.5 rounded-md bg-surface px-2.5 py-1.5 text-xs font-medium text-ink shadow-sm'
            : 'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-ink-subtle hover:text-ink-muted'
        }
      >
        <Moon className="size-3.5" aria-hidden="true" />
        Dark
      </button>
    </div>
  )
}

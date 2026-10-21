import { Info } from 'lucide-react'
import { useId, useState } from 'react'

interface InfoTooltipProps {
  /** Plain-text explanation, kept accurate to the actual implementation —
   * never a generic textbook definition detached from what this app does. */
  children: string
}

/**
 * A small `(i)` trigger that reveals a short explanation on hover/focus —
 * for technical terms (Pareto frontier, equity, logistics efficiency, …)
 * that a reader outside this project's immediate research area may not
 * know, without permanently cluttering the layout the way inline prose
 * would. Keyboard-accessible (focus/blur mirror hover) since it's a real
 * control, not decoration.
 */
export function InfoTooltip({ children }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex size-3.5 items-center justify-center rounded-full text-ink-subtle transition-colors hover:text-aqua-300 focus-visible:text-aqua-300"
      >
        <Info className="size-3.5" aria-hidden="true" />
        <span className="sr-only">More information</span>
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="rise-in pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-lg border border-divider bg-depth/98 p-2.5 text-[11px] leading-relaxed font-normal text-ink-muted shadow-2xl backdrop-blur"
        >
          {children}
        </span>
      ) : null}
    </span>
  )
}

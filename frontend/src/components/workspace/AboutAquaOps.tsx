import { AnimatePresence, motion } from 'framer-motion'
import {
  Droplets,
  GitCompareArrows,
  HeartHandshake,
  Info,
  ScatterChart,
  Waves,
  X,
} from 'lucide-react'
import { useState } from 'react'

import { IconButton } from '@/components/ui/Button'

const POINTS = [
  {
    icon: Waves,
    title: 'Allocate scarce water',
    text: 'Reservoirs, treatment plants, and tankers deliver to demand zones and critical facilities under real capacity and transit limits.',
  },
  {
    icon: GitCompareArrows,
    title: 'Four allocation strategies',
    text: 'Population First, Critical Infrastructure First, Efficiency First, and Balanced — each produces a genuinely different outcome.',
  },
  {
    icon: ScatterChart,
    title: 'Scenario & decision analysis',
    text: 'Simulate disruptions in the Scenario Lab, then explore the Pareto frontier of trade-offs between outcomes.',
  },
  {
    icon: HeartHandshake,
    title: 'Supports, never replaces, judgment',
    text: 'AquaOps computes real trade-offs for a human decision-maker — it never decides societal priorities on its own.',
  },
]

/**
 * The persistent "What is AquaOps?" entry point — unlike the one-time
 * `IntroOverlay`, this stays reachable from anywhere via a Sidebar trigger,
 * so a returning user (or one who dismissed the first-visit card) can still
 * get oriented. Same honest, compact framing; no new claims.
 */
export function AboutAquaOps() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] text-ink-subtle transition-colors hover:bg-raised/60 hover:text-ink-muted"
      >
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        What is AquaOps?
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="What is AquaOps?"
            className="fixed inset-0 z-50 flex items-center justify-center bg-abyss/60 p-4 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ duration: 0.18 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-aqua-500/30 bg-depth p-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-aqua-500/15 ring-1 ring-aqua-500/25">
                    <Droplets className="size-4.5 text-aqua-400" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold text-ink">AquaOps</h2>
                    <p className="text-xs text-ink-subtle">
                      A simulated decision-support platform
                    </p>
                  </div>
                </div>
                <IconButton label="Close" onClick={() => setOpen(false)}>
                  <X className="size-4" />
                </IconButton>
              </div>

              <ul className="mt-4 space-y-3">
                {POINTS.map(({ icon: Icon, title, text }) => (
                  <li key={title} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-raised text-aqua-400">
                      <Icon className="size-3.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">{title}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-subtle">
                        {text}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-[10px] leading-relaxed text-ink-subtle">
                Simulated prototype — not connected to real infrastructure or
                validated for operational use.
              </p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}

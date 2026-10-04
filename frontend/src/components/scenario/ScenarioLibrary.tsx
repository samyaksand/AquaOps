import { clsx } from 'clsx'
import { motion } from 'framer-motion'
import {
  Building2,
  Droplets,
  GaugeCircle,
  PlugZap,
  Ship,
  Siren,
  Users,
  Waves,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { buildNameIndex } from '@/lib/labels'
import { largestTargetFor, SCENARIO_CARD_COPY } from '@/lib/scenarioBuilder'
import {
  SCENARIO_CHANGE_LABELS,
  type NetworkState,
  type ScenarioChangeType,
} from '@/types/network'

const CHANGE_TYPES = Object.keys(SCENARIO_CHANGE_LABELS) as ScenarioChangeType[]

const ICONS: Record<ScenarioChangeType, ComponentType<{ className?: string }>> = {
  reduce_reservoir_supply: Droplets,
  reduce_treatment_capacity: GaugeCircle,
  reduce_pipeline_capacity: Waves,
  set_pipeline_unavailable: PlugZap,
  change_zone_demand: Users,
  change_facility_demand: Building2,
  set_tanker_unavailable: Ship,
}

interface ScenarioLibraryProps {
  network: NetworkState | null
  selectedType: ScenarioChangeType | null
  onSelect: (type: ScenarioChangeType) => void
}

/**
 * "Choose a scenario" — a small set of visually distinct cards (one per
 * valid scenario change type) rather than a technical dropdown. Every
 * number shown is the real current-network value for that change's largest
 * eligible target; a type with no eligible target in this network is still
 * shown (every valid scenario stays selectable) but visibly disabled.
 */
export function ScenarioLibrary({
  network,
  selectedType,
  onSelect,
}: ScenarioLibraryProps) {
  const names = buildNameIndex(network)

  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
      {CHANGE_TYPES.map((type) => {
        const Icon = ICONS[type]
        const target = largestTargetFor(type, network, names)
        const active = selectedType === type
        return (
          <motion.button
            key={type}
            type="button"
            disabled={!target}
            onClick={() => onSelect(type)}
            whileHover={target ? { y: -2 } : undefined}
            whileTap={target ? { scale: 0.98 } : undefined}
            className={clsx(
              'flex flex-col gap-2 rounded-2xl border p-3.5 text-left transition-colors',
              'disabled:pointer-events-none disabled:opacity-40',
              active
                ? 'border-aqua-500/60 bg-aqua-500/[0.08] ring-1 ring-aqua-500/30'
                : 'border-hairline bg-surface hover:border-ink-subtle/30 hover:bg-raised/40',
            )}
          >
            <span
              className={clsx(
                'flex size-8 shrink-0 items-center justify-center rounded-xl ring-1',
                active
                  ? 'bg-aqua-500/15 text-aqua-300 ring-aqua-500/30'
                  : 'bg-raised text-ink-muted ring-divider',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink">
                {SCENARIO_CHANGE_LABELS[type]}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink-subtle">
                {SCENARIO_CARD_COPY[type].description}
              </p>
            </div>
            {target ? (
              <p className="mt-auto truncate text-[11px] text-ink-muted">
                {target.label}
              </p>
            ) : (
              <p className="mt-auto flex items-center gap-1 truncate text-[11px] text-ink-subtle">
                <Siren className="size-3" aria-hidden="true" />
                No eligible asset in this network
              </p>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

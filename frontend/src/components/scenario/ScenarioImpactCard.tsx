import { motion, useMotionValueEvent, useSpring } from 'framer-motion'
import { GitCompareArrows, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { describeScenarioChange } from '@/lib/labels'
import { formatPercent, formatVolume } from '@/lib/format'
import type { DraftChange } from '@/store/useScenarioStore'
import type { AllocationResult } from '@/types/network'

interface ScenarioImpactCardProps {
  normal: AllocationResult | null
  scenario: AllocationResult | null
  drafts?: DraftChange[]
  names?: Record<string, string>
}

const SIGNIFICANCE_THRESHOLD = 0.005 // 0.5% of normal — below this, call it "no meaningful change"

/**
 * The "impact moment" — one strong card, one headline, a handful of metrics.
 * Every number is a straight diff of two already-computed `AllocationResult`s,
 * never recomputed or estimated.
 * Numeric values animate between runs via Framer Motion springs so a second
 * scenario visibly moves off the first rather than just swapping text.
 */
export function ScenarioImpactCard({
  normal,
  scenario,
  drafts = [],
  names = {},
}: ScenarioImpactCardProps) {
  if (!scenario) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-hairline px-4 py-8 text-center">
        <GitCompareArrows className="size-5 text-ink-subtle" aria-hidden="true" />
        <p className="text-[13px] text-ink-subtle">
          Apply and reallocate a scenario to see its impact here.
        </p>
      </div>
    )
  }

  const { headline, noChange } = buildHeadline(normal, scenario)

  return (
    <motion.section
      aria-label="Scenario impact"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden rounded-2xl border border-status-warn/30 bg-surface"
    >
      <div className="flex items-start gap-3 border-b border-hairline bg-status-warn/[0.06] px-4 py-3.5">
        <GitCompareArrows
          className="mt-0.5 size-4 shrink-0 text-status-warn"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-wide text-ink uppercase">
            Scenario impact
          </h2>
          {!normal ? (
            <p className="mt-0.5 text-xs text-ink-subtle">
              Run a normal allocation to compare against it.
            </p>
          ) : (
            <p
              className={
                noChange
                  ? 'mt-1 text-sm font-medium text-ink-muted'
                  : 'mt-1 text-sm font-semibold text-ink'
              }
            >
              {headline}
            </p>
          )}
          {drafts.length > 0 ? (
            <p className="mt-1 truncate text-[11px] text-ink-subtle">
              {drafts.map((d) => describeScenarioChange(d.change, names)).join(' · ')}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 sm:grid-cols-4">
        <CompareMetric
          label="Allocated"
          before={normal?.metrics.total_supplied_m3_per_day}
          after={scenario.metrics.total_supplied_m3_per_day}
          unit="m³/day"
        />
        <CompareMetric
          label="Unmet"
          before={normal?.metrics.total_unmet_m3_per_day}
          after={scenario.metrics.total_unmet_m3_per_day}
          unit="m³/day"
          invert
        />
        <CompareMetric
          label="Coverage"
          before={normal?.metrics.demand_coverage_ratio}
          after={scenario.metrics.demand_coverage_ratio}
          percent
        />
        <CompareMetric
          label="Below minimum"
          before={normal?.metrics.minimum_demand_shortfalls.length}
          after={scenario.metrics.minimum_demand_shortfalls.length}
          invert
        />
      </div>
    </motion.section>
  )
}

/** One honest sentence: a real volume/coverage delta if there is one, or an
 * explicit "no meaningful change" when the scenario didn't move the
 * allocation — e.g. because the disrupted asset wasn't the network's actual
 * bottleneck. Never invents a cause beyond what the two results show. */
function buildHeadline(
  normal: AllocationResult | null,
  scenario: AllocationResult,
): { headline: string; noChange: boolean } {
  if (!normal) return { headline: '', noChange: false }

  const beforeSupplied = normal.metrics.total_supplied_m3_per_day
  const afterSupplied = scenario.metrics.total_supplied_m3_per_day
  const suppliedDelta = afterSupplied - beforeSupplied

  const beforeShortfalls = normal.metrics.minimum_demand_shortfalls.length
  const afterShortfalls = scenario.metrics.minimum_demand_shortfalls.length
  const shortfallDelta = afterShortfalls - beforeShortfalls

  const relativeChange =
    beforeSupplied > 0 ? Math.abs(suppliedDelta) / beforeSupplied : 0

  if (relativeChange < SIGNIFICANCE_THRESHOLD && shortfallDelta === 0) {
    return {
      headline:
        'No meaningful allocation change — the disrupted asset was not the network’s binding constraint here.',
      noChange: true,
    }
  }

  const direction = suppliedDelta < 0 ? 'reduced' : 'increased'
  const magnitude = formatVolume(Math.abs(suppliedDelta))
  const zoneNote =
    shortfallDelta > 0
      ? ` ${shortfallDelta} more demand point${shortfallDelta === 1 ? '' : 's'} fell below minimum.`
      : shortfallDelta < 0
        ? ` ${Math.abs(shortfallDelta)} fewer demand point${Math.abs(shortfallDelta) === 1 ? '' : 's'} are below minimum.`
        : ''

  return {
    headline: `Delivered supply ${direction} by ${magnitude} m³/day.${zoneNote}`,
    noChange: false,
  }
}

function CompareMetric({
  label,
  before,
  after,
  unit,
  percent,
  invert,
}: {
  label: string
  before: number | undefined
  after: number
  unit?: string
  percent?: boolean
  invert?: boolean
}) {
  const format = (value: number) =>
    percent ? formatPercent(value) : formatVolume(value)

  const delta = before !== undefined ? after - before : null
  const worse = delta !== null && delta !== 0 && (invert ? delta > 0 : delta < 0)
  const better = delta !== null && delta !== 0 && (invert ? delta < 0 : delta > 0)
  const toneClass = worse
    ? 'text-status-critical'
    : better
      ? 'text-status-ok'
      : 'text-ink'

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <AnimatedNumber value={after} format={format} className={`text-lg font-semibold ${toneClass}`} />
        {unit ? <span className="text-[11px] text-ink-subtle">{unit}</span> : null}
      </div>
      {delta !== null && delta !== 0 ? (
        <div
          className={`mt-0.5 flex items-center gap-1 text-[11px] ${toneClass}`}
        >
          {delta > 0 ? (
            <TrendingUp className="size-3" aria-hidden="true" />
          ) : (
            <TrendingDown className="size-3" aria-hidden="true" />
          )}
          <span className="tabular">
            {delta > 0 ? '+' : ''}
            {format(delta)} vs normal
          </span>
        </div>
      ) : before !== undefined ? (
        <p className="mt-0.5 text-[11px] text-ink-subtle">No change</p>
      ) : null}
    </div>
  )
}

/** Animates a displayed number toward `value` with a spring rather than
 * snapping — purely a presentation transition over an already-computed
 * number, never an interpolated/fabricated intermediate value held still. */
function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number
  format: (value: number) => string
  className?: string
}) {
  const spring = useSpring(value, { duration: 500, bounce: 0 })
  const [display, setDisplay] = useState(() => format(value))
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      spring.jump(value)
      return
    }
    spring.set(value)
  }, [value, spring])

  useMotionValueEvent(spring, 'change', (current) => {
    setDisplay(format(current))
  })

  return <span className={`tabular ${className ?? ''}`}>{display}</span>
}

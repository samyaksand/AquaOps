import { clsx } from 'clsx'
import {
  ArrowRight,
  ChevronLeft,
  Droplets,
  PlayCircle,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { Button, IconButton } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/States'
import { useAllocation } from '@/hooks/useAllocation'
import { useScenario } from '@/hooks/useScenario'
import { formatPercent, formatVolume } from '@/lib/format'
import { runAllocation } from '@/lib/api'
import { useAppStore, type ViewId } from '@/store/useAppStore'
import { useDemoStore } from '@/store/useDemoStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import {
  STRATEGY_LABELS,
  type AllocationResult,
  type NetworkState,
  type StrategyName,
} from '@/types/network'

interface DemoStep {
  view: ViewId
  title: string
  body: string
  cta: string
}

const STEPS: DemoStep[] = [
  {
    view: 'overview',
    title: 'Welcome to AquaOps',
    body: 'AquaOps helps a city decide how to share limited water between reservoirs, hospitals, schools, and neighborhoods — especially when something goes wrong. This is a simulated city, Rivertown.',
    cta: 'Start the walkthrough',
  },
  {
    view: 'network',
    title: 'This is Rivertown',
    body: 'Reservoirs and treatment plants supply water through pipelines to homes and critical facilities like hospitals. Right now the network is in its normal state — nothing has been decided yet.',
    cta: 'Run an allocation',
  },
  {
    view: 'network',
    title: 'Allocating water',
    body: 'The allocation engine just decided how to route today’s supply to everyone who needs it, respecting pipeline capacity and each facility’s priority.',
    cta: 'See it on the map',
  },
  {
    view: 'network',
    title: 'Reading the result',
    body: 'Green rings mean a facility is fully supplied; red rings mean it isn’t. Hover any node for its numbers, or click it for full detail.',
    cta: 'Introduce a disruption',
  },
  {
    view: 'scenarios',
    title: 'A realistic disruption',
    body: 'Droughts happen. We’ll simulate one by cutting supply from a reservoir by 40% and see what it does to the city.',
    cta: 'Apply the scenario',
  },
  {
    view: 'scenarios',
    title: 'Scenario applied',
    body: 'The network now reflects the disruption, but nobody has re-decided how to share what’s left yet.',
    cta: 'Reallocate',
  },
  {
    view: 'scenarios',
    title: 'Reallocating under the disruption',
    body: 'The same allocation engine just ran again, this time against the reduced supply.',
    cta: 'Compare before/after',
  },
  {
    view: 'scenarios',
    title: 'Before vs. after',
    body: 'The comparison below shows exactly what changed: how much less was delivered, and how many facilities dropped below their minimum.',
    cta: 'Compare strategies',
  },
  {
    view: 'network',
    title: 'Strategies decide differently',
    body: 'We’ll run the same normal network under two different strategies so you can see they don’t agree on the best answer.',
    cta: 'Run strategy comparison',
  },
  {
    view: 'network',
    title: 'No single right answer',
    body: 'Different strategies trade off population reach against critical-facility coverage differently. That trade-off is the whole point of Decision Analysis.',
    cta: 'Open Decision Analysis',
  },
  {
    view: 'decision',
    title: 'Explore every trade-off',
    body: 'This Pareto frontier shows every non-dominated allocation the engine could produce. Click any point to inspect it, or compare two side by side.',
    cta: 'Finish',
  },
]

const COMPARE_STRATEGIES: StrategyName[] = ['population_first', 'critical_infrastructure_first']

export function DemoLaunchButton() {
  const start = useDemoStore((state) => state.start)
  return (
    <button
      type="button"
      onClick={start}
      className="flex items-center gap-2 rounded-lg border border-aqua-500/40 bg-gradient-to-br from-aqua-500/15 to-aqua-500/5 px-3 py-2 text-sm font-medium text-ink transition-colors hover:border-aqua-400/60"
    >
      <Sparkles className="size-4 text-aqua-300" aria-hidden="true" />
      Launch Demo
    </button>
  )
}

export function DemoMode({ network }: { network: NetworkState | null }) {
  const active = useDemoStore((state) => state.active)
  const step = useDemoStore((state) => state.step)
  const stop = useDemoStore((state) => state.stop)
  const next = useDemoStore((state) => state.next)
  const back = useDemoStore((state) => state.back)
  const setView = useAppStore((state) => state.setView)
  const strategy = useAppStore((state) => state.strategy)

  const { allocation, allocate, loading: allocating } = useAllocation()
  const addChange = useScenarioStore((state) => state.addChange)
  const clearChanges = useScenarioStore((state) => state.clearChanges)
  const scenarioReset = useScenarioStore((state) => state.reset)
  const {
    apply,
    reallocate,
    applying,
    reallocating,
    allocation: scenarioAllocation,
  } = useScenario()

  const [compareResults, setCompareResults] = useState<
    { strategy: StrategyName; allocation: AllocationResult }[] | null
  >(null)
  const [comparing, setComparing] = useState(false)

  const current = STEPS[step]
  const isLastStep = step === STEPS.length - 1

  // Keep the visible nav view in sync with whatever the current step needs.
  useEffect(() => {
    if (active && current) setView(current.view)
  }, [active, step, current, setView])

  // Reset demo-driven state when the walkthrough ends, so leaving mid-way
  // never strands the app in a half-built scenario.
  useEffect(() => {
    if (!active) {
      clearChanges()
      scenarioReset()
      setCompareResults(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  // Prefer an already-derated reservoir: it's the realistic "already
  // stressed" asset to cut further, and — unlike picking the first online
  // one — it's reliably a real bottleneck in the seeded network, so the
  // demo's before/after comparison always shows a genuine change rather
  // than depending on which reservoir happens to be least load-bearing.
  const reservoir = useMemo(
    () =>
      network?.sources.find((s) => s.state === 'derated') ??
      network?.sources[0] ??
      null,
    [network],
  )

  if (!active) return null

  const handlePrimary = async () => {
    switch (step) {
      case 1: // Run allocation
        await allocate(strategy)
        next()
        return
      case 4: // Apply scenario
        // useScenario()'s apply() builds its request from the drafts this
        // hook was rendered with — adding a draft and calling apply() in the
        // same tick would send the *previous* (empty) draft list, since the
        // store update hasn't flowed back through a re-render yet. Reading
        // the store's own imperative getState() after the synchronous
        // addChange() sidesteps that stale-closure gap.
        if (reservoir && useScenarioStore.getState().drafts.length === 0) {
          addChange({
            type: 'reduce_reservoir_supply',
            target_code: reservoir.code,
            fraction: 0.4,
          })
        }
        await apply(useScenarioStore.getState().drafts.map((d) => d.change))
        next()
        return
      case 6: // Reallocate under scenario
        await reallocate(
          strategy,
          useScenarioStore.getState().drafts.map((d) => d.change),
        )
        next()
        return
      case 8: // Run strategy comparison
        setComparing(true)
        try {
          const results = await Promise.all(
            COMPARE_STRATEGIES.map(async (s) => ({
              strategy: s,
              allocation: await runAllocation(s),
            })),
          )
          setCompareResults(results)
        } finally {
          setComparing(false)
        }
        next()
        return
      case STEPS.length - 1:
        stop()
        return
      default:
        next()
    }
  }

  const primaryBusy = allocating || applying || reallocating || comparing
  const reservoirName = reservoir?.name ?? 'a reservoir'

  return (
    <div className="fixed bottom-5 left-1/2 z-50 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="rounded-2xl border border-aqua-500/30 bg-depth/98 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-aqua-500/15 text-aqua-300">
              <Droplets className="size-3.5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[10px] font-medium tracking-wide text-aqua-300 uppercase">
                Demo · Step {step + 1} of {STEPS.length}
              </p>
              <h3 className="text-sm font-semibold text-ink">{current.title}</h3>
            </div>
          </div>
          <IconButton label="Exit demo" onClick={stop} className="size-7">
            <X className="size-3.5" />
          </IconButton>
        </div>

        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
          {step === 4
            ? current.body.replace('a reservoir', reservoirName)
            : current.body}
        </p>

        {step === 7 && scenarioAllocation ? (
          <DemoBeforeAfter normal={allocation} scenario={scenarioAllocation} />
        ) : null}

        {step === 9 && compareResults ? (
          <DemoStrategyCompare results={compareResults} />
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={back}
            disabled={step === 0}
            icon={<ChevronLeft className="size-3.5" />}
          >
            Back
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => void handlePrimary()}
            disabled={primaryBusy}
            icon={
              primaryBusy ? (
                <Spinner className="text-abyss" />
              ) : isLastStep ? (
                <PlayCircle className="size-3.5" />
              ) : (
                <ArrowRight className="size-3.5" />
              )
            }
          >
            {primaryBusy ? 'Working…' : current.cta}
          </Button>
        </div>
      </div>
    </div>
  )
}

function DemoBeforeAfter({
  normal,
  scenario,
}: {
  normal: AllocationResult | null
  scenario: AllocationResult
}) {
  if (!normal) return null
  const deltaSupplied =
    scenario.metrics.total_supplied_m3_per_day - normal.metrics.total_supplied_m3_per_day
  const deltaShortfalls =
    scenario.metrics.minimum_demand_shortfalls.length -
    normal.metrics.minimum_demand_shortfalls.length

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-hairline bg-raised/50 p-3 text-xs">
      <div>
        <p className="text-ink-subtle">Delivered, before → after</p>
        <p className="tabular mt-0.5 font-semibold text-ink">
          {formatVolume(normal.metrics.total_supplied_m3_per_day)} → {formatVolume(scenario.metrics.total_supplied_m3_per_day)} m³/day
        </p>
        <p className={clsx('tabular mt-0.5', deltaSupplied < 0 ? 'text-status-critical' : 'text-status-ok')}>
          {deltaSupplied < 0 ? '' : '+'}
          {formatVolume(deltaSupplied)} m³/day
        </p>
      </div>
      <div>
        <p className="text-ink-subtle">Facilities below minimum</p>
        <p className="tabular mt-0.5 font-semibold text-ink">
          {normal.metrics.minimum_demand_shortfalls.length} → {scenario.metrics.minimum_demand_shortfalls.length}
        </p>
        <p className={clsx('tabular mt-0.5', deltaShortfalls > 0 ? 'text-status-critical' : 'text-status-ok')}>
          {deltaShortfalls > 0 ? `+${deltaShortfalls} worse` : 'No change'}
        </p>
      </div>
    </div>
  )
}

function DemoStrategyCompare({
  results,
}: {
  results: { strategy: StrategyName; allocation: AllocationResult }[]
}) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {results.map(({ strategy, allocation }) => (
        <div
          key={strategy}
          className="rounded-lg border border-hairline bg-raised/50 p-3 text-xs"
        >
          <p className="font-semibold text-ink">{STRATEGY_LABELS[strategy]}</p>
          <p className="tabular mt-1 text-ink-muted">
            {formatPercent(allocation.metrics.demand_coverage_ratio)} coverage
          </p>
          <p className="tabular text-ink-subtle">
            {allocation.metrics.minimum_demand_shortfalls.length} below minimum
          </p>
        </div>
      ))}
    </div>
  )
}

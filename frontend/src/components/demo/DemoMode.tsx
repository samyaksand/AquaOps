import { clsx } from 'clsx'
import {
  ArrowRight,
  ChevronLeft,
  Droplets,
  MousePointerClick,
  PlayCircle,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button, IconButton } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/States'
import { useAllocation } from '@/hooks/useAllocation'
import { useDecisionAnalysis } from '@/hooks/useDecisionAnalysis'
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
  /** DOM id of the on-page section this step is about — scrolled into view
   * and briefly outlined on arrival, so the step's point is visible
   * somewhere other than this fixed card, not just implied by a status
   * change off-screen. */
  highlightId?: string
  /** When set, this step hands control to the real page instead of driving
   * itself: the floating card hides, the target element (by DOM id) is
   * scrolled into view and spotlighted with a small pointer callout next to
   * it, and the step advances itself the moment the viewer clicks that real
   * element — never both a demo-card button and a highlighted real button
   * asking for a click at the same time. */
  waitForClick?: { targetId: string; instruction: string }
  /** Extra safety net for `waitForClick` steps whose real action also
   * leaves a detectable trace in app state (e.g. an allocation existing).
   * If this ever returns true while still on this step, the step advances
   * even if the click listener itself somehow didn't fire — the result
   * already happened, so there's nothing left to wait for. */
  waitForClickFallback?: (state: {
    hasAllocation: boolean
    sidePanelOpen: boolean
  }) => boolean
  /** A step with no `cta`-driving action and no `waitForClick` just shows
   * the body text and scrolls to `highlightId`, then auto-advances after a
   * pause — used for "look here" beats that don't need a click at all. */
  autoAdvanceMs?: number
  /** When true, this step waits for the viewer to pick any scenario card
   * (detected as the scenario store's draft list going from empty to
   * non-empty) rather than a click on one specific, unpredictable element —
   * any of several cards is a valid choice, so there is no single id to
   * listen on the way waitForClick needs. The card hides the same way. */
  waitForScenarioChoice?: boolean
  /** Calls Decision Analysis's analyze() itself on arrival, instead of
   * waiting for a click on the page's own "Run Analysis" button. */
  autoRunAnalysis?: boolean
}

const STEPS: DemoStep[] = [
  {
    view: 'overview',
    title: 'Welcome to AquaOps',
    body: 'AquaOps helps a city decide how to share limited water between reservoirs, hospitals, schools, and neighborhoods - especially when something goes wrong. This is a simulated city, Rivertown.',
    cta: 'Start the walkthrough',
  },
  {
    view: 'network',
    title: 'This is Rivertown',
    body: 'Reservoirs and treatment plants supply water through pipelines to homes and critical facilities like hospitals. Right now the network is in its normal state - nothing has been decided yet.',
    cta: 'Show me around',
    highlightId: 'demo-network-map',
  },
  {
    view: 'network',
    title: 'Open the controls',
    body: 'Click the Controls button on the map to see the allocation strategy and every demand point’s priority.',
    cta: '',
    waitForClick: {
      targetId: 'demo-open-controls',
      instruction: 'Click "Controls" to open the panel',
    },
    waitForClickFallback: (state) => state.sidePanelOpen,
  },
  {
    view: 'network',
    title: 'Who needs water, and how urgently',
    body: 'Each demand point has a priority - critical facilities like hospitals rank above ordinary neighborhoods. Scroll through this list to see how Rivertown’s needs compare.',
    cta: 'Continue',
    highlightId: 'demo-demand-priorities',
    autoAdvanceMs: 3200,
  },
  {
    view: 'network',
    title: 'Run the allocation',
    body: 'Click "Run Allocation" to let the engine decide how today’s supply gets shared.',
    cta: '',
    waitForClick: {
      targetId: 'demo-run-allocation',
      instruction: 'Click "Run Allocation" to continue',
    },
    waitForClickFallback: (state) => state.hasAllocation,
  },
  {
    view: 'network',
    title: 'Reading the result',
    body: 'Green rings mean a facility is fully supplied; red rings mean it isn’t. Hover any node for its numbers, or click it for full detail.',
    cta: 'Introduce a disruption',
    highlightId: 'demo-network-map',
  },
  {
    view: 'scenarios',
    title: 'Choose a disruption',
    body: 'Droughts happen. Pick any scenario card below - try "Reduce reservoir supply" to see what a drought does to the city.',
    cta: '',
    highlightId: 'demo-choose-scenario',
    waitForScenarioChoice: true,
  },
  {
    view: 'scenarios',
    title: 'Configure, then reallocate',
    body: 'Your change is set up here. Adjust it if you like - which asset, how much - or leave it as is, then click "Reallocate" to run the engine against the reduced supply.',
    cta: '',
    highlightId: 'demo-configure-run',
    waitForClick: {
      targetId: 'demo-reallocate',
      instruction: 'Click "Reallocate" to continue',
    },
  },
  {
    view: 'scenarios',
    title: 'See it on the map',
    body: 'The reallocation just ran against the disrupted network. Click "View Network Map" to see exactly which pipelines and demand points were affected.',
    cta: '',
    highlightId: 'demo-configure-run',
    waitForClick: {
      targetId: 'demo-view-updated-map',
      instruction: 'Click "View Network Map" to continue',
    },
  },
  {
    view: 'scenarios',
    title: 'Before vs. after',
    body: 'The comparison below shows exactly what changed: how much less was delivered, and how many facilities dropped below their minimum.',
    cta: 'Compare strategies',
    highlightId: 'demo-scenario-impact',
  },
  {
    view: 'network',
    title: 'Strategies decide differently',
    body: 'We’ll run the same normal network under two different strategies and compare them side by side, right here, so you can see they don’t agree on the best answer.',
    cta: 'Run strategy comparison',
  },
  {
    view: 'network',
    title: 'No single right answer',
    body: 'Here’s what each strategy produced. Different strategies trade off population reach against critical-facility coverage differently - that trade-off is the whole point of Decision Analysis.',
    cta: 'Open Decision Analysis',
  },
  {
    view: 'decision',
    title: 'Explore every trade-off',
    body: 'This is the Pareto frontier - every point is a real allocation the engine produced, and the highlighted ones can’t be improved on one measure without giving up another. Click any point to inspect it, or compare two side by side.',
    cta: 'Finish',
    /** This step auto-runs the analysis itself (see the effect below) rather
     * than waiting for a click on "Run Analysis" — by this point in the
     * walkthrough the viewer has already clicked three real buttons, and
     * the point of this step is the chart, not one more thing to click. */
    autoRunAnalysis: true,
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

export function DemoMode({ network: _network }: { network: NetworkState | null }) {
  const active = useDemoStore((state) => state.active)
  const step = useDemoStore((state) => state.step)
  const stop = useDemoStore((state) => state.stop)
  const next = useDemoStore((state) => state.next)
  const back = useDemoStore((state) => state.back)
  const setView = useAppStore((state) => state.setView)
  const sidePanelCollapsed = useAppStore((state) => state.sidePanelCollapsed)

  const { allocation, loading: allocating } = useAllocation()
  const clearChanges = useScenarioStore((state) => state.clearChanges)
  const scenarioReset = useScenarioStore((state) => state.reset)
  const draftsCount = useScenarioStore((state) => state.drafts.length)
  const { analysis, loading: analyzing, analyze } = useDecisionAnalysis()
  const {
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

  // Scroll the step's relevant on-page section into view and briefly
  // outline it — a step's action (apply, reallocate, run comparison) only
  // ever changes a status badge or a number in a section that may be well
  // off-screen below this fixed card; without this, nothing visible
  // happens from the viewer's actual vantage point. Runs after the view
  // switch above has had a tick to render the new page's DOM. Targets
  // either highlightId (a section to look at) or waitForClick's targetId
  // (a real control to click), whichever the step has.
  const targetId = current?.highlightId ?? current?.waitForClick?.targetId
  useEffect(() => {
    if (!active || !targetId) return
    const timer = window.setTimeout(() => {
      const el = document.getElementById(targetId)
      if (!el) return
      // The Controls panel is its own independently-scrollable container —
      // scrolling it to a target in an earlier step (e.g. the Run
      // Allocation button) leaves it scrolled part-way down even once a
      // later step stops pointing at anything inside it, so its own header
      // stays hidden behind the fold indefinitely. Reset it to the top
      // whenever this step's target isn't inside the panel itself.
      const decisionPanel = document.querySelector(
        '[aria-label="Decision panel"]',
      )
      if (decisionPanel && !decisionPanel.contains(el)) {
        decisionPanel.scrollTo({ top: 0, behavior: 'smooth' })
      }
      // 'nearest' rather than 'center': several targets (e.g. the Run
      // Allocation button) sit inside their own small, independently
      // scrollable panel — centering them scrolls that panel's own heading
      // out of view above the fold, leaving only mid-panel text visible
      // with no context. 'nearest' only scrolls as much as needed to bring
      // the target on screen, keeping the panel's own header visible.
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      el.classList.remove('demo-spotlight')
      // Force a reflow so re-triggering the animation on the same element
      // (e.g. revisiting the same id on the next step) restarts it.
      void el.offsetWidth
      el.classList.add('demo-spotlight')
    }, 150)
    return () => window.clearTimeout(timer)
  }, [active, step, targetId])

  // "Wait for a real click" steps hand control to the page: advance the
  // moment the viewer actually clicks the real target, rather than the demo
  // card driving the action itself. Listens on `document` in the capture
  // phase and matches via `closest()` instead of attaching directly to the
  // target node — attaching to the node itself was fragile: a stale node
  // reference (e.g. if the panel's open/close transition or an unrelated
  // re-render swaps the element) silently orphaned the listener, leaving
  // the "click this" pointer stuck on screen even after the real action had
  // already happened. Delegation survives all of that since it only looks
  // up the current node at click time, never holds onto one.
  useEffect(() => {
    const target = current?.waitForClick
    if (!active || !target) return
    const handleClick = (event: MouseEvent) => {
      const clicked = (event.target as Element | null)?.closest(
        `#${target.targetId}`,
      )
      if (clicked) next()
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, current])

  // Safety net for the click-delegation effect above: if the real action's
  // own result already exists in app state while still on this step, the
  // action plainly already happened — advance regardless of whether the
  // click event itself was somehow missed (e.g. a dev-server hot-reload
  // mid-click dropping a listener). Checked on every render rather than one
  // more timer, since the state it reads already drives re-renders itself.
  useEffect(() => {
    const fallback = current?.waitForClickFallback
    if (!active || !fallback) return
    if (fallback({ hasAllocation: !!allocation, sidePanelOpen: !sidePanelCollapsed })) {
      next()
    }
  }, [active, step, current, allocation, sidePanelCollapsed, next])

  // Steps with no action and no click to wait for just show their point and
  // move on by themselves after a pause long enough to actually read it.
  useEffect(() => {
    if (!active || !current?.autoAdvanceMs) return
    const timer = window.setTimeout(() => next(), current.autoAdvanceMs)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, current])

  // "Choose a scenario" steps wait for the viewer to pick any card — any of
  // several is a valid choice, so this watches the scenario store's draft
  // list rather than listening for a click on one specific, unpredictable
  // element the way waitForClick does.
  useEffect(() => {
    if (!active || !current?.waitForScenarioChoice) return
    if (draftsCount > 0) next()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, current, draftsCount])

  // The Decision Analysis step runs analyze() itself — by this point the
  // viewer has already clicked three real buttons earlier in the
  // walkthrough, and this step is about the chart, not another click.
  useEffect(() => {
    if (!active || !current?.autoRunAnalysis || analysis) return
    void analyze()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step, current])

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

  if (!active) return null

  const handlePrimary = async () => {
    switch (step) {
      case 9: // Run strategy comparison
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

  const primaryBusy = allocating || applying || reallocating || comparing || analyzing
  const waitingForClick = current.waitForClick
  const waitingForChoice = current.waitForScenarioChoice

  // Only one "please interact with this" affordance should ever be on
  // screen at once — while a step waits for a real click (or a scenario
  // choice), the full card hides and a small pointer callout sits near the
  // target instead (positioned by the spotlight effect above, which
  // already scrolled that element into view).
  if (waitingForClick || waitingForChoice) {
    return (
      <div className="fixed bottom-5 left-1/2 z-50 flex items-center gap-2 rounded-full border border-aqua-500/40 bg-depth/98 py-2 pr-3 pl-2 shadow-2xl backdrop-blur">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-aqua-500/15 text-aqua-300">
          <MousePointerClick className="size-3.5" aria-hidden="true" />
        </span>
        <span className="text-[13px] font-medium text-ink">
          {waitingForClick?.instruction ?? 'Click any scenario card to continue'}
        </span>
        <IconButton label="Exit demo" onClick={stop} className="size-6">
          <X className="size-3" />
        </IconButton>
      </div>
    )
  }

  // The last step sits over the Pareto chart's own full-width panel if
  // centered the way every other step is — the chart is the entire point
  // of this step, so the card docks to the bottom-right corner instead
  // (over the mostly-empty "Selected decision" column) rather than
  // covering the one thing it's asking the viewer to look at.
  const dockBottomRight = current.view === 'decision'
  // "Before vs. after" opens straight into the full-viewport map overlay
  // (via its waitForClick on the previous step), so the whole point is to
  // let the viewer see the network map, not cover most of it with a
  // centered card. Docking small, to the right edge, keeps the map visible.
  const dockRight = step === 9
  // "Reading the result" lands right after the Controls panel was opened
  // and used for the previous two steps — bottom-centered, the card
  // overlaps that panel's own lower content (which is still open and still
  // showing the just-computed allocation result). Docking to the
  // bottom-left instead keeps clear of the panel, which always opens from
  // the right.
  const dockBottomLeft = step === 5

  return (
    <div
      className={clsx(
        'fixed z-50',
        dockRight
          ? 'top-1/2 right-5 w-[min(300px,calc(100vw-2.5rem))] -translate-y-1/2'
          : dockBottomRight
            ? 'right-5 bottom-5 w-[min(380px,calc(100vw-2.5rem))]'
            : dockBottomLeft
              ? 'bottom-5 left-5 w-[min(500px,calc(100vw-2.5rem))]'
              : 'bottom-5 left-1/2 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2',
      )}
    >
      <div
        className={clsx(
          'rounded-2xl border border-aqua-500/30 bg-depth/98 shadow-2xl',
          dockRight ? 'p-3' : 'p-4',
        )}
      >
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
          {current.body}
        </p>

        {step === 9 && scenarioAllocation ? (
          <DemoBeforeAfter normal={allocation} scenario={scenarioAllocation} />
        ) : null}

        {step === 10 && compareResults ? (
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

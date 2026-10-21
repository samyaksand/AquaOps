import { AnimatePresence, motion } from 'framer-motion'
import {
  FlaskConical,
  GitCompareArrows,
  Pencil,
  RotateCcw,
  ScatterChart,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { useScenario } from '@/hooks/useScenario'
import { buildNameIndex, describeScenarioChange } from '@/lib/labels'
import { defaultChange, largestTargetFor } from '@/lib/scenarioBuilder'
import { useAppStore } from '@/store/useAppStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import type {
  AllocationResult,
  NetworkState,
  ScenarioChangeType,
} from '@/types/network'

import { ScenarioBuilderStep } from './ScenarioBuilderStep'
import { ScenarioComparison } from './ScenarioComparison'
import { ScenarioImpactCard } from './ScenarioImpactCard'
import { ScenarioLibrary } from './ScenarioLibrary'
import { ScenarioMapOverlay } from './ScenarioMapOverlay'

// The full-viewport map overlay's whole point is to show the entire
// updated network, not a dimmed diff focused on just the changed assets,
// so it's always passed an empty highlight set.
const EMPTY_HIGHLIGHT = new Set<string>()

interface ScenarioLabViewProps {
  network: NetworkState | null
  normalAllocation: AllocationResult | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onOpenDecisionAnalysis: () => void
}

/**
 * The Scenario Lab — the centerpiece of scenario exploration, replacing the
 * old map+drawer split for this nav view with a full-width page: a
 * lightweight Pareto entry point up top, then choose a scenario, name and
 * configure it, run it, see its impact, compare it with a past run. The
 * network map is not a permanently-docked panel here — it gets the full
 * viewport on demand via "View Network Map" so the Scenario Lab's own
 * workflow keeps the page width. Network/Overview keep the map-first layout
 * untouched.
 */
export function ScenarioLabView({
  network,
  normalAllocation,
  loading,
  error,
  onRetry,
  onOpenDecisionAnalysis,
}: ScenarioLabViewProps) {
  const strategy = useAppStore((state) => state.strategy)
  const setStrategy = useAppStore((state) => state.setStrategy)

  const drafts = useScenarioStore((state) => state.drafts)
  const addChange = useScenarioStore((state) => state.addChange)
  const updateChange = useScenarioStore((state) => state.updateChange)
  const removeChange = useScenarioStore((state) => state.removeChange)
  const scenarioNetwork = useScenarioStore((state) => state.network)
  const scenarioMode = useScenarioStore((state) => state.mode)
  const allocatedDrafts = useScenarioStore((state) => state.allocatedDrafts)

  const {
    mode,
    name: scenarioName,
    setName: setScenarioName,
    allocation,
    reallocating,
    reallocateError,
    history,
    reallocate,
    reset,
  } = useScenario()

  const [selectedType, setSelectedType] = useState<ScenarioChangeType | null>(
    null,
  )
  const [mapOpen, setMapOpen] = useState(false)

  const names = useMemo(() => buildNameIndex(network), [network])

  const handleSelectScenario = (type: ScenarioChangeType) => {
    setSelectedType(type)
    const target = largestTargetFor(type, network, names)
    if (!target) return
    addChange(defaultChange(type, target.value))
  }

  const changeSummary = useMemo(
    () =>
      drafts.length > 0
        ? drafts.map((d) => describeScenarioChange(d.change, names)).join(' · ')
        : null,
    [drafts, names],
  )

  // Compares live drafts against the snapshot taken at the last successful
  // Reallocate — only the `change` payload matters (not the draft's local
  // `id`, which is irrelevant to what was actually sent to the backend).
  const configChangedSinceRun = useMemo(() => {
    if (allocatedDrafts === null) return false
    if (drafts.length !== allocatedDrafts.length) return true
    return drafts.some(
      (d, i) =>
        JSON.stringify(d.change) !== JSON.stringify(allocatedDrafts[i]?.change),
    )
  }, [drafts, allocatedDrafts])

  const showingScenario = scenarioMode === 'scenario'
  const displayedNetwork = showingScenario ? scenarioNetwork ?? network : network
  const displayedAllocation = showingScenario ? allocation ?? normalAllocation : normalAllocation

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <LabHeader mode={mode} onReset={reset} />

      <ParetoTeaser onOpen={onOpenDecisionAnalysis} active={showingScenario} />

      <div className="space-y-3">
        <Panel id="demo-choose-scenario">
          <PanelHeader
            title="Choose a scenario"
            subtitle="Pick a disruption to explore - every type stays selectable"
            icon={<FlaskConical className="size-4" />}
          />
          <PanelBody>
            <ScenarioLibrary
              network={network}
              selectedType={selectedType}
              onSelect={handleSelectScenario}
            />
          </PanelBody>
        </Panel>

        <AnimatePresence>
          {drafts.length > 0 ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Panel id="demo-configure-run">
                <PanelHeader
                  title="Name, configure & run"
                  subtitle="Name the scenario, tune each change, then reallocate"
                  icon={<Pencil className="size-4" />}
                />
                <PanelBody>
                  <ScenarioBuilderStep
                    network={network}
                    names={names}
                    drafts={drafts}
                    scenarioName={scenarioName}
                    onScenarioNameChange={setScenarioName}
                    strategy={strategy}
                    onStrategyChange={setStrategy}
                    onChangeDraft={updateChange}
                    onRemoveDraft={removeChange}
                    reallocating={reallocating}
                    reallocateError={reallocateError}
                    onReallocate={() => void reallocate(strategy)}
                    configChangedSinceRun={configChangedSinceRun}
                    onOpenMap={() => setMapOpen(true)}
                    hasReallocated={allocation !== null}
                  />
                </PanelBody>
              </Panel>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <Panel id="demo-scenario-impact">
          <PanelHeader
            title="Scenario impact"
            subtitle="What changed, compared to the normal network"
            icon={<GitCompareArrows className="size-4" />}
          />
          <PanelBody>
            <ScenarioImpactCard
              normal={normalAllocation}
              scenario={allocation}
              drafts={drafts}
              names={names}
            />
          </PanelBody>
        </Panel>

        <Panel id="demo-compare-scenarios">
          <PanelHeader
            title="Compare scenarios"
            subtitle="See what's different between two runs you've tried"
            icon={<ScatterChart className="size-4" />}
          />
          <PanelBody>
            <ScenarioComparison history={history} />
          </PanelBody>
        </Panel>
      </div>

      <ScenarioMapOverlay
        open={mapOpen}
        onClose={() => setMapOpen(false)}
        network={displayedNetwork}
        loading={loading}
        error={error}
        onRetry={onRetry}
        allocation={displayedAllocation}
        showingScenario={showingScenario}
        highlightCodes={EMPTY_HIGHLIGHT}
        scenarioName={scenarioName}
        changeSummary={changeSummary}
      />
    </div>
  )
}

function LabHeader({
  mode,
  onReset,
}: {
  mode: 'normal' | 'scenario'
  onReset: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface px-5 py-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold text-ink">Scenario Lab</h1>
          {mode === 'scenario' ? (
            <Badge tone="warn">Scenario active</Badge>
          ) : (
            <Badge tone="ok">Normal network</Badge>
          )}
        </div>
        <p className="mt-0.5 text-xs text-ink-subtle">
          Choose → Configure → Name → Run → Impact → View Map → Compare → Try another
        </p>
      </div>
      {mode === 'scenario' ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onReset}
          icon={<RotateCcw className="size-3.5" />}
        >
          Reset
        </Button>
      ) : null}
    </div>
  )
}

function ParetoTeaser({
  onOpen,
  active,
}: {
  onOpen: () => void
  active: boolean
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center justify-between gap-3 rounded-2xl border border-aqua-500/25 bg-aqua-500/[0.05] px-4 py-3 text-left transition-colors hover:bg-aqua-500/[0.09]"
    >
      <div className="flex items-center gap-2.5">
        <ScatterChart className="size-4 text-aqua-400" aria-hidden="true" />
        <div>
          <p className="text-[13px] font-semibold text-ink">
            Compare every option's trade-offs
          </p>
          <p className="hidden text-[11px] text-ink-subtle sm:block">
            Improving one outcome (like coverage) can cost another (like
            efficiency) -{' '}
            {active
              ? 'see the options for this scenario'
              : 'see the options for the normal network'}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-xs font-medium text-aqua-300">Open →</span>
    </button>
  )
}

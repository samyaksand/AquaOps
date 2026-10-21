import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Map, PlayCircle, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

import { Button, IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/States'
import { describeScenarioChange } from '@/lib/labels'
import { formatPercent } from '@/lib/format'
import { targetsFor } from '@/lib/scenarioBuilder'
import {
  STRATEGY_LABELS,
  type NetworkState,
  type ScenarioChangeIn,
  type StrategyName,
} from '@/types/network'
import type { DraftChange } from '@/store/useScenarioStore'

interface ScenarioBuilderStepProps {
  network: NetworkState | null
  names: Record<string, string>
  drafts: DraftChange[]
  scenarioName: string
  onScenarioNameChange: (name: string) => void
  strategy: StrategyName
  onStrategyChange: (strategy: StrategyName) => void
  onChangeDraft: (id: number, change: ScenarioChangeIn) => void
  onRemoveDraft: (id: number) => void
  reallocating: boolean
  reallocateError: string | null
  onReallocate: () => void
  /** True once a Reallocate has run and the drafts have changed since —
   * the displayed Scenario impact/Compare panels still reflect the OLD
   * configuration until Reallocate runs again. */
  configChangedSinceRun?: boolean
  /** Opens the full-viewport map (reused from ScenarioMapOverlay, not a
   * second implementation) — only meaningful once a reallocation has
   * actually produced a result to show, so this stays hidden until then. */
  onOpenMap: () => void
  hasReallocated: boolean
}

/**
 * "Configure, then run" — the middle of the Choose → Simulate → See impact
 * flow. Each added change gets one row to tune (target + magnitude);
 * Reallocate applies the change and runs the allocation engine over it in
 * one call — there's no separate preview-only step, since Reallocate is the
 * same request plus the real result, with no extra cost to the user for
 * skipping straight to it. Pure presentation over `useScenario()` /
 * `useScenarioStore()` — the caller (ScenarioLabView) owns all the actual
 * state.
 */
export function ScenarioBuilderStep({
  network,
  names,
  drafts,
  scenarioName,
  onScenarioNameChange,
  strategy,
  onStrategyChange,
  onChangeDraft,
  onRemoveDraft,
  reallocating,
  reallocateError,
  onReallocate,
  configChangedSinceRun = false,
  onOpenMap,
  hasReallocated,
}: ScenarioBuilderStepProps) {
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-xl border border-hairline bg-raised/30 p-2.5">
        <span className="shrink-0 text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
          Scenario name
        </span>
        <input
          type="text"
          value={scenarioName}
          onChange={(event) => onScenarioNameChange(event.target.value)}
          placeholder="East Basin drought test"
          className="flex-1 rounded-lg bg-raised px-2.5 py-1.5 text-sm text-ink ring-1 ring-inset ring-divider transition-colors placeholder:text-ink-subtle hover:ring-ink-subtle/40 focus:ring-aqua-500 focus:outline-none"
        />
      </label>

      {drafts.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline px-3 py-4 text-center text-[12px] text-ink-subtle">
          Pick a scenario above to start configuring it
        </p>
      ) : (
        <AnimatePresence initial={false}>
          <ul className="space-y-2">
            {drafts.map((draft) => (
              <motion.li
                key={draft.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
              >
                <DraftRow
                  draft={draft.change}
                  network={network}
                  names={names}
                  onChange={(change) => onChangeDraft(draft.id, change)}
                  onRemove={() => onRemoveDraft(draft.id)}
                />
              </motion.li>
            ))}
          </ul>
        </AnimatePresence>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-hairline bg-raised/30 p-2.5">
        <label className="shrink-0 text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
          Strategy
        </label>
        <Select
          aria-label="Allocation strategy"
          className="flex-1"
          value={strategy}
          options={Object.entries(STRATEGY_LABELS).map(([value, label]) => ({
            value,
            label,
          }))}
          onChange={(event) => onStrategyChange(event.target.value as StrategyName)}
        />
      </div>

      {configChangedSinceRun ? (
        <p className="flex items-center gap-1.5 rounded-lg border border-status-warn/30 bg-status-warn/10 px-2.5 py-1.5 text-[11px] text-status-warn">
          <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
          Configuration changed since the last Reallocate - results below are
          from the previous configuration.
        </p>
      ) : null}

      <div className={hasReallocated ? 'grid grid-cols-[1fr_auto] gap-2' : undefined}>
        <Button
          id="demo-reallocate"
          variant="primary"
          className="w-full"
          disabled={drafts.length === 0 || reallocating}
          onClick={onReallocate}
          icon={
            reallocating ? (
              <Spinner className="text-abyss" />
            ) : (
              <PlayCircle className="size-4" />
            )
          }
          title="Apply this change and run the allocation engine over the result"
        >
          {reallocating ? 'Reallocating…' : 'Reallocate'}
        </Button>
        {hasReallocated ? (
          <Button
            id="demo-view-updated-map"
            variant="primary"
            onClick={onOpenMap}
            icon={<Map className="size-4" />}
            title="See the network map updated with this reallocation's result"
          >
            View Network Map
          </Button>
        ) : null}
      </div>

      {reallocateError ? <ErrorBanner message={reallocateError} /> : null}
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-status-critical/10 px-2.5 py-2 text-xs text-status-critical">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

function DraftRow({
  draft,
  network,
  names,
  onChange,
  onRemove,
}: {
  draft: ScenarioChangeIn
  network: NetworkState | null
  names: Record<string, string>
  onChange: (change: ScenarioChangeIn) => void
  onRemove: () => void
}) {
  const targets = useMemo(
    () => targetsFor(draft.type, network, names),
    [draft.type, network, names],
  )

  const hasFraction = 'fraction' in draft
  const hasFactor = 'factor' in draft

  return (
    <div className="space-y-1.5 rounded-xl border border-hairline bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-ink">
          {describeScenarioChange(draft, names)}
        </span>
        <IconButton label="Remove change" onClick={onRemove} className="size-6">
          <Trash2 className="size-3.5" />
        </IconButton>
      </div>

      <Select
        aria-label="Target"
        value={draft.target_code}
        options={targets}
        onChange={(event) =>
          onChange({ ...draft, target_code: event.target.value } as ScenarioChangeIn)
        }
      />

      {hasFraction ? (
        <label className="flex items-center gap-2 text-[11px] text-ink-subtle">
          Reduce by
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={(draft as { fraction: number }).fraction}
            onChange={(event) =>
              onChange({
                ...draft,
                fraction: Number(event.target.value),
              } as ScenarioChangeIn)
            }
            className="flex-1 accent-aqua-500"
          />
          <span className="tabular w-10 text-right text-ink-muted">
            {formatPercent((draft as { fraction: number }).fraction)}
          </span>
        </label>
      ) : null}

      {hasFactor ? (
        <label className="flex items-center gap-2 text-[11px] text-ink-subtle">
          Scale to
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={(draft as { factor: number }).factor}
            onChange={(event) =>
              onChange({
                ...draft,
                factor: Number(event.target.value),
              } as ScenarioChangeIn)
            }
            className="flex-1 accent-aqua-500"
          />
          <span className="tabular w-10 text-right text-ink-muted">
            {formatPercent((draft as { factor: number }).factor)}
          </span>
        </label>
      ) : null}
    </div>
  )
}

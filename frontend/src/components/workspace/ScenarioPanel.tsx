import { clsx } from 'clsx'
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  PlayCircle,
  Plus,
  RotateCcw,
  Trash2,
  Waves,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { Panel, PanelBody, PanelHeader } from '@/components/ui/Card'
import { Metric } from '@/components/ui/Metric'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/States'
import { useScenario } from '@/hooks/useScenario'
import { formatPercent, formatVolume } from '@/lib/format'
import { useAppStore } from '@/store/useAppStore'
import { useScenarioStore } from '@/store/useScenarioStore'
import {
  SCENARIO_CHANGE_LABELS,
  SCENARIO_CHANGE_TARGET_KIND,
  STRATEGY_LABELS,
  type NetworkState,
  type ScenarioChangeIn,
  type ScenarioChangeType,
  type StrategyName,
} from '@/types/network'

const CHANGE_TYPES = Object.keys(SCENARIO_CHANGE_LABELS) as ScenarioChangeType[]

/** Default parameters for a freshly selected change type. */
function defaultChange(
  type: ScenarioChangeType,
  targetCode: string,
): ScenarioChangeIn {
  switch (type) {
    case 'reduce_reservoir_supply':
      return { type, target_code: targetCode, fraction: 0.3 }
    case 'reduce_treatment_capacity':
      return { type, target_code: targetCode, fraction: 0.3 }
    case 'reduce_pipeline_capacity':
      return { type, target_code: targetCode, fraction: 0.3 }
    case 'set_pipeline_unavailable':
      return { type, target_code: targetCode }
    case 'change_zone_demand':
      return { type, target_code: targetCode, factor: 1.25 }
    case 'change_facility_demand':
      return { type, target_code: targetCode, factor: 1.25 }
    case 'set_tanker_unavailable':
      return { type, target_code: targetCode }
  }
}

/** Target codes available for a change type, drawn from the live network. */
function targetsFor(
  type: ScenarioChangeType,
  network: NetworkState | null,
): { value: string; label: string }[] {
  if (!network) return []
  const kind = SCENARIO_CHANGE_TARGET_KIND[type]
  switch (kind) {
    case 'source':
      return network.sources.map((s) => ({ value: s.code, label: s.name }))
    case 'transit':
      return network.transits.map((t) => ({ value: t.code, label: t.name }))
    case 'link':
      return network.links.map((l) => ({
        value: l.code,
        label: `${l.source_code} → ${l.target_code}`,
      }))
    case 'zone':
      return network.demands
        .filter((d) => d.kind === 'zone')
        .map((d) => ({ value: d.code, label: d.name }))
    case 'facility':
      return network.demands
        .filter((d) => d.kind === 'facility')
        .map((d) => ({ value: d.code, label: d.name }))
    case 'tanker':
      return network.tankers.map((t) => ({ value: t.code, label: t.name }))
  }
}

function describeChange(change: ScenarioChangeIn): string {
  switch (change.type) {
    case 'reduce_reservoir_supply':
      return `Cut supply at ${change.target_code} by ${formatPercent(change.fraction)}`
    case 'reduce_treatment_capacity':
      return `Cut capacity at ${change.target_code} by ${formatPercent(change.fraction)}`
    case 'reduce_pipeline_capacity':
      return `Cut pipeline ${change.target_code} capacity by ${formatPercent(change.fraction)}`
    case 'set_pipeline_unavailable':
      return `Take pipeline ${change.target_code} offline`
    case 'change_zone_demand':
      return `Scale zone ${change.target_code} demand to ${formatPercent(change.factor)}`
    case 'change_facility_demand':
      return `Scale facility ${change.target_code} demand to ${formatPercent(change.factor)}`
    case 'set_tanker_unavailable':
      return `Take tanker ${change.target_code} out of service`
  }
}

export function ScenarioPanel({ network }: { network: NetworkState | null }) {
  const strategy = useAppStore((state) => state.strategy)
  const setStrategy = useAppStore((state) => state.setStrategy)

  const drafts = useScenarioStore((state) => state.drafts)
  const scenarioName = useScenarioStore((state) => state.name)
  const setName = useScenarioStore((state) => state.setName)
  const addChange = useScenarioStore((state) => state.addChange)
  const updateChange = useScenarioStore((state) => state.updateChange)
  const removeChange = useScenarioStore((state) => state.removeChange)

  const {
    mode,
    summary,
    allocation,
    applying,
    applyError,
    reallocating,
    reallocateError,
    apply,
    reallocate,
    reset,
  } = useScenario()

  const [builderType, setBuilderType] = useState<ScenarioChangeType>(
    'reduce_reservoir_supply',
  )

  const targets = useMemo(
    () => targetsFor(builderType, network),
    [builderType, network],
  )

  const handleAdd = () => {
    const target = targets[0]?.value
    if (!target) return
    addChange(defaultChange(builderType, target))
  }

  // Pending edits (drafts) invalidate whatever was last applied — Apply and
  // Reallocate always act on the current draft list, so a stale "applied"
  // badge next to unapplied edits would be misleading.
  const hasUnappliedEdits = mode === 'scenario' && drafts.length > 0
  const isScenarioLive = mode === 'scenario'

  return (
    <aside
      aria-label="Scenario panel"
      className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto xl:w-80"
    >
      <StateBanner mode={mode} onReset={reset} />

      <Panel>
        <PanelHeader
          title="1 · Build scenario"
          subtitle="Describe what changes"
          icon={<FlaskConical className="size-4" />}
        />
        <PanelBody className="space-y-3">
          <div>
            <label className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
              Scenario name
            </label>
            <input
              value={scenarioName}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-lg bg-raised px-3 py-2 text-sm text-ink ring-1 ring-inset ring-divider focus:ring-aqua-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Select
              aria-label="Change type"
              className="flex-1"
              value={builderType}
              options={CHANGE_TYPES.map((value) => ({
                value,
                label: SCENARIO_CHANGE_LABELS[value],
              }))}
              onChange={(event) =>
                setBuilderType(event.target.value as ScenarioChangeType)
              }
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={targets.length === 0}
              icon={<Plus className="size-3.5" />}
            >
              Add
            </Button>
          </div>
          {targets.length === 0 ? (
            <p className="text-[11px] text-ink-subtle">
              No eligible targets for this change in the current network.
            </p>
          ) : null}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
                Pending changes
              </span>
              {drafts.length > 0 ? (
                <span className="tabular text-[11px] text-ink-subtle">
                  {drafts.length}
                </span>
              ) : null}
            </div>
            {drafts.length > 0 ? (
              <ul className="space-y-2">
                {drafts.map((draft) => (
                  <DraftRow
                    key={draft.id}
                    draft={draft.change}
                    network={network}
                    onChange={(change) => updateChange(draft.id, change)}
                    onRemove={() => removeChange(draft.id)}
                  />
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-hairline px-2.5 py-3 text-center text-[11px] text-ink-subtle">
                Add a change above to start a scenario
              </p>
            )}
          </div>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="2 · Run"
          subtitle="Apply, then reallocate under a strategy"
          icon={<PlayCircle className="size-4" />}
        />
        <PanelBody className="space-y-3">
          <div className="flex items-center gap-2">
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
              onChange={(event) =>
                setStrategy(event.target.value as StrategyName)
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              disabled={drafts.length === 0 || applying}
              onClick={() => void apply()}
              icon={applying ? <Spinner /> : <Waves className="size-4" />}
              title="Preview the disrupted network without allocating"
            >
              {applying ? 'Applying…' : 'Apply'}
            </Button>
            <Button
              variant="primary"
              disabled={drafts.length === 0 || reallocating}
              onClick={() => void reallocate(strategy)}
              icon={
                reallocating ? (
                  <Spinner className="text-abyss" />
                ) : (
                  <PlayCircle className="size-4" />
                )
              }
              title="Apply and run the allocation engine over the result"
            >
              {reallocating ? 'Reallocating…' : 'Reallocate'}
            </Button>
          </div>
          {drafts.length === 0 ? (
            <p className="text-center text-[11px] text-ink-subtle">
              Add at least one change first
            </p>
          ) : null}

          {applyError ? <ErrorBanner message={applyError} /> : null}
          {reallocateError ? <ErrorBanner message={reallocateError} /> : null}
        </PanelBody>
      </Panel>

      {isScenarioLive && summary ? (
        <Panel>
          <PanelHeader
            title="3 · Result"
            subtitle={
              hasUnappliedEdits
                ? 'Edited since last run — reallocate to refresh'
                : allocation
                  ? 'Reallocated under the scenario'
                  : 'Applied — not yet reallocated'
            }
            icon={
              allocation && !hasUnappliedEdits ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <FlaskConical className="size-4" />
              )
            }
          />
          <PanelBody className="space-y-2.5">
            {summary.changes.length > 0 ? (
              <ul className="space-y-1 text-[11px] text-ink-muted">
                {summary.changes.map((line, index) => (
                  <li key={index} className="truncate">
                    • {line}
                  </li>
                ))}
              </ul>
            ) : null}
            {allocation ? (
              <div
                className={clsx(
                  'grid grid-cols-2 gap-x-3 gap-y-2 rounded-md border p-2.5',
                  hasUnappliedEdits
                    ? 'border-hairline opacity-50'
                    : 'border-hairline bg-raised/50',
                )}
              >
                <Metric
                  label="Allocated"
                  value={formatVolume(allocation.metrics.total_supplied_m3_per_day)}
                  unit="m³/day"
                  tone="ok"
                />
                <Metric
                  label="Unmet"
                  value={formatVolume(allocation.metrics.total_unmet_m3_per_day)}
                  unit="m³/day"
                  tone={
                    allocation.metrics.total_unmet_m3_per_day > 0
                      ? 'critical'
                      : 'ok'
                  }
                />
              </div>
            ) : null}
          </PanelBody>
        </Panel>
      ) : null}
    </aside>
  )
}

function StateBanner({
  mode,
  onReset,
}: {
  mode: 'normal' | 'scenario'
  onReset: () => void
}) {
  if (mode === 'normal') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-hairline bg-raised/40 px-3 py-2">
        <Badge tone="ok">Normal</Badge>
        <span className="text-[11px] text-ink-subtle">
          Map and metrics reflect the live network
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-status-warn/30 bg-status-warn/10 px-3 py-2">
      <div className="flex items-center gap-2">
        <Badge tone="warn">Scenario</Badge>
        <span className="text-[11px] text-ink-muted">
          Map and metrics show the simulated network
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={onReset}
        icon={<RotateCcw className="size-3.5" />}
      >
        Reset
      </Button>
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
  onChange,
  onRemove,
}: {
  draft: ScenarioChangeIn
  network: NetworkState | null
  onChange: (change: ScenarioChangeIn) => void
  onRemove: () => void
}) {
  const targets = useMemo(
    () => targetsFor(draft.type, network),
    [draft.type, network],
  )

  const hasFraction = 'fraction' in draft
  const hasFactor = 'factor' in draft

  return (
    <li className="space-y-1.5 rounded-md border border-hairline p-2.5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-ink">
          {SCENARIO_CHANGE_LABELS[draft.type]}
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

      <p className="text-[11px] text-ink-subtle">{describeChange(draft)}</p>
    </li>
  )
}

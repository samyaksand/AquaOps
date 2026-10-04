import { motion } from 'framer-motion'
import { ArrowRight, History, Scale, TrendingDown, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Select } from '@/components/ui/Select'
import { EmptyState, Spinner } from '@/components/ui/States'
import { scoreAllocation } from '@/lib/api'
import { formatPercent, formatVolume } from '@/lib/format'
import type { ScenarioRun } from '@/store/useScenarioStore'
import type { ObjectiveScores, ScenarioIn, StrategyName } from '@/types/network'

interface ScenarioComparisonProps {
  history: ScenarioRun[]
}

/**
 * "Compare scenarios" — pick two completed runs from this session's history
 * and see what's actually different between them. Delivered supply, unmet
 * demand, and coverage come straight from each run's own `AllocationResult`;
 * critical-facility coverage isn't in `AllocationMetrics`, so it's fetched
 * once per selected run via the existing `/decision/score` endpoint (the
 * same objective scoring Decision Analysis uses) rather than estimated.
 */
export function ScenarioComparison({ history }: ScenarioComparisonProps) {
  const [aId, setAId] = useState<string | null>(null)
  const [bId, setBId] = useState<string | null>(null)

  // Defaults the two pickers to the two most recent runs — but only as long
  // as the user hasn't picked something themselves, and re-derived (not a
  // one-time initializer) so a history that grows from 0/1 to 2+ runs after
  // mount still gets a sensible default instead of staying stuck on null.
  const effectiveAId = aId ?? history[1]?.id ?? null
  const effectiveBId = bId ?? history[0]?.id ?? null

  const a = history.find((r) => r.id === effectiveAId) ?? null
  const b = history.find((r) => r.id === effectiveBId) ?? null

  if (history.length < 2) {
    return (
      <EmptyState
        icon={<History className="size-4" />}
        title="Run at least two scenarios to compare"
        description="Reallocate a second scenario and it will appear here alongside the first."
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <RunPicker
          label="Scenario A"
          history={history}
          value={effectiveAId}
          onChange={setAId}
        />
        <ArrowRight className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        <RunPicker
          label="Scenario B"
          history={history}
          value={effectiveBId}
          onChange={setBId}
        />
      </div>

      {a && b ? <RunDiff key={`${a.id}:${b.id}`} a={a} b={b} /> : null}
    </div>
  )
}

function RunPicker({
  label,
  history,
  value,
  onChange,
}: {
  label: string
  history: ScenarioRun[]
  value: string | null
  onChange: (id: string) => void
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <span className="shrink-0 text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
        {label}
      </span>
      <Select
        aria-label={label}
        className="flex-1"
        value={value ?? ''}
        options={history.map((run) => ({
          value: run.id,
          label: `${run.name} — ${new Date(run.createdAt).toLocaleTimeString()}`,
        }))}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/** Keyed by `${a.id}:${b.id}` in the parent so a new pair mounts fresh —
 * scores reset via initial state rather than a synchronous setState at the
 * top of the effect. */
function RunDiff({ a, b }: { a: ScenarioRun; b: ScenarioRun }) {
  const [scoreA, setScoreA] = useState<ObjectiveScores | null>(null)
  const [scoreB, setScoreB] = useState<ObjectiveScores | null>(null)
  const [loadingScores, setLoadingScores] = useState(true)

  useEffect(() => {
    let cancelled = false
    const scenarioFor = (run: ScenarioRun): ScenarioIn => ({
      name: run.name,
      description: '',
      changes: run.drafts.map((d) => d.change),
    })
    Promise.all([
      scoreAllocation(a.allocation.strategy as StrategyName, scenarioFor(a)),
      scoreAllocation(b.allocation.strategy as StrategyName, scenarioFor(b)),
    ])
      .then(([sa, sb]) => {
        if (cancelled) return
        setScoreA(sa)
        setScoreB(sb)
      })
      .catch(() => {
        // Best-effort only — the table still shows the allocation-metric
        // rows even if critical-coverage scoring fails for either run.
      })
      .finally(() => {
        if (!cancelled) setLoadingScores(false)
      })
    return () => {
      cancelled = true
    }
  }, [a, b])

  const rows: {
    label: string
    a: string
    b: string
    delta: number | null
    invert?: boolean
  }[] = [
    {
      label: 'Delivered supply',
      a: `${formatVolume(a.allocation.metrics.total_supplied_m3_per_day)} m³/d`,
      b: `${formatVolume(b.allocation.metrics.total_supplied_m3_per_day)} m³/d`,
      delta:
        b.allocation.metrics.total_supplied_m3_per_day -
        a.allocation.metrics.total_supplied_m3_per_day,
    },
    {
      label: 'Unmet demand',
      a: `${formatVolume(a.allocation.metrics.total_unmet_m3_per_day)} m³/d`,
      b: `${formatVolume(b.allocation.metrics.total_unmet_m3_per_day)} m³/d`,
      delta:
        b.allocation.metrics.total_unmet_m3_per_day -
        a.allocation.metrics.total_unmet_m3_per_day,
      invert: true,
    },
    {
      label: 'Coverage',
      a: formatPercent(a.allocation.metrics.demand_coverage_ratio),
      b: formatPercent(b.allocation.metrics.demand_coverage_ratio),
      delta:
        b.allocation.metrics.demand_coverage_ratio -
        a.allocation.metrics.demand_coverage_ratio,
    },
  ]

  if (scoreA && scoreB) {
    rows.push({
      label: 'Critical coverage',
      a: formatPercent(scoreA.critical_coverage),
      b: formatPercent(scoreB.critical_coverage),
      delta: scoreB.critical_coverage - scoreA.critical_coverage,
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="overflow-hidden rounded-2xl border border-hairline"
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline bg-raised/40 text-[11px] text-ink-subtle uppercase">
            <th className="px-3 py-2 text-left font-medium">Metric</th>
            <th className="px-3 py-2 text-right font-medium">{a.name}</th>
            <th className="px-3 py-2 text-right font-medium">{b.name}</th>
            <th className="px-3 py-2 text-right font-medium">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const worse =
              row.delta !== null &&
              row.delta !== 0 &&
              (row.invert ? row.delta > 0 : row.delta < 0)
            const better =
              row.delta !== null &&
              row.delta !== 0 &&
              (row.invert ? row.delta < 0 : row.delta > 0)
            const tone = worse
              ? 'text-status-critical'
              : better
                ? 'text-status-ok'
                : 'text-ink-subtle'
            return (
              <tr key={row.label} className="border-b border-hairline/60 last:border-0">
                <td className="px-3 py-2 text-ink-muted">{row.label}</td>
                <td className="tabular px-3 py-2 text-right text-ink">{row.a}</td>
                <td className="tabular px-3 py-2 text-right text-ink">{row.b}</td>
                <td className={`tabular px-3 py-2 text-right ${tone}`}>
                  {row.delta === null ? (
                    '—'
                  ) : row.delta === 0 ? (
                    'No change'
                  ) : (
                    <span className="inline-flex items-center justify-end gap-1">
                      {row.delta > 0 ? (
                        <TrendingUp className="size-3" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="size-3" aria-hidden="true" />
                      )}
                      {Math.abs(row.delta) < 1.5
                        ? formatPercent(Math.abs(row.delta))
                        : formatVolume(Math.abs(row.delta))}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
          {loadingScores && !scoreA ? (
            <tr>
              <td colSpan={4} className="px-3 py-2 text-center text-ink-subtle">
                <span className="inline-flex items-center gap-1.5 text-[11px]">
                  <Spinner className="size-3" />
                  Scoring critical coverage…
                </span>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="flex items-center gap-2 border-t border-hairline bg-raised/20 px-3 py-2 text-[11px] text-ink-subtle">
        <Scale className="size-3.5 shrink-0" aria-hidden="true" />
        Neither run is labeled "better" — compare the trade-off and decide
        what matters for this situation.
      </div>
    </motion.div>
  )
}

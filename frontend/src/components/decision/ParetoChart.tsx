import { useMemo, useState } from 'react'

import { Select } from '@/components/ui/Select'
import { formatPercent } from '@/lib/format'
import {
  OBJECTIVE_KEYS,
  OBJECTIVE_LABELS,
  type Candidate,
  type ObjectiveScores,
} from '@/types/network'

const WIDTH = 640
const HEIGHT = 420
const PAD = { top: 20, right: 24, bottom: 48, left: 56 }
const PLOT_W = WIDTH - PAD.left - PAD.right
const PLOT_H = HEIGHT - PAD.top - PAD.bottom

interface ParetoChartProps {
  candidates: Candidate[]
  frontierIds: Set<string>
  selectedId: string | null
  onSelect: (candidateId: string) => void
  /** The current (non-candidate) allocation's objectives, if available, shown
   * as a distinct reference marker so a decision-maker sees where "now"
   * sits relative to the explored trade-off space. */
  baseline?: ObjectiveScores | null
}

/**
 * The Pareto frontier scatter: the visual centerpiece of Decision Analysis.
 * Two objectives are plotted at a time (axes are chosen, not fixed, since no
 * single pair is "the" frontier across five objectives); Pareto-optimal
 * candidates render filled and bright, dominated ones hollow and muted, so
 * the two sets are distinguishable before reading any label.
 */
export function ParetoChart({
  candidates,
  frontierIds,
  selectedId,
  onSelect,
  baseline,
}: ParetoChartProps) {
  const [xKey, setXKey] = useState<keyof ObjectiveScores>('unmet_demand_score')
  const [yKey, setYKey] = useState<keyof ObjectiveScores>('critical_coverage')
  const [hoverId, setHoverId] = useState<string | null>(null)

  const points = useMemo(
    () =>
      candidates.map((c) => ({
        candidate: c,
        x: PAD.left + c.objectives[xKey] * PLOT_W,
        // SVG y grows downward; flip so "up" reads as "better".
        y: PAD.top + (1 - c.objectives[yKey]) * PLOT_H,
      })),
    [candidates, xKey, yKey],
  )

  // Several weight combinations often converge to the exact same outcome
  // (e.g. once every critical facility is already fully served, further
  // weight on criticality changes nothing). Group points that land on the
  // same pixel so one marker can show "+N" instead of silently hiding them
  // under a single dot.
  const clusterSizeByPoint = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of points) {
      const key = `${Math.round(p.x)},${Math.round(p.y)}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return (x: number, y: number) =>
      counts.get(`${Math.round(x)},${Math.round(y)}`) ?? 1
  }, [points])

  const baselinePoint = baseline
    ? {
        x: PAD.left + baseline[xKey] * PLOT_W,
        y: PAD.top + (1 - baseline[yKey]) * PLOT_H,
      }
    : null

  const hovered = hoverId
    ? points.find((p) => p.candidate.candidate_id === hoverId)
    : null

  const axisOptions = OBJECTIVE_KEYS.map((key) => ({
    value: key,
    label: OBJECTIVE_LABELS[key],
  }))

  const uniquePositions = new Set(
    points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`),
  ).size

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <AxisPicker label="X axis" value={xKey} onChange={setXKey} options={axisOptions} />
        <AxisPicker label="Y axis" value={yKey} onChange={setYKey} options={axisOptions} />
        <span className="text-[11px] text-ink-subtle">
          {candidates.length} candidates
          {uniquePositions < candidates.length
            ? ` · ${uniquePositions} distinct on this view (×N marks overlapping options)`
            : ''}
        </span>
        <Legend />
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          role="img"
          aria-label={`Pareto frontier: ${OBJECTIVE_LABELS[xKey]} vs ${OBJECTIVE_LABELS[yKey]}`}
        >
          {/* Gridlines at 0/25/50/75/100% on both axes */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={PAD.left + PLOT_W}
                y1={PAD.top + (1 - t) * PLOT_H}
                y2={PAD.top + (1 - t) * PLOT_H}
                stroke="var(--color-hairline)"
                strokeWidth="1"
              />
              <line
                x1={PAD.left + t * PLOT_W}
                x2={PAD.left + t * PLOT_W}
                y1={PAD.top}
                y2={PAD.top + PLOT_H}
                stroke="var(--color-hairline)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={PAD.top + (1 - t) * PLOT_H}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="10"
                fill="var(--color-ink-subtle)"
              >
                {formatPercent(t)}
              </text>
              <text
                x={PAD.left + t * PLOT_W}
                y={PAD.top + PLOT_H + 16}
                textAnchor="middle"
                fontSize="10"
                fill="var(--color-ink-subtle)"
              >
                {formatPercent(t)}
              </text>
            </g>
          ))}

          {/* Axis labels */}
          <text
            x={PAD.left + PLOT_W / 2}
            y={HEIGHT - 6}
            textAnchor="middle"
            fontSize="11"
            fontWeight="500"
            fill="var(--color-ink-muted)"
          >
            {OBJECTIVE_LABELS[xKey]} →
          </text>
          <text
            x={14}
            y={PAD.top + PLOT_H / 2}
            textAnchor="middle"
            fontSize="11"
            fontWeight="500"
            fill="var(--color-ink-muted)"
            transform={`rotate(-90 14 ${PAD.top + PLOT_H / 2})`}
          >
            {OBJECTIVE_LABELS[yKey]} →
          </text>

          {/* Baseline (current allocation) reference marker */}
          {baselinePoint ? (
            <g transform={`translate(${baselinePoint.x} ${baselinePoint.y})`}>
              <line x1="-7" y1="-7" x2="7" y2="7" stroke="var(--color-ink-muted)" strokeWidth="2" />
              <line x1="-7" y1="7" x2="7" y2="-7" stroke="var(--color-ink-muted)" strokeWidth="2" />
            </g>
          ) : null}

          {/* Candidate points: dominated first so Pareto-optimal draws on top */}
          {points
            .slice()
            .sort((a, b) =>
              frontierIds.has(a.candidate.candidate_id) === frontierIds.has(b.candidate.candidate_id)
                ? 0
                : frontierIds.has(a.candidate.candidate_id)
                  ? 1
                  : -1,
            )
            .map(({ candidate, x, y }) => {
              const isFrontier = frontierIds.has(candidate.candidate_id)
              const isSelected = candidate.candidate_id === selectedId
              const isHovered = candidate.candidate_id === hoverId
              const radius = isSelected ? 8 : isHovered ? 7 : isFrontier ? 6 : 4.5
              const clusterSize = clusterSizeByPoint(x, y)

              return (
                <g key={candidate.candidate_id}>
                  {isSelected ? (
                    <circle
                      cx={x}
                      cy={y}
                      r={radius + 5}
                      fill="none"
                      stroke="var(--color-aqua-300)"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                  ) : null}
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill={isFrontier ? 'var(--color-aqua-400)' : 'var(--color-abyss)'}
                    stroke={isFrontier ? 'var(--color-aqua-300)' : 'var(--color-ink-subtle)'}
                    strokeWidth={isFrontier ? 1.5 : 1.25}
                    opacity={isFrontier ? 1 : 0.6}
                    className="cursor-pointer transition-[r]"
                    onMouseEnter={() => setHoverId(candidate.candidate_id)}
                    onMouseLeave={() => setHoverId(null)}
                    onClick={() => onSelect(candidate.candidate_id)}
                  />
                  {clusterSize > 1 ? (
                    <text
                      x={x + radius + 3}
                      y={y - radius - 2}
                      fontSize="9"
                      fontWeight="600"
                      fill="var(--color-ink-muted)"
                      className="pointer-events-none select-none"
                    >
                      ×{clusterSize}
                    </text>
                  ) : null}
                </g>
              )
            })}
        </svg>

        {hovered ? (
          <ChartTooltip
            candidate={hovered.candidate}
            x={hovered.x}
            y={hovered.y}
            isFrontier={frontierIds.has(hovered.candidate.candidate_id)}
          />
        ) : null}
      </div>
    </div>
  )
}

function AxisPicker({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: keyof ObjectiveScores
  onChange: (value: keyof ObjectiveScores) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
      {label}
      <Select
        aria-label={label}
        className="w-44 py-1.5 text-xs"
        value={value}
        options={options}
        onChange={(event) =>
          onChange(event.target.value as keyof ObjectiveScores)
        }
      />
    </label>
  )
}

function Legend() {
  return (
    <div className="ml-auto flex items-center gap-4 text-[11px] text-ink-subtle">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-aqua-400 ring-1 ring-aqua-300" />
        Pareto-optimal
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border border-ink-subtle bg-abyss opacity-60" />
        Dominated
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="0 0 14 14" aria-hidden="true">
          <line x1="1" y1="1" x2="13" y2="13" stroke="var(--color-ink-muted)" strokeWidth="2" />
          <line x1="1" y1="13" x2="13" y2="1" stroke="var(--color-ink-muted)" strokeWidth="2" />
        </svg>
        Current allocation
      </span>
    </div>
  )
}

function ChartTooltip({
  candidate,
  x,
  y,
  isFrontier,
}: {
  candidate: Candidate
  x: number
  y: number
  isFrontier: boolean
}) {
  const leftPct = (x / WIDTH) * 100
  const topPct = (y / HEIGHT) * 100
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border border-divider bg-depth/95 p-2.5 shadow-2xl backdrop-blur"
      style={{ left: `${leftPct}%`, top: `${topPct}%` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">
          {candidate.candidate_id.replace('candidate-', 'Option ')}
        </span>
        <span
          className={
            isFrontier
              ? 'rounded-full bg-aqua-500/15 px-1.5 py-0.5 text-[10px] font-medium text-aqua-300'
              : 'rounded-full bg-overlay px-1.5 py-0.5 text-[10px] text-ink-subtle'
          }
        >
          {isFrontier ? 'Pareto-optimal' : 'Dominated'}
        </span>
      </div>
      <dl className="mt-1.5 space-y-0.5">
        {OBJECTIVE_KEYS.map((key) => (
          <div key={key} className="flex items-center justify-between text-[11px]">
            <dt className="text-ink-subtle">{OBJECTIVE_LABELS[key]}</dt>
            <dd className="tabular font-medium text-ink">
              {formatPercent(candidate.objectives[key])}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[10px] text-ink-subtle">Click to select</p>
    </div>
  )
}

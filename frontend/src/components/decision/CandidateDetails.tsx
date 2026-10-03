import { Map as MapIcon } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatPercent, formatVolume } from '@/lib/format'
import {
  OBJECTIVE_KEYS,
  OBJECTIVE_LABELS,
  type ObjectiveScores,
  type Candidate,
} from '@/types/network'

import { TradeOffSummary } from './TradeOffSummary'

interface CandidateDetailsProps {
  candidate: Candidate
  /** The current allocation's objective scores, computed server-side by the
   * same `score_objectives` the candidates are scored with (see
   * `/decision/score`) — never re-derived client-side. */
  baseline: ObjectiveScores | null
  onInspectOnMap: () => void
}

/** Full detail for the selected candidate: its objectives, what it trades
 * off against the current allocation, and the way into the map. */
export function CandidateDetails({
  candidate,
  baseline,
  onInspectOnMap,
}: CandidateDetailsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">
              {candidate.candidate_id.replace('candidate-', 'Option ')}
            </h3>
            {candidate.is_pareto_optimal ? (
              <Badge tone="info">Pareto-optimal</Badge>
            ) : (
              <Badge tone="neutral">Dominated</Badge>
            )}
          </div>
          <p className="mt-1 text-[11px] text-ink-subtle">
            Weights — criticality {formatPercent(candidate.criticality_weight)} · population{' '}
            {formatPercent(candidate.population_weight)} · efficiency{' '}
            {formatPercent(candidate.efficiency_weight)}
          </p>
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={onInspectOnMap}
          icon={<MapIcon className="size-3.5" />}
        >
          Inspect on Map
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-hairline bg-raised/40 p-3.5">
        {OBJECTIVE_KEYS.map((key) => (
          <div key={key} className="min-w-0">
            <p className="text-[10px] leading-tight tracking-wide text-ink-subtle uppercase">
              {OBJECTIVE_LABELS[key]}
            </p>
            <p className="tabular mt-0.5 text-lg font-semibold text-ink">
              {formatPercent(candidate.objectives[key])}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Stat
          label="Allocated"
          value={`${formatVolume(candidate.allocation.metrics.total_supplied_m3_per_day)} m³/day`}
        />
        <Stat
          label="Unmet"
          value={`${formatVolume(candidate.allocation.metrics.total_unmet_m3_per_day)} m³/day`}
        />
      </div>

      {baseline ? (
        <div className="border-t border-hairline pt-3">
          <h4 className="mb-2 text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
            Trade-off vs current allocation
          </h4>
          <TradeOffSummary selected={candidate.objectives} baseline={baseline} />
        </div>
      ) : (
        <p className="border-t border-hairline pt-3 text-[11px] text-ink-subtle">
          Run an allocation on the Map to compare this candidate against it.
        </p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-subtle">{label}</span>
      <span className="tabular font-medium text-ink">{value}</span>
    </div>
  )
}

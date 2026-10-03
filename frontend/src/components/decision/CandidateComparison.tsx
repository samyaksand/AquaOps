import { TrendingDown, TrendingUp } from 'lucide-react'

import { Badge } from '@/components/ui/Badge'
import { formatPercent } from '@/lib/format'
import {
  OBJECTIVE_KEYS,
  OBJECTIVE_LABELS,
  type Candidate,
} from '@/types/network'

interface CandidateComparisonProps {
  a: Candidate
  b: Candidate
}

/** Direct two-candidate comparison: every objective, side by side, with the
 * better side highlighted per row. No ranking is implied beyond that —
 * which candidate is preferable overall is still the operator's call. */
export function CandidateComparison({ a, b }: CandidateComparisonProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <CandidateHeader candidate={a} />
        <span className="text-[11px] font-medium text-ink-subtle">vs</span>
        <CandidateHeader candidate={b} align="right" />
      </div>

      <ul className="divide-y divide-hairline rounded-xl border border-hairline">
        {OBJECTIVE_KEYS.map((key) => {
          const va = a.objectives[key]
          const vb = b.objectives[key]
          const diff = va - vb
          const aWins = diff > 0.005
          const bWins = diff < -0.005
          return (
            <li
              key={key}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3.5 py-2.5"
            >
              <span
                className={
                  aWins
                    ? 'tabular text-sm font-semibold text-status-ok'
                    : 'tabular text-sm text-ink-muted'
                }
              >
                {formatPercent(va)}
              </span>
              <span className="text-center text-[10px] tracking-wide text-ink-subtle uppercase">
                {OBJECTIVE_LABELS[key]}
              </span>
              <span
                className={
                  bWins
                    ? 'tabular text-right text-sm font-semibold text-status-ok'
                    : 'tabular text-right text-sm text-ink-muted'
                }
              >
                {formatPercent(vb)}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function CandidateHeader({
  candidate,
  align = 'left',
}: {
  candidate: Candidate
  align?: 'left' | 'right'
}) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <div
        className={
          align === 'right'
            ? 'flex items-center justify-end gap-1.5'
            : 'flex items-center gap-1.5'
        }
      >
        <p className="text-sm font-semibold text-ink">
          {candidate.candidate_id.replace('candidate-', 'Option ')}
        </p>
        {candidate.is_pareto_optimal ? (
          <TrendingUp className="size-3 text-aqua-300" aria-hidden="true" />
        ) : (
          <TrendingDown className="size-3 text-ink-subtle" aria-hidden="true" />
        )}
      </div>
      <Badge tone={candidate.is_pareto_optimal ? 'info' : 'neutral'}>
        {candidate.is_pareto_optimal ? 'Pareto-optimal' : 'Dominated'}
      </Badge>
    </div>
  )
}

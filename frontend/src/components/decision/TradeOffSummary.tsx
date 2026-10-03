import { TrendingDown, TrendingUp } from 'lucide-react'

import { formatPercent } from '@/lib/format'
import {
  OBJECTIVE_KEYS,
  OBJECTIVE_LABELS,
  type ObjectiveScores,
} from '@/types/network'

interface TradeOffSummaryProps {
  selected: ObjectiveScores
  baseline: ObjectiveScores
}

const MEANINGFUL_DELTA = 0.01

/**
 * A calculated, plain-language trade-off: what improves and what worsens if
 * the selected candidate replaced the current allocation. The comparison is
 * arithmetic (selected minus baseline, per objective) — never a judgement
 * about which is "better" overall, since that call belongs to the operator.
 */
export function TradeOffSummary({ selected, baseline }: TradeOffSummaryProps) {
  const deltas = OBJECTIVE_KEYS.map((key) => ({
    key,
    label: OBJECTIVE_LABELS[key],
    delta: selected[key] - baseline[key],
  }))

  const improved = deltas.filter((d) => d.delta > MEANINGFUL_DELTA)
  const worsened = deltas.filter((d) => d.delta < -MEANINGFUL_DELTA)
  const unchanged = deltas.filter(
    (d) => Math.abs(d.delta) <= MEANINGFUL_DELTA,
  )

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-ink-muted">
        {improved.length === 0 && worsened.length === 0
          ? 'This candidate performs the same as the current allocation on every objective.'
          : improved.length > 0 && worsened.length === 0
            ? `Improves ${joinLabels(improved.map((d) => d.label))} with no trade-off on the rest.`
            : worsened.length > 0 && improved.length === 0
              ? `Costs ${joinLabels(worsened.map((d) => d.label))} with no gain elsewhere — unlikely to be worth selecting.`
              : `Improves ${joinLabels(improved.map((d) => d.label))} at the cost of ${joinLabels(worsened.map((d) => d.label))}.`}
      </p>

      <ul className="space-y-1.5">
        {deltas
          .slice()
          .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
          .map(({ key, label, delta }) => (
            <li key={key} className="flex items-center justify-between text-xs">
              <span className="text-ink-subtle">{label}</span>
              <DeltaBadge delta={delta} />
            </li>
          ))}
      </ul>

      {unchanged.length === deltas.length ? null : (
        <p className="text-[10px] text-ink-subtle">
          Changes under {formatPercent(MEANINGFUL_DELTA)} are treated as no
          change.
        </p>
      )}
    </div>
  )
}

function DeltaBadge({ delta }: { delta: number }) {
  if (Math.abs(delta) <= MEANINGFUL_DELTA) {
    return <span className="tabular text-ink-subtle">No change</span>
  }
  const better = delta > 0
  return (
    <span
      className={
        better
          ? 'tabular flex items-center gap-1 font-medium text-status-ok'
          : 'tabular flex items-center gap-1 font-medium text-status-critical'
      }
    >
      {better ? (
        <TrendingUp className="size-3" aria-hidden="true" />
      ) : (
        <TrendingDown className="size-3" aria-hidden="true" />
      )}
      {better ? '+' : ''}
      {formatPercent(delta)}
    </span>
  )
}

function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0].toLowerCase()
  if (labels.length === 2) return labels.map((l) => l.toLowerCase()).join(' and ')
  return (
    labels
      .slice(0, -1)
      .map((l) => l.toLowerCase())
      .join(', ') +
    ', and ' +
    labels[labels.length - 1].toLowerCase()
  )
}

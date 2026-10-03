import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { formatVolume } from '@/lib/format'
import type { AllocationResult, NetworkState } from '@/types/network'

interface AttentionStripProps {
  network: NetworkState | null
  allocation: AllocationResult | null
  onSelect: (code: string) => void
}

/**
 * "Where does it matter?" — the Overview's second question. Shows only
 * what currently needs a decision-maker's attention (unmet critical demand
 * once an allocation has run; otherwise the highest-priority points still
 * waiting for one), collapsed to a few rows by default so it never
 * competes with the map for the primary read. Expands on request rather
 * than listing all eight demand points up front.
 */
export function AttentionStrip({
  network,
  allocation,
  onSelect,
}: AttentionStripProps) {
  const [expanded, setExpanded] = useState(false)

  if (!network || network.demands.length === 0) return null

  const items = allocation
    ? network.demands
        .map((point) => ({
          point,
          result: allocation.allocations.find((a) => a.code === point.code),
        }))
        .filter((item) => item.result && item.result.unmet_m3_per_day > 0)
        .sort(
          (a, b) =>
            a.point.priority_rank - b.point.priority_rank ||
            (b.result?.unmet_m3_per_day ?? 0) - (a.result?.unmet_m3_per_day ?? 0),
        )
    : [...network.demands]
        .sort((a, b) => a.priority_rank - b.priority_rank)
        .map((point) => ({ point, result: undefined }))

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-hairline bg-surface px-4 py-3">
        <Badge tone="ok">All clear</Badge>
        <p className="text-xs text-ink-subtle">
          Every demand point is fully supplied under the current allocation.
        </p>
      </div>
    )
  }

  const visible = expanded ? items : items.slice(0, 3)
  const hiddenCount = items.length - visible.length

  return (
    <div className="rounded-2xl border border-hairline bg-surface">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
        <AlertTriangle
          className={allocation ? 'size-4 text-status-critical' : 'size-4 text-status-warn'}
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-ink">
          {allocation ? 'Needs attention' : 'Highest priority'}
        </h2>
        <span className="text-xs text-ink-subtle">
          {allocation
            ? `${items.length} point${items.length === 1 ? '' : 's'} with unmet demand`
            : 'Run an allocation to see shortfalls'}
        </span>
      </div>
      <ul className="divide-y divide-hairline">
        {visible.map(({ point, result }) => (
          <li key={point.code}>
            <button
              type="button"
              onClick={() => onSelect(point.code)}
              className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-raised"
            >
              <span className="min-w-0 truncate text-sm text-ink">
                {point.name}
              </span>
              {result ? (
                <span className="tabular shrink-0 text-xs font-medium text-status-critical">
                  {formatVolume(result.unmet_m3_per_day)} m³ unmet
                </span>
              ) : (
                <Badge tone={point.priority_rank === 0 ? 'critical' : 'neutral'}>
                  {point.priority_rank === 0 ? 'Critical' : 'Priority'}
                </Badge>
              )}
            </button>
          </li>
        ))}
      </ul>
      {hiddenCount > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-b-2xl border-t border-hairline py-2 text-xs text-ink-subtle transition-colors hover:bg-raised hover:text-ink-muted"
        >
          {expanded ? (
            <>
              Show less <ChevronUp className="size-3.5" />
            </>
          ) : (
            <>
              Show {hiddenCount} more <ChevronDown className="size-3.5" />
            </>
          )}
        </button>
      ) : null}
    </div>
  )
}

import type { Point } from '@/lib/projection'
import { PRIORITY_LABELS } from '@/types/network'

import { iconFor } from './icons'
import { KIND_LABELS, type MapEntity } from './model'

interface MapTooltipProps {
  entity: MapEntity
  screen: Point
}

const STATE_LABELS = {
  online: 'Online',
  derated: 'Derated',
  unavailable: 'Offline',
} as const

/** Follows the cursor. Summary only — the full breakdown is a click away. */
export function MapTooltip({ entity, screen }: MapTooltipProps) {
  const Icon = iconFor(entity.kind, entity.category)
  return (
    <div
      role="tooltip"
      className="rise-in pointer-events-none fixed z-50 w-60 rounded-xl border border-divider bg-depth/95 p-3.5 backdrop-blur"
      style={{
        left: Math.min(screen.x + 16, window.innerWidth - 256),
        top: Math.min(screen.y + 16, window.innerHeight - 160),
        boxShadow: 'var(--shadow-soft)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <Icon className="size-3.5 text-ink-subtle" aria-hidden="true" />
        <span className="text-[10px] font-medium tracking-wide text-ink-subtle uppercase">
          {KIND_LABELS[entity.kind]}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-tight font-semibold text-ink">
        {entity.name}
      </p>
      <p className="tabular mt-1 text-xs text-ink-muted">{entity.headline}</p>

      {entity.allocation ? (
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span
            className={
              entity.allocation.meetsMinimum
                ? 'text-status-ok'
                : 'text-status-critical'
            }
          >
            {entity.allocation.unmetM3PerDay > 0
              ? `${Math.round(entity.allocation.unmetM3PerDay).toLocaleString()} m³/day unmet`
              : 'Fully supplied'}
          </span>
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-2 border-t border-hairline pt-2.5 text-[11px]">
        <span className="text-ink-subtle">{STATE_LABELS[entity.state]}</span>
        {entity.priorityRank !== null ? (
          <>
            <span className="text-ink-subtle">·</span>
            <span className="text-ink-subtle">
              {PRIORITY_LABELS[entity.priorityRank]} priority
            </span>
          </>
        ) : null}
      </div>
      <p className="mt-1.5 text-[10px] text-ink-subtle">Click for detail</p>
    </div>
  )
}

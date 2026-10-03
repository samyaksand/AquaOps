import { X } from 'lucide-react'

import { Badge, StatusBadge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { useAppStore } from '@/store/useAppStore'
import { PRIORITY_LABELS } from '@/types/network'

import { KIND_COLORS } from './glyphs'
import { KIND_LABELS, describeEdge, type MapModel } from './model'

const PRIORITY_TONES = ['critical', 'warn', 'info', 'neutral'] as const

/** Detail card for the selected entity, overlaid on the map. */
export function NodeDetails({ model }: { model: MapModel }) {
  const selected = useAppStore((state) => state.selectedNodeCode)
  const select = useAppStore((state) => state.selectNode)
  const entity = selected ? model.byCode[selected] : undefined

  if (!entity) return null

  const connections = model.edges.filter(
    (edge) => edge.sourceCode === entity.code || edge.targetCode === entity.code,
  )

  return (
    <div className="absolute top-3 left-3 w-72 overflow-hidden rounded-lg border border-divider bg-depth/95 shadow-2xl backdrop-blur">
      <header className="flex items-start gap-2 border-b border-hairline px-3 py-2.5">
        <span
          aria-hidden="true"
          className="mt-1 size-2.5 shrink-0 rounded-sm"
          style={{ backgroundColor: KIND_COLORS[entity.kind] }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium tracking-wide text-ink-subtle uppercase">
            {KIND_LABELS[entity.kind]}
          </p>
          <h3 className="truncate text-sm font-semibold text-ink">
            {entity.name}
          </h3>
          <p className="tabular mt-0.5 font-mono text-[10px] text-ink-subtle">
            {entity.code}
          </p>
        </div>
        <IconButton
          label="Close details"
          onClick={() => select(null)}
          className="size-6"
        >
          <X className="size-3.5" />
        </IconButton>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 px-3 py-2">
        <StatusBadge state={entity.state} />
        {entity.priorityRank !== null ? (
          <Badge tone={PRIORITY_TONES[entity.priorityRank] ?? 'neutral'}>
            {PRIORITY_LABELS[entity.priorityRank]}
          </Badge>
        ) : null}
      </div>

      <dl className="divide-y divide-hairline border-t border-hairline">
        {entity.details.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 px-3 py-1.5"
          >
            <dt className="text-xs text-ink-subtle">{row.label}</dt>
            <dd className="tabular text-xs font-medium text-ink">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      {connections.length > 0 ? (
        <section className="border-t border-hairline">
          <h4 className="px-3 pt-2 text-[10px] font-medium tracking-wide text-ink-subtle uppercase">
            Connections ({connections.length})
          </h4>
          <ul className="max-h-40 overflow-y-auto px-3 pt-1 pb-2.5">
            {connections.map((edge) => {
              const isOutbound = edge.sourceCode === entity.code
              const otherCode = isOutbound ? edge.targetCode : edge.sourceCode
              const other = model.byCode[otherCode]
              return (
                <li key={edge.code} className="py-1">
                  <button
                    type="button"
                    onClick={() => select(otherCode)}
                    className="w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-raised"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-ink-muted">
                        <span className="text-ink-subtle">
                          {isOutbound ? '→ ' : '← '}
                        </span>
                        {other?.name ?? otherCode}
                      </span>
                      <StatusBadge state={edge.state} />
                    </div>
                    <p className="tabular mt-0.5 text-[10px] text-ink-subtle">
                      {describeEdge(edge)
                        .map((row) => `${row.label} ${row.value}`)
                        .join(' · ')}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

import { X } from 'lucide-react'

import { Badge, StatusBadge } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { useAppStore } from '@/store/useAppStore'
import { PRIORITY_LABELS } from '@/types/network'

import { iconFor } from './icons'
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
  const Icon = iconFor(entity.kind, entity.category)

  return (
    <div
      className="rise-in absolute top-4 left-4 w-80 overflow-hidden rounded-xl border border-divider bg-depth/95 backdrop-blur"
      style={{ boxShadow: 'var(--shadow-lift)' }}
    >
      <header className="flex items-start gap-3 border-b border-hairline px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-raised text-ink-muted ring-1 ring-divider">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium tracking-wide text-ink-subtle uppercase">
            {KIND_LABELS[entity.kind]}
          </p>
          <h3 className="truncate text-[15px] font-semibold text-ink">
            {entity.name}
          </h3>
        </div>
        <IconButton
          label="Close details"
          onClick={() => select(null)}
          className="size-7"
        >
          <X className="size-3.5" />
        </IconButton>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
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
            className="flex items-baseline justify-between gap-3 px-4 py-2"
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
          <h4 className="px-4 pt-3 text-[10px] font-medium tracking-wide text-ink-subtle uppercase">
            Connections ({connections.length})
          </h4>
          <ul className="max-h-44 overflow-y-auto px-2.5 pt-1.5 pb-3">
            {connections.map((edge) => {
              const isOutbound = edge.sourceCode === entity.code
              const otherCode = isOutbound ? edge.targetCode : edge.sourceCode
              const other = model.byCode[otherCode]
              return (
                <li key={edge.code}>
                  <button
                    type="button"
                    onClick={() => select(otherCode)}
                    className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-raised"
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

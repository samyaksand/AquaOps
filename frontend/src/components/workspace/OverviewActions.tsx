import { FlaskConical, PlayCircle, ScatterChart } from 'lucide-react'

import { Spinner } from '@/components/ui/States'
import { useAllocation } from '@/hooks/useAllocation'
import { useAppStore, type ViewId } from '@/store/useAppStore'

interface OverviewActionsProps {
  onNavigate: (view: ViewId) => void
}

/**
 * The three things an operator can actually do, as a single compact action
 * bar rather than three tall cards — the map is the hero of this page, so
 * its chrome stays thin. Run Allocation acts immediately (one call against
 * the current strategy); the other two are entry points to their own screen.
 */
export function OverviewActions({ onNavigate }: OverviewActionsProps) {
  const strategy = useAppStore((state) => state.strategy)
  const { allocation, loading, allocate } = useAllocation()

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <ActionButton
        icon={loading ? <Spinner className="size-4" /> : <PlayCircle className="size-4" />}
        label={loading ? 'Allocating…' : allocation ? 'Re-run Allocation' : 'Run Allocation'}
        primary
        onClick={() => void allocate(strategy)}
        disabled={loading}
      />
      <ActionButton
        icon={<FlaskConical className="size-4" />}
        label="Create Scenario"
        onClick={() => onNavigate('scenarios')}
      />
      <ActionButton
        icon={<ScatterChart className="size-4" />}
        label="Analyze Decisions"
        onClick={() => onNavigate('decision')}
      />
    </div>
  )
}

function ActionButton({
  icon,
  label,
  onClick,
  primary = false,
  disabled = false,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        primary
          ? 'flex items-center gap-2 rounded-xl border border-aqua-500/40 bg-gradient-to-br from-aqua-500/15 to-aqua-500/5 px-4 py-2 text-sm font-semibold text-ink transition-all hover:border-aqua-400/60 hover:from-aqua-500/20 disabled:pointer-events-none disabled:opacity-60'
          : 'flex items-center gap-2 rounded-xl border border-hairline bg-surface px-4 py-2 text-sm text-ink-muted transition-all hover:border-divider hover:bg-raised hover:text-ink'
      }
    >
      <span className={primary ? 'text-aqua-300' : 'text-ink-subtle'}>{icon}</span>
      {label}
    </button>
  )
}

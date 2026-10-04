import { clsx } from 'clsx'
import { Activity, CircleSlash, RefreshCw, Zap, ZapOff } from 'lucide-react'

import { Badge, Dot } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/States'
import type { RealtimeStatus } from '@/hooks/useRealtime'
import { useAppStore, type ViewId } from '@/store/useAppStore'
import {
  STRATEGIES,
  STRATEGY_LABELS,
  type StrategyName,
} from '@/types/network'

const TITLES: Record<ViewId, { title: string; subtitle: string }> = {
  overview: {
    title: 'Overview',
    subtitle: 'Decide how Rivertown shares water under pressure',
  },
  network: {
    title: 'Network',
    subtitle: 'Reservoirs, plants, pipelines and demand points',
  },
  scenarios: {
    title: 'Scenarios',
    subtitle: 'Simulated disruptions and their consequences',
  },
  decision: {
    title: 'Decision Analysis',
    subtitle: 'Explore trade-offs across candidate allocations',
  },
  strategies: {
    title: 'Strategies',
    subtitle: 'Compare allocation trade-offs side by side',
  },
}

const STRATEGY_OPTIONS = STRATEGIES.map((value) => ({
  value,
  label: STRATEGY_LABELS[value],
}))

interface HeaderProps {
  connected: boolean
  loading: boolean
  onRefresh: () => void
  realtimeStatus?: RealtimeStatus
}

export function Header({
  connected,
  loading,
  onRefresh,
  realtimeStatus,
}: HeaderProps) {
  const view = useAppStore((state) => state.view)
  const strategy = useAppStore((state) => state.strategy)
  const setStrategy = useAppStore((state) => state.setStrategy)
  const { title, subtitle } = TITLES[view]

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-hairline bg-depth px-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-sm font-semibold text-ink">{title}</h1>
          <Badge tone="info">Baseline</Badge>
        </div>
        <p className="hidden truncate text-xs text-ink-subtle sm:block">
          {subtitle}
        </p>
      </div>

      <div className="hidden items-center gap-2 lg:flex">
        <label
          htmlFor="strategy"
          className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase"
        >
          Strategy
        </label>
        <Select
          id="strategy"
          className="w-52"
          value={strategy}
          options={STRATEGY_OPTIONS}
          onChange={(event) =>
            setStrategy(event.target.value as StrategyName)
          }
        />
      </div>

      <div className="flex items-center gap-1.5">
        {realtimeStatus ? <RealtimeIndicator status={realtimeStatus} /> : null}
        <ApiStatus connected={connected} loading={loading} />
        <IconButton
          label="Refresh network"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw className={clsx('size-4', loading && 'animate-spin')} />
        </IconButton>
      </div>
    </header>
  )
}

/** Subtle indicator for the WebSocket relay — separate from `ApiStatus`,
 * which reflects whether the last REST load of the network succeeded. */
function RealtimeIndicator({ status }: { status: RealtimeStatus }) {
  if (status === 'live') {
    return (
      <span
        className="flex items-center gap-1 text-status-ok"
        title="Live updates connected"
      >
        <Zap className="size-3.5" aria-hidden="true" />
        <span className="hidden text-[11px] lg:inline">Live updates</span>
      </span>
    )
  }
  if (status === 'connecting') {
    return (
      <span
        className="flex items-center gap-1 text-ink-subtle"
        title="Connecting to live updates"
      >
        <Spinner className="size-3" />
      </span>
    )
  }
  return (
    <span
      className="flex items-center gap-1 text-ink-subtle"
      title="Live updates disconnected — reconnecting"
    >
      <ZapOff className="size-3.5" aria-hidden="true" />
    </span>
  )
}

function ApiStatus({
  connected,
  loading,
}: {
  connected: boolean
  loading: boolean
}) {
  if (loading) {
    return (
      <Badge tone="neutral">
        <Spinner className="size-3" />
        Syncing
      </Badge>
    )
  }
  if (!connected) {
    return (
      <Badge tone="critical">
        <CircleSlash className="size-3" aria-hidden="true" />
        API offline
      </Badge>
    )
  }
  return (
    <Badge tone="ok">
      <Dot tone="ok" />
      <Activity className="size-3" aria-hidden="true" />
      Live
    </Badge>
  )
}

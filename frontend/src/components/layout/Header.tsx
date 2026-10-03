import { clsx } from 'clsx'
import { Activity, CircleSlash, RefreshCw } from 'lucide-react'

import { Badge, Dot } from '@/components/ui/Badge'
import { IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/States'
import { useAppStore, type ViewId } from '@/store/useAppStore'
import {
  STRATEGIES,
  STRATEGY_LABELS,
  type StrategyName,
} from '@/types/network'

const TITLES: Record<ViewId, { title: string; subtitle: string }> = {
  overview: {
    title: 'Overview',
    subtitle: 'Current network posture and headline metrics',
  },
  network: {
    title: 'Network',
    subtitle: 'Reservoirs, plants, pipelines and demand points',
  },
  scenarios: {
    title: 'Scenarios',
    subtitle: 'Simulated disruptions and their consequences',
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
}

export function Header({ connected, loading, onRefresh }: HeaderProps) {
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

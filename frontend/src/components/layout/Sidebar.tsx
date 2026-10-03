import { clsx } from 'clsx'
import {
  Droplets,
  GitCompareArrows,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ScatterChart,
  Share2,
  Waves,
} from 'lucide-react'
import type { ComponentType } from 'react'

import { IconButton } from '@/components/ui/Button'
import { useAppStore, type ViewId } from '@/store/useAppStore'

interface NavItem {
  id: ViewId
  label: string
  icon: ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'network', label: 'Network', icon: Share2 },
  { id: 'scenarios', label: 'Scenarios', icon: Waves },
  { id: 'decision', label: 'Decision Analysis', icon: ScatterChart },
  { id: 'strategies', label: 'Strategies', icon: GitCompareArrows },
]

export function Sidebar() {
  const view = useAppStore((state) => state.view)
  const setView = useAppStore((state) => state.setView)
  const collapsed = useAppStore((state) => state.sidebarCollapsed)
  const toggle = useAppStore((state) => state.toggleSidebar)

  return (
    <nav
      aria-label="Primary"
      className={clsx(
        'flex shrink-0 flex-col border-r border-hairline bg-depth',
        'transition-[width] duration-200',
        collapsed ? 'w-[4.25rem]' : 'w-56',
      )}
    >
      <div
        className={clsx(
          'flex h-14 items-center border-b border-hairline',
          collapsed ? 'justify-center px-2' : 'justify-between pr-2 pl-4',
        )}
      >
        {collapsed ? (
          <Mark />
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Mark />
              <div className="leading-none">
                <p className="text-sm font-semibold tracking-tight text-ink">
                  AquaOps
                </p>
                <p className="mt-1 text-[10px] tracking-wider text-ink-subtle uppercase">
                  Simulation
                </p>
              </div>
            </div>
            <IconButton label="Collapse sidebar" onClick={toggle}>
              <PanelLeftClose className="size-4" />
            </IconButton>
          </>
        )}
      </div>

      <ul className="flex-1 space-y-0.5 p-2">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = view === item.id
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setView(item.id)}
                aria-current={active ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={clsx(
                  'relative flex w-full items-center rounded-lg text-sm transition-colors',
                  collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2',
                  active
                    ? 'bg-raised font-medium text-ink'
                    : 'text-ink-muted hover:bg-raised/60 hover:text-ink',
                )}
              >
                {active ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-aqua-400"
                  />
                ) : null}
                <Icon
                  className={clsx(
                    'size-4.5 shrink-0',
                    active && 'text-aqua-400',
                  )}
                />
                {collapsed ? null : item.label}
              </button>
            </li>
          )
        })}
      </ul>

      <div className="border-t border-hairline p-2">
        {collapsed ? (
          <IconButton
            label="Expand sidebar"
            onClick={toggle}
            className="mx-auto"
          >
            <PanelLeftOpen className="size-4" />
          </IconButton>
        ) : (
          <p className="px-2 py-1 text-[10px] leading-relaxed text-ink-subtle">
            Simulated decision support. Not connected to live infrastructure.
          </p>
        )}
      </div>
    </nav>
  )
}

function Mark() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-aqua-500/12 ring-1 ring-aqua-500/25">
      <Droplets className="size-4.5 text-aqua-400" aria-hidden="true" />
    </span>
  )
}

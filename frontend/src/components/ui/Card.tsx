import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  className?: string
}

export function Panel({ children, className }: PanelProps) {
  return (
    <section
      className={clsx(
        'rounded-panel border border-hairline bg-surface',
        className,
      )}
    >
      {children}
    </section>
  )
}

interface PanelHeaderProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  actions,
}: PanelHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-3 border-b border-hairline px-4 py-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon ? (
          <span className="mt-0.5 text-aqua-400" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-ink-subtle">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  )
}

export function PanelBody({ children, className }: PanelProps) {
  return <div className={clsx('p-4', className)}>{children}</div>
}

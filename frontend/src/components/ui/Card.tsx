import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface PanelProps {
  children: ReactNode
  className?: string
  id?: string
}

export function Panel({ children, className, id }: PanelProps) {
  return (
    <section
      id={id}
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
  /** Rendered right after the title — e.g. an InfoTooltip explaining a
   * technical term in the title, without widening `title` itself to a
   * ReactNode (which would ripple through every other call site). */
  titleInfo?: ReactNode
}

export function PanelHeader({
  title,
  subtitle,
  icon,
  actions,
  titleInfo,
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
          <h2 className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
            {title}
            {titleInfo}
          </h2>
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

import { clsx } from 'clsx'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from './Button'

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={clsx('size-4 animate-spin', className)}
      aria-hidden="true"
    />
  )
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div
      className="flex items-center justify-center gap-2.5 p-8 text-sm text-ink-subtle"
      role="status"
    >
      <Spinner />
      {label}
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <span className="flex size-9 items-center justify-center rounded-full bg-status-critical/12 text-status-critical">
        <AlertTriangle className="size-4.5" aria-hidden="true" />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">Could not load data</p>
        <p className="mt-1 max-w-xs text-xs text-ink-subtle">{message}</p>
      </div>
      {onRetry ? (
        <Button
          size="sm"
          onClick={onRetry}
          icon={<RefreshCw className="size-3.5" />}
        >
          Retry
        </Button>
      ) : null}
    </div>
  )
}

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
}

export function EmptyState({ icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2.5 p-8 text-center">
      {icon ? (
        <span className="flex size-9 items-center justify-center rounded-full bg-raised text-ink-subtle">
          {icon}
        </span>
      ) : null}
      <p className="text-sm font-medium text-ink-muted">{title}</p>
      {description ? (
        <p className="max-w-xs text-xs text-ink-subtle">{description}</p>
      ) : null}
    </div>
  )
}

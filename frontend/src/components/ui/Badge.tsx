import { clsx } from 'clsx'
import type { ReactNode } from 'react'

import type { OperationalState } from '@/types/network'

export type Tone = 'ok' | 'warn' | 'critical' | 'offline' | 'info' | 'neutral'

const TONES: Record<Tone, string> = {
  ok: 'bg-status-ok/12 text-status-ok ring-status-ok/25',
  warn: 'bg-status-warn/12 text-status-warn ring-status-warn/25',
  critical: 'bg-status-critical/12 text-status-critical ring-status-critical/25',
  offline: 'bg-status-offline/12 text-status-offline ring-status-offline/25',
  info: 'bg-status-info/12 text-status-info ring-status-info/25',
  neutral: 'bg-overlay text-ink-muted ring-divider',
}

interface BadgeProps {
  tone?: Tone
  children: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5',
        'text-[11px] font-medium whitespace-nowrap ring-1 ring-inset',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

const STATE_TONE: Record<OperationalState, Tone> = {
  online: 'ok',
  derated: 'warn',
  unavailable: 'critical',
}

const STATE_LABEL: Record<OperationalState, string> = {
  online: 'Online',
  derated: 'Derated',
  unavailable: 'Offline',
}

export function StatusBadge({ state }: { state: OperationalState }) {
  return (
    <Badge tone={STATE_TONE[state]}>
      <Dot tone={STATE_TONE[state]} />
      {STATE_LABEL[state]}
    </Badge>
  )
}

const DOT_TONES: Record<Tone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  critical: 'bg-status-critical',
  offline: 'bg-status-offline',
  info: 'bg-status-info',
  neutral: 'bg-ink-subtle',
}

export function Dot({ tone = 'neutral' }: { tone?: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={clsx('size-1.5 shrink-0 rounded-full', DOT_TONES[tone])}
    />
  )
}

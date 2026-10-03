import { clsx } from 'clsx'
import type { ReactNode } from 'react'

import type { Tone } from './Badge'

const VALUE_TONES: Record<Tone, string> = {
  ok: 'text-status-ok',
  warn: 'text-status-warn',
  critical: 'text-status-critical',
  offline: 'text-status-offline',
  info: 'text-status-info',
  neutral: 'text-ink',
}

interface MetricProps {
  label: string
  value: string
  unit?: string
  tone?: Tone
  hint?: string
  icon?: ReactNode
}

/** A single headline number. Label above, value dominant, unit de-emphasised. */
export function Metric({
  label,
  value,
  unit,
  tone = 'neutral',
  hint,
  icon,
}: MetricProps) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        {icon ? (
          <span className="text-ink-subtle" aria-hidden="true">
            {icon}
          </span>
        ) : null}
        <span className="truncate text-[11px] font-medium tracking-wide text-ink-subtle uppercase">
          {label}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={clsx(
            'tabular text-xl leading-none font-semibold',
            VALUE_TONES[tone],
          )}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-xs text-ink-subtle">{unit}</span>
        ) : null}
      </div>
      {hint ? (
        <p className="mt-1 truncate text-[11px] text-ink-subtle">{hint}</p>
      ) : null}
    </div>
  )
}

interface BarProps {
  ratio: number
  tone?: Tone
}

const BAR_TONES: Record<Tone, string> = {
  ok: 'bg-status-ok',
  warn: 'bg-status-warn',
  critical: 'bg-status-critical',
  offline: 'bg-status-offline',
  info: 'bg-status-info',
  neutral: 'bg-aqua-500',
}

/** Horizontal utilisation bar, clamped so bad data cannot overflow the track. */
export function Bar({ ratio, tone = 'neutral' }: BarProps) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-overlay"
      role="presentation"
    >
      <div
        className={clsx('h-full rounded-full transition-all', BAR_TONES[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

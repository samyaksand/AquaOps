import { clsx } from 'clsx'
import { ChevronDown } from 'lucide-react'
import type { SelectHTMLAttributes } from 'react'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly { value: string; label: string }[]
}

export function Select({ options, className, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={clsx(
          'w-full appearance-none rounded-lg bg-raised py-2 pr-8 pl-3',
          'text-sm text-ink ring-1 ring-inset ring-divider transition-colors',
          'hover:ring-ink-subtle/40 focus:ring-aqua-500',
          'disabled:pointer-events-none disabled:opacity-50',
          className,
        )}
        {...rest}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            className="bg-surface text-ink"
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden="true"
      />
    </div>
  )
}

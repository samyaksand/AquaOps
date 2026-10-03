/** Display formatting. Keeps number presentation consistent across panels. */

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function formatVolume(value: number): string {
  return whole.format(value)
}

export function formatCompact(value: number): string {
  return compact.format(value)
}

export function formatPopulation(value: number): string {
  return compact.format(value)
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`
}

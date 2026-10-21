import type { NetworkState } from '@/types/network'

/**
 * Derived network-wide figures. These are structural facts about the loaded
 * network — not allocation results, which the engine computes server-side.
 * Shared by MetricsBar and the Overview intro banner so both read the same
 * numbers instead of two independently-computed copies drifting apart.
 */
export function summarizeNetwork(network: NetworkState) {
  const supply = network.sources
    .filter((item) => item.state !== 'unavailable')
    .reduce((total, item) => total + item.available_m3_per_day, 0)

  const demand = network.demands.reduce(
    (total, item) => total + item.demand_m3_per_day,
    0,
  )

  const population = network.demands
    .filter((item) => item.kind === 'zone')
    .reduce((total, item) => total + item.population, 0)

  const facilities = network.demands.filter(
    (item) => item.kind === 'facility',
  ).length

  const tankersReady = network.tankers.filter(
    (item) => item.state === 'online',
  ).length

  const impaired = [...network.sources, ...network.transits, ...network.links]
    .filter((item) => item.state !== 'online').length

  return {
    supply,
    demand,
    population,
    facilities,
    tankersReady,
    impaired,
    coverage: demand > 0 ? Math.min(supply / demand, 1) : 1,
  }
}

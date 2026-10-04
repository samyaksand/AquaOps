/**
 * Presentation-layer name lookup. Internal codes (TP-ALPHA, DZ-DOWNTOWN, …)
 * are the domain's stable identifiers and stay in API/store state — this is
 * the one place that resolves a code to the human-readable name a user
 * should actually see, so no component hardcodes or re-derives that mapping.
 */

import { formatPercent } from '@/lib/format'
import type { NetworkState, ScenarioChangeIn } from '@/types/network'

/** Builds a code → display-name lookup from the current network. Entries for
 * sources, transits, demand points, and tankers — the only kinds a scenario
 * or pipeline can target — are included; an unknown code falls back to
 * itself only as a last resort (see `nameFor`). */
export function buildNameIndex(network: NetworkState | null): Record<string, string> {
  if (!network) return {}
  const index: Record<string, string> = {}
  for (const s of network.sources) index[s.code] = s.name
  for (const t of network.transits) index[t.code] = t.name
  for (const d of network.demands) index[d.code] = d.name
  for (const t of network.tankers) index[t.code] = t.name
  return index
}

/** Resolves one code to its display name, falling back to the raw code only
 * if the network hasn't loaded or the code is genuinely unknown — never
 * silently swallowed, so a real data gap stays visible rather than crashing. */
export function nameFor(
  index: Record<string, string>,
  code: string,
): string {
  return index[code] ?? code
}

/** "Alpha Treatment Plant → Downtown" instead of "TP-ALPHA → DZ-DOWNTOWN". */
export function linkLabel(
  index: Record<string, string>,
  sourceCode: string,
  targetCode: string,
): string {
  return `${nameFor(index, sourceCode)} → ${nameFor(index, targetCode)}`
}

/** One plain-language sentence for a scenario change, by human name rather
 * than code — shared between the scenario builder's own draft list and the
 * Normal vs Scenario impact banner, so "what changed" reads identically in
 * both places. */
export function describeScenarioChange(
  change: ScenarioChangeIn,
  names: Record<string, string>,
): string {
  const target = nameFor(names, change.target_code)
  switch (change.type) {
    case 'reduce_reservoir_supply':
      return `Reduce supply from ${target} by ${formatPercent(change.fraction)}`
    case 'reduce_treatment_capacity':
      return `Reduce capacity at ${target} by ${formatPercent(change.fraction)}`
    case 'reduce_pipeline_capacity':
      return `Reduce capacity on ${target} by ${formatPercent(change.fraction)}`
    case 'set_pipeline_unavailable':
      return `Take ${target} offline`
    case 'change_zone_demand':
      return `Scale demand at ${target} to ${formatPercent(change.factor)}`
    case 'change_facility_demand':
      return `Scale demand at ${target} to ${formatPercent(change.factor)}`
    case 'set_tanker_unavailable':
      return `Take ${target} out of service`
  }
}

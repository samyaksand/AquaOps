/**
 * Pure scenario-builder helpers, shared between the Scenario Lab's library
 * cards and its configure step so both read the same defaults and target
 * lists instead of two copies drifting apart. Nothing here calls the API or
 * touches a store.
 */

import { formatCompact } from '@/lib/format'
import { linkLabel } from '@/lib/labels'
import {
  PRIORITY_LABELS,
  SCENARIO_CHANGE_TARGET_KIND,
  type NetworkState,
  type ScenarioChangeIn,
  type ScenarioChangeType,
} from '@/types/network'

/** Default parameters for a freshly selected change type. */
export function defaultChange(
  type: ScenarioChangeType,
  targetCode: string,
): ScenarioChangeIn {
  switch (type) {
    case 'reduce_reservoir_supply':
      return { type, target_code: targetCode, fraction: 0.3 }
    case 'reduce_treatment_capacity':
      return { type, target_code: targetCode, fraction: 0.3 }
    case 'reduce_pipeline_capacity':
      return { type, target_code: targetCode, fraction: 0.3 }
    case 'set_pipeline_unavailable':
      return { type, target_code: targetCode }
    case 'change_zone_demand':
      return { type, target_code: targetCode, factor: 1.25 }
    case 'change_facility_demand':
      return { type, target_code: targetCode, factor: 1.25 }
    case 'set_tanker_unavailable':
      return { type, target_code: targetCode }
  }
}

/** Target options for a change type, drawn from the live network — pipeline
 * targets show "Source → Destination" by name, never the link code. Each
 * label is suffixed with one real, already-known number (supply, capacity,
 * or demand) so a user can see roughly how large a target is before picking
 * it — never a derived "impact score", just the plain figure the network
 * already reports for it. Sorted largest-first within each kind so the
 * targets most likely to matter surface before small, easy-to-miss ones.
 */
export function targetsFor(
  type: ScenarioChangeType,
  network: NetworkState | null,
  names: Record<string, string>,
): { value: string; label: string }[] {
  if (!network) return []
  const kind = SCENARIO_CHANGE_TARGET_KIND[type]
  switch (kind) {
    case 'source':
      return [...network.sources]
        .sort((a, b) => b.available_m3_per_day - a.available_m3_per_day)
        .map((s) => ({
          value: s.code,
          label: `${s.name} — ${formatCompact(s.available_m3_per_day)} m³/d`,
        }))
    case 'transit':
      return [...network.transits]
        .sort((a, b) => b.capacity_m3_per_day - a.capacity_m3_per_day)
        .map((t) => ({
          value: t.code,
          label: `${t.name} — ${formatCompact(t.capacity_m3_per_day)} m³/d`,
        }))
    case 'link':
      return [...network.links]
        .sort((a, b) => b.capacity_m3_per_day - a.capacity_m3_per_day)
        .map((l) => ({
          value: l.code,
          label: `${linkLabel(names, l.source_code, l.target_code)} — ${formatCompact(l.capacity_m3_per_day)} m³/d`,
        }))
    case 'zone':
      return [...network.demands]
        .filter((d) => d.kind === 'zone')
        .sort((a, b) => b.demand_m3_per_day - a.demand_m3_per_day)
        .map((d) => ({
          value: d.code,
          label: `${d.name} — ${formatCompact(d.demand_m3_per_day)} m³/d`,
        }))
    case 'facility':
      return [...network.demands]
        .filter((d) => d.kind === 'facility')
        .sort(
          (a, b) =>
            a.priority_rank - b.priority_rank ||
            b.demand_m3_per_day - a.demand_m3_per_day,
        )
        .map((d) => ({
          value: d.code,
          label: `${d.name} — ${PRIORITY_LABELS[d.priority_rank] ?? 'Unranked'}`,
        }))
    case 'tanker':
      return network.tankers.map((t) => ({ value: t.code, label: t.name }))
  }
}

/** The single largest-by-value eligible target for a change type, i.e. the
 * first entry `targetsFor` would return — used by the scenario library cards
 * to show one real current-network number without duplicating the sort. */
export function largestTargetFor(
  type: ScenarioChangeType,
  network: NetworkState | null,
  names: Record<string, string>,
): { value: string; label: string } | null {
  return targetsFor(type, network, names)[0] ?? null
}

/** Static, honest copy for the Scenario Library cards — describes what the
 * change does and what part of the network it touches. Never claims a
 * fabricated impact; the real numbers come from `largestTargetFor` and the
 * network itself, not from this map. */
export const SCENARIO_CARD_COPY: Record<
  ScenarioChangeType,
  { description: string }
> = {
  reduce_reservoir_supply: {
    description: 'Test the effect of reduced source availability.',
  },
  reduce_treatment_capacity: {
    description: 'Test a constrained treatment plant.',
  },
  reduce_pipeline_capacity: {
    description: 'Test a pipeline running below full capacity.',
  },
  set_pipeline_unavailable: {
    description: 'Test a severed network connection.',
  },
  change_zone_demand: {
    description: 'Explore pressure from a shift in zone demand.',
  },
  change_facility_demand: {
    description: 'Explore pressure from a shift in facility demand.',
  },
  set_tanker_unavailable: {
    description: 'Test losing a tanker from the delivery fleet.',
  },
}

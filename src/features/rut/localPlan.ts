import type { TerritoryState } from './territory'
import type { DayRank } from './recommendationText'
import { DISPLAY_EQUIVALENCE_POINTS, factorKey } from './recommendation'

function dateMillis(key: string): number {
  const value = Date.parse(`${key}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== key) throw new RangeError('Date de planification invalide')
  return value
}

/** Comparaison pratique seulement : aucun pic biologique déduit des prévisions. */
export function localPlan(dateKey: string, territory: TerritoryState, days: DayRank[]) {
  const start = dateMillis(dateKey)
  const endKey = new Date(start + 6 * 86_400_000).toISOString().slice(0, 10)
  const supported = territory === 'quebec'
  const available = supported ? days.filter((d) => d.dateKey >= dateKey && d.dateKey <= endKey && d.best !== null && d.best.composition !== 'activite_seule' && Number.isFinite(d.best.coreIndex) && d.best.coreIndex >= 0 && d.best.coreIndex <= 100) : []
  const distinct = new Map(available.map((d) => [d.dateKey, d]))
  const eligible = [...distinct.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const signatures = new Set(eligible.map((d) => `${d.best!.composition}:${factorKey(d.best!)}`))
  const comparable = signatures.size <= 1
  const ordered = comparable ? [...eligible].sort((a, b) => b.best!.coreIndex - a.best!.coreIndex || a.dateKey.localeCompare(b.dateKey)) : []
  const first = ordered[0]
  const second = ordered[1]
  const state = !supported || eligible.length < 2 ? 'insuffisant' : !comparable ? 'non_comparables' : first!.best!.coreIndex - second!.best!.coreIndex < DISPLAY_EQUIVALENCE_POINTS ? 'equivalents' : 'departage'
  return {
    supported, startKey: dateKey, endKey, eligible, ordered, state,
    bestDate: state === 'departage' ? first!.dateKey : null,
    regionalStart: `${dateKey.slice(0, 4)}-11-01`,
    regionalEnd: `${dateKey.slice(0, 4)}-12-31`,
  }
}

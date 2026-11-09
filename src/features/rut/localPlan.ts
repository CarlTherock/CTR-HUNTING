import type { TerritoryState } from './territory'
import { rankDays } from './recommendationText'
import type { DayRank } from './recommendationText'
import type { ClippedWindow } from './recommendation'

interface EligibleDay extends DayRank {
  best: ClippedWindow
}

function dateMillis(key: string): number {
  const value = Date.parse(`${key}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(value) || new Date(value).toISOString().slice(0, 10) !== key) throw new RangeError('Date de planification invalide')
  return value
}

/** Même classement que le texte général ; aucun pic biologique déduit des prévisions. */
export function localPlan(dateKey: string, territory: TerritoryState, days: DayRank[]) {
  const start = dateMillis(dateKey)
  const endKey = new Date(start + 6 * 86_400_000).toISOString().slice(0, 10)
  const supported = territory === 'quebec'
  const available = supported ? days.filter((d): d is EligibleDay => d.dateKey >= dateKey && d.dateKey <= endKey && d.best !== null && d.best.composition !== 'activite_seule' && Number.isFinite(d.best.coreIndex) && d.best.coreIndex >= 0 && d.best.coreIndex <= 100) : []
  const distinct = new Map(available.map((d) => [d.dateKey, d]))
  const eligible = [...distinct.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  const ranking = rankDays(eligible)
  const ordered = ranking.order.flatMap((key) => {
    const day = distinct.get(key)
    return day ? [day] : []
  })
  const first = ordered[0]
  return {
    supported, startKey: dateKey, endKey, eligible, ordered, state: ranking.state,
    bestDate: ranking.state === 'departage' && first ? first.dateKey : null,
    regionalStart: `${dateKey.slice(0, 4)}-11-01`,
    regionalEnd: `${dateKey.slice(0, 4)}-12-31`,
  }
}

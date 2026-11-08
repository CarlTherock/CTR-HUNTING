import { useMemo } from 'react'
import { Card } from '@/components/ui'
import { summarizeObservations } from '@/features/rut/observationsSummary'
import { recommend } from '@/features/rut/recommendation'
import { INDICATIVE_NOTICE, recommendationText } from '@/features/rut/recommendationText'
import { classifyTerritory } from '@/features/rut/territory'
import type { SavedHuntAnalysis } from '@/types'

/** Analyse autonome : aucune lecture du journal ou des traces. */
export function RecommendationCard({ record, dayIndex }: { record: SavedHuntAnalysis; dayIndex: number }) {
  const rec = useMemo(() => {
    const day = record.hunt.days[dayIndex]
    if (!day) return null
    const c = record.hunt.params.coordinate
    return recommend({ day, timeZone: record.timezone,
      territory: classifyTerritory(c.lat, c.lng).state,
      summary: summarizeObservations([], [], { timeZone: record.timezone }),
      hasPostInfo: record.hunt.params.favorableWindFrom.length > 0 || record.hunt.params.sensitiveBearings.length > 0,
    })
  }, [record, dayIndex])
  if (!rec) return null
  const text = recommendationText(rec)
  const missing = rec.missing.filter((m) => m.id !== 'observations' && m.id !== 'camera')
  return <Card className="space-y-3 p-3" data-testid="hunt-recommendation">
    <h3 className="text-ink-100 text-sm font-semibold">Lecture des conditions et du contexte saisonnier</h3>
    <ul className="text-ink-200 list-disc space-y-1 pl-5 text-sm">{text.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
    <p className="text-ink-300 text-sm">{rec.ranking.explanation}</p>
    <p className="text-ink-300 text-sm">{rec.seasonal.headline}</p>
    <p className="text-ink-400 text-xs">{rec.seasonal.limits}</p>
    {missing.length > 0 && <ul className="text-ink-400 list-disc space-y-1 pl-5 text-xs">{missing.map((m) => <li key={m.id}>{m.label} : {m.consequence}</li>)}</ul>}
    <p className="text-ink-400 text-xs">Journal et caméras facultatifs : leur absence ne bloque pas cette analyse et ne constitue pas un indice d’absence de cerfs.</p>
    <p className="text-ink-400 text-xs">{INDICATIVE_NOTICE}</p>
  </Card>
}

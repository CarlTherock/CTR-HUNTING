import { useMemo } from 'react'
import { Card } from '@/components/ui'
import { summarizeObservations } from '@/features/rut/observationsSummary'
import { recommend } from '@/features/rut/recommendation'
import { INDICATIVE_NOTICE, recommendationText } from '@/features/rut/recommendationText'
import { classifyTerritory } from '@/features/rut/territory'
import type { SavedHuntAnalysis } from '@/types'

/** Recommandation visible et autonome ; les précisions seules sont repliées. */
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
  return <Card className="border-brand-500/40 space-y-3 p-4" data-testid="hunt-recommendation">
    <h2 className="text-brand-300 text-sm font-semibold">Recommandation</h2>
    <p className="text-ink-100 text-lg leading-snug font-semibold">{text.headline}</p>
    <ul className="text-ink-200 list-disc space-y-1 pl-5 text-sm">{text.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
    {text.alternative && <p className="text-ink-300 text-sm">{text.alternative}</p>}
    <p className="text-ink-300 text-sm">{rec.ranking.explanation}</p>
    <details className="border-surface-700 rounded-lg border">
      <summary className="text-ink-100 min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold">Contexte saisonnier, informations manquantes et hypothèses</summary>
      <div className="border-surface-700 space-y-3 border-t p-3">
        <section><h3 className="text-ink-100 text-sm font-semibold">Contexte saisonnier</h3><p className="text-ink-300 text-sm">{rec.seasonal.headline}</p><p className="text-ink-400 text-xs">{rec.seasonal.limits}</p>{rec.seasonal.breedingContext && <p className="text-ink-400 text-xs">{rec.seasonal.breedingContext}</p>}<p className="text-ink-400 text-xs">{rec.seasonal.dayRanking}</p></section>
        {missing.length > 0 && <section><h3 className="text-ink-100 text-sm font-semibold">Informations manquantes et conséquences</h3><ul className="text-ink-400 mt-1 list-disc space-y-1 pl-5 text-xs">{missing.map((m) => <li key={m.id}>{m.label} : {m.consequence}</li>)}</ul></section>}
        <p className="text-ink-400 text-xs">Journal et caméras facultatifs : leur absence ne bloque pas cette analyse et ne constitue pas un indice d’absence de cerfs.</p>
        <p className="text-ink-400 text-xs">{rec.separation} Méthode : {rec.methodVersion}. Formule et sources détaillées dans les sections du dashboard.</p>
      </div>
    </details>
    <p className="text-ink-400 text-xs">{INDICATIVE_NOTICE}</p>
  </Card>
}

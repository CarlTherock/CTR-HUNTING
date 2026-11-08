import { Card } from '@/components/ui'
import type { HuntAnalysis } from '../engine'
import { getRule } from '../rules/registry'
import type { SpatialAnalysis } from '../spatial'

/** COMMENT Y ACCÉDER : vent, zone sensible et accès — seulement ce qui est renseigné. */
export function HowTab({
  hunt,
  spatial,
}: {
  hunt: HuntAnalysis
  spatial: SpatialAnalysis | null
}) {
  const p = hunt.params
  const rule = getRule('CND-WIND-DIRECTION-01')
  const windInfo = hunt.days[0]?.slots
    .filter((s) => s.candidate && s.weather?.windFromDegrees != null)
    .slice(0, 24)
  const lowWind = windInfo?.some((s) => (s.weather?.windSpeedKmh ?? 99) < 5)
  return (
    <section aria-label="Formule, méthodologie et limites" className="flex flex-col gap-4">
      <Card className="p-3 text-sm">
        <h2 className="text-ink-100 font-semibold">Vent et zone sensible</h2>
        {p.favorableWindFrom.length === 0 && p.sensitiveBearings.length === 0 ? (
          <p className="text-ink-300 mt-1">
            Aucun vent favorable ni zone sensible renseigné : la compatibilité du vent est
            « non évaluée » (jamais 0 ni 50). Renseignez-les dans les paramètres pour
            comparer des créneaux et des accès.
          </p>
        ) : (
          <ul className="text-ink-300 mt-1 list-disc pl-5">
            {p.favorableWindFrom.length > 0 && (
              <li>
                Vents favorables au poste (provenance) : {p.favorableWindFrom.join('°, ')}
                °.
              </li>
            )}
            {p.sensitiveBearings.length > 0 && (
              <li>
                Zone sensible vers les caps : {p.sensitiveBearings.join('°, ')}° — l’odeur
                portée par le vent vers ces caps est signalée dans les facteurs du
                créneau.
              </li>
            )}
          </ul>
        )}
        {lowWind && (
          <p className="text-status-warning mt-2">
            Vent très faible certaines heures : sa direction n’est pas fiable.
          </p>
        )}
        <p className="text-ink-500 mt-2 text-xs">
          {rule?.result} Le vent de modèle à 10 m n’est pas un vent sous couvert, et
          aucune distance de détection n’est affirmée. Le cône du vent est une
          illustration.
        </p>
      </Card>
      <Card className="p-3 text-sm">
        <h2 className="text-ink-100 font-semibold">Accès</h2>
        <p className="text-ink-300 mt-1">
          Aucun trajet d’accès n’est calculé. Relevez vous-même un accès qui ne pousse pas
          l’odeur vers la zone tranquille et gardez au moins deux postes alternatifs à bon
          vent
          {spatial && spatial.candidates.length >= 2
            ? ` — les points ${spatial.candidates
                .slice(0, 2)
                .map((c) => c.id)
                .join(' et ')} de l’onglet OÙ peuvent servir de point de départ.`
            : '.'}
        </p>
        <p className="text-ink-500 mt-1 text-xs">
          Recommandation de praticien (Louis Gagnon, « Chevreuils nocturnes ») — ce n’est
          ni un résultat scientifique ni un « modèle Louis Gagnon ».
        </p>
      </Card>
    </section>
  )
}

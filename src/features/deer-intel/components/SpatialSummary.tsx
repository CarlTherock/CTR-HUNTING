import { useNavigate } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { formatLatitude, formatLongitude } from '@/utils/coordinateFormat'
import type { SpatialAnalysis } from '../spatial'
import { useHuntStore } from '../state/huntStore'
import { ServiceCheck } from './ServiceCheck'

/** Couverture des données et classement habitat sont deux informations distinctes. */
export function SpatialSummary({ spatial }: { spatial: SpatialAnalysis | null }) {
  const navigate = useNavigate()
  const requestFocus = useHuntStore((s) => s.requestMapFocus)
  const top = spatial?.candidates[0] ?? null
  const coverage = spatial && Number.isFinite(spatial.coverage) && spatial.coverage >= 0 && spatial.coverage <= 1 ? spatial.coverage : null
  const percent = coverage === null ? null : Math.round(coverage * 1000) / 10
  const date = spatial?.source ? new Date(spatial.source.fetchedAt) : null
  const fetchedAt = date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('fr-CA', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }).format(date)
    : null
  return (
    <Card className="min-w-0 p-3">
      <h2 className="text-ink-300 flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase"><MapPin size={14} aria-hidden="true" /> Où</h2>
      {spatial ? (
        <>
          <div className="border-surface-700 bg-surface-950 mt-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-ink-300 text-sm">Couverture des données</p>
              <p className="text-ink-100 text-xl font-semibold tabular-nums">{percent === null ? 'Indisponible' : `${percent.toLocaleString('fr-CA')} %`}</p>
            </div>
            {percent !== null && <div role="progressbar" aria-label="Couverture des données cartographiques" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="bg-surface-700 mt-2 h-2 overflow-hidden rounded-full"><div className="h-full rounded-full bg-sky-400" style={{ width: `${percent}%` }} /></div>}
            <p className="text-ink-400 mt-2 text-xs">Part des cellules classées dans l’emprise, pas un score habitat ni une probabilité de présence. Une zone sans donnée n’est pas une zone défavorable.</p>
          </div>
          {coverage === 0 ? <p className="text-ink-300 mt-3 text-sm">Aucune cellule classée dans cette emprise : aucun lieu favorable ne peut être déduit de ces données.</p> : top ? (
            <div className="mt-3 text-sm">
              <p className="text-ink-100"><strong>Point {top.id}</strong> — rang {top.grade}, {top.score}/100</p>
              <p className="text-ink-300 mt-1">{top.reasons.slice(0, 2).join(' · ')}</p>
              <p className="text-ink-500 mt-1 text-xs">Classement comparatif d’habitat, pas une garantie de présence. Accès et autorisation de chasse à vérifier séparément.</p>
            </div>
          ) : <p className="text-ink-300 mt-3 text-sm">Aucun point candidat défendable dans l’emprise de {spatial.extent.radiusM} m. {coverage !== null && coverage > 0 ? 'Des données sont présentes, mais aucun point ne répond aux critères actuels.' : 'La couverture doit être vérifiée avant toute interprétation.'}</p>}
          <p className="text-ink-500 mt-2 text-xs">{spatial.sectors.length} secteur(s) · {formatLatitude(spatial.extent.center.lat)} {formatLongitude(spatial.extent.center.lng)} · rayon {spatial.extent.radiusM} m</p>
          <p className="text-ink-500 mt-1 break-words text-xs">Source : {spatial.source?.name ?? 'non renseignée'} · {fetchedAt ? `données récupérées le ${fetchedAt} UTC` : 'date de récupération indisponible'} · calcul spatial {spatial.engineVersion}</p>
        </>
      ) : (
        <>
          <p className="text-ink-300 mt-2 text-sm">Aucune donnée d’occupation du sol exploitable pour afficher des secteurs ou des points. Consultez les messages ci-dessus pour la cause. Rien n’est inventé.</p>
          <ServiceCheck />
        </>
      )}
      <Button type="button" className="mt-3 w-full" disabled={!spatial} onClick={() => { requestFocus(); navigate('/map') }}>Voir sur la carte</Button>
    </Card>
  )
}

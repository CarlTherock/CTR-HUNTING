import { useNavigate } from 'react-router-dom'
import { Button, Card } from '@/components/ui'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { formatLatitude, formatLongitude } from '@/utils/coordinateFormat'
import type { SpatialAnalysis } from '../spatial'
import { useHuntStore } from '../state/huntStore'

const GRADE_TEXT: Record<string, string> = {
  A: 'Rang A (≥ 75)',
  B: 'Rang B (60–74)',
  C: 'Rang C (50–59)',
}

/** OÙ : secteurs, points candidats classés A/B/C, corridors (non calculés), carte. */
export function WhereTab({ spatial }: { spatial: SpatialAnalysis | null }) {
  const navigate = useNavigate()
  const startDraftAt = useWaypointsStore((s) => s.startDraftAt)
  const mapVisible = useHuntStore((s) => s.mapVisible)
  const opacity = useHuntStore((s) => s.sectorOpacity)
  const setMapVisible = useHuntStore((s) => s.setMapVisible)
  const setOpacity = useHuntStore((s) => s.setSectorOpacity)

  if (!spatial) {
    return (
      <Card className="p-3 text-sm">
        <p className="text-ink-100 font-semibold">Aucune donnée d’occupation du sol</p>
        <p className="text-ink-300 mt-1">
          Les secteurs et points candidats demandent une connexion pour récupérer
          l’occupation du sol (OpenStreetMap). Les créneaux (QUAND) restent disponibles.
          Rien n’est inventé à la place.
        </p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-3">
        <h2 className="text-ink-100 text-sm font-semibold">Secteurs d’habitat</h2>
        <p className="text-ink-300 mt-1 text-sm">
          {spatial.sectors.length} secteur(s) au-dessus du seuil absolu de 60/100 ;
          couverture des données {Math.round(spatial.coverage * 100)} % (séparée du score
          : une zone sans donnée n’est jamais « peu favorable »). Rayon{' '}
          {spatial.extent.radiusM} m ancré sur le point choisi — il ne bouge pas avec la
          carte.
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {spatial.sectors.map((s) => (
            <li key={s.id} className="bg-surface-800 text-ink-100 rounded-md px-3 py-2">
              <strong>
                {s.id} · rang {s.rank}
              </strong>{' '}
              — {s.areaHa} ha · score moyen {s.meanScore}/100
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-ink-300 flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mapVisible}
              onChange={(e) => setMapVisible(e.target.checked)}
              className="size-5"
            />
            Afficher sur la carte
          </label>
          <label className="text-ink-300 flex min-h-11 items-center gap-2 text-sm">
            Transparence
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              aria-label="Opacité des secteurs"
            />
          </label>
          <Button variant="secondary" onClick={() => navigate('/map')}>
            Voir la carte
          </Button>
        </div>
      </Card>

      <Card className="p-3">
        <h2 className="text-ink-100 text-sm font-semibold">Points candidats</h2>
        {spatial.candidates.length === 0 ? (
          <p className="text-ink-300 mt-1 text-sm">
            Aucun point n’atteint le seuil minimal (50/100).
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {spatial.candidates.map((c) => (
              <li key={c.id} className="bg-surface-800 rounded-md p-3 text-sm">
                <p className="text-ink-100 font-semibold">
                  {c.id} · {GRADE_TEXT[c.grade]} · {c.score}/100
                </p>
                <p className="text-ink-300 tabular-nums">
                  {formatLatitude(c.coordinate.lat)} · {formatLongitude(c.coordinate.lng)}{' '}
                  · {c.distanceFromCenterM} m du point
                  {c.sectorId ? ` · secteur ${c.sectorId}` : ''}
                </p>
                <p className="text-ink-300">{c.reasons.join(' ; ')}</p>
                <details className="mt-1">
                  <summary className="text-ink-500 min-h-11 cursor-pointer text-xs">
                    Données manquantes
                  </summary>
                  <ul className="text-ink-500 list-disc pl-5 text-xs">
                    {c.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </details>
                <Button
                  variant="secondary"
                  size="md"
                  className="mt-2"
                  onClick={() => {
                    startDraftAt(c.coordinate, `Point candidat ${c.id}`)
                    navigate('/map')
                  }}
                >
                  Créer un repère
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-ink-500 mt-2 text-xs">
          Rang comparatif d’habitat (couvert forestier proche d’un milieu nourricier), pas
          une probabilité de présence ni de récolte. Aucun point n’est placé sur l’eau, le
          bâti ou une zone exclue ; espacement minimal 150 m.
        </p>
      </Card>

      <Card className="p-3">
        <h2 className="text-ink-100 text-sm font-semibold">Corridors potentiels</h2>
        {spatial.corridors.computed ? (
          <>
            <p className="text-ink-300 mt-1 text-sm">{spatial.corridors.label}</p>
            {spatial.corridors.corridors.length === 0 ? (
              <p className="text-ink-400 mt-1 text-sm">Aucun tracé calculé.</p>
            ) : (
              <ul className="text-ink-300 mt-2 space-y-1 text-sm">
                {spatial.corridors.corridors.map((c) => (
                  <li key={c.id}>
                    {c.kind === 'alternative' ? 'Alternative' : 'Principal'} — noyau{' '}
                    {c.fromCore + 1} ↔ {c.toCore + 1} : {c.lengthM} m
                    {c.robustness === 'non_evalue' ? '' : `, ${c.robustness}`}
                  </li>
                ))}
              </ul>
            )}
            {spatial.corridors.contactIndexMPerHa !== null && (
              <p className="text-ink-300 mt-2 text-sm">
                Indice d’entremêlement couvert/nourriture :{' '}
                {spatial.corridors.contactIndexMPerHa.toFixed(1)} m/ha (
                {Math.round(spatial.corridors.contactLengthM)} m de contact, surface =
                emprise fixe).
              </p>
            )}
            {spatial.corridors.notes.map((n) => (
              <p key={n} className="text-ink-400 mt-1 text-xs">
                {n}
              </p>
            ))}
          </>
        ) : (
          <p className="text-ink-300 mt-1 text-sm">{spatial.corridors.reason}</p>
        )}
        <p className="text-ink-500 mt-1 text-xs">
          Heuristique : résistances de conception non calibrées. Un corridor animal se
          distingue de l’accès du chasseur et des traces enregistrées ; aucun passage,
          fréquentation ou heure n’est déduit.
        </p>
      </Card>
    </div>
  )
}

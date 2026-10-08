import { useEffect, useMemo, useState } from 'react'
import { ArrowUp, Wind } from 'lucide-react'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { cn } from '@/utils/cn'
import { compassLabel } from '@/utils/terrain'
import type { Coordinate } from '@/types'
import { useWindStore } from '../state/windStore'
import {
  FAVORABILITY_LABEL,
  sectorsLabel,
  windFavorability,
  windHourlyRow,
} from '../windSummary'
import { WindCompass } from './WindCompass'

const BOX = 0.15 // degrees around the point: one small batched Open-Meteo request

/**
 * Wind presentation for the Météo page, built only on data the app already
 * has (Open-Meteo hourly wind through `windStore`): origin direction, speed,
 * gusts, hour. The hour selected here is the shared timeline cursor, so the
 * map's wind layer and the charts follow. « Favorable » only compares the
 * wind with sectors the user saved on a spot — it is not a prediction of
 * animal movement.
 */
export function WindPanel({ coordinate }: { coordinate: Coordinate }) {
  const field = useWindStore((s) => s.field)
  const status = useWindStore((s) => s.status)
  const errorReason = useWindStore((s) => s.errorReason)
  const fetchedAt = useWindStore((s) => s.fetchedAt)
  const selected = useWindStore((s) => s.selectedHourOffset)
  const setSelected = useWindStore((s) => s.setSelectedHourOffset)
  const fetchField = useWindStore((s) => s.fetch)
  const waypoints = useWaypointsStore((s) => s.waypoints)

  const spots = useMemo(
    () => waypoints.filter((w) => (w.optimalWindDirections?.length ?? 0) > 0),
    [waypoints],
  )
  const [spotId, setSpotId] = useState<string>('')
  const spot = spots.find((w) => w.id === spotId)

  const rows = useMemo(() => windHourlyRow(field, coordinate, 0, 48), [field, coordinate])
  const lat = coordinate.lat
  const lng = coordinate.lng
  useEffect(() => {
    // Only fetch when nothing usable covers this point (no field, or the
    // field loaded for another map area).
    if (status === 'loading' || rows.length > 0 || status === 'error') return
    void fetchField({ west: lng - BOX, east: lng + BOX, south: lat - BOX, north: lat + BOX })
  }, [rows.length, status, fetchField, lat, lng])

  const current = rows.find((r) => r.offset === selected) ?? rows[0]
  const favorability = current
    ? windFavorability(current.directionDegrees, spot?.optimalWindDirections)
    : 'non-renseigne'

  return (
    <Card id="vent">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wind size={16} aria-hidden="true" /> Vent
        </CardTitle>
        <CardDescription>
          Prévision Open-Meteo (modèle), pas une mesure sur place
          {fetchedAt ? ` · chargée à ${new Date(fetchedAt).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === 'loading' && rows.length === 0 && (
          <p className="text-ink-500 text-sm">Chargement du vent…</p>
        )}
        {status === 'error' && rows.length === 0 && (
          <p role="alert" className="text-status-danger text-sm">
            Vent indisponible : {errorReason ?? 'fournisseur injoignable'}.{' '}
            <button
              type="button"
              className="text-brand-400 min-h-11 underline"
              onClick={() =>
                void fetchField({ west: lng - BOX, east: lng + BOX, south: lat - BOX, north: lat + BOX })
              }
            >
              Réessayer
            </button>
          </p>
        )}

        {current && (
          <>
            <div className="flex items-center gap-4">
              <WindCompass
                directionDegrees={current.directionDegrees}
                speedKmh={current.speedKmh}
                optimalDirections={spot?.optimalWindDirections}
                size={150}
              />
              <div className="min-w-0">
                <p className="text-ink-500 text-xs">Vent de</p>
                <p className="text-ink-100 text-lg font-semibold">
                  {current.directionLabel} ({Math.round(current.directionDegrees)}°)
                </p>
                <p className="text-ink-100 text-3xl leading-none font-bold">
                  {Math.round(current.speedKmh)}
                  <span className="text-ink-500 ml-1 text-sm font-normal">km/h</span>
                </p>
                <p className="text-ink-500 mt-1 text-sm">
                  Rafales {Math.round(current.gustsKmh)} km/h · {current.hourLabel}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  favorability === 'favorable'
                    ? 'success'
                    : favorability === 'defavorable'
                      ? 'danger'
                      : 'neutral'
                }
              >
                {FAVORABILITY_LABEL[favorability]}
              </Badge>
              <label className="text-ink-500 flex items-center gap-2 text-xs">
                Spot de référence
                <select
                  value={spotId}
                  onChange={(e) => setSpotId(e.target.value)}
                  className="border-surface-600 bg-surface-800 text-ink-100 min-h-11 rounded-md border px-2 text-sm"
                >
                  <option value="">Aucun</option>
                  {spots.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {spot && (
              <p className="text-ink-500 text-xs">
                Secteurs favorables enregistrés pour « {spot.name} » :{' '}
                {sectorsLabel(spot.optimalWindDirections)} (en vert sur la boussole).
              </p>
            )}

            <div
              role="group"
              aria-label="Vent heure par heure"
              className="flex gap-2 overflow-x-auto pb-2"
            >
              {rows.slice(0, 24).map((row) => (
                <button
                  key={row.offset}
                  type="button"
                  aria-pressed={row.offset === selected}
                  onClick={() => setSelected(row.offset)}
                  className={cn(
                    'flex min-h-11 min-w-[64px] shrink-0 flex-col items-center gap-0.5 rounded-lg border p-2 text-xs',
                    row.offset === selected
                      ? 'border-brand-400 bg-brand-500/15 text-brand-400'
                      : 'border-surface-600 text-ink-300',
                  )}
                >
                  <span>{row.hourLabel}</span>
                  <ArrowUp
                    size={16}
                    aria-hidden="true"
                    style={{ transform: `rotate(${row.directionDegrees}deg)` }}
                  />
                  <span className="text-ink-100 font-semibold">{Math.round(row.speedKmh)}</span>
                  <span className="text-ink-500">{compassLabel(row.directionDegrees)}</span>
                </button>
              ))}
            </div>

            <ul className="text-ink-500 list-disc pl-4 text-xs">
              <li>La flèche pleine de la boussole pointe vers la provenance du vent (vent de…).</li>
              <li>Chaque heure : flèche vers la provenance, vitesse en km/h, rafales dans le détail.</li>
              <li>
                Le cap du téléphone, l’orientation de la carte et la direction vers une
                destination sont d’autres repères, affichés ailleurs.
              </li>
              <li>Indication de vent seulement : aucune prévision de déplacement du gibier.</li>
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { useNow } from '@/hooks/useNow'
import type { Coordinate, SavedForecastPlace } from '@/types'
import {
  DEFAULT_DOWNLOAD_DAYS,
  DOWNLOAD_PERIODS,
  WIND_ZONE_HALF_DEGREES,
  expectedDates,
  formatDateKey,
  windZoneSizeKm,
  windZoneBounds,
} from '../offline/savedForecastLogic'
import { useSavedForecastsStore } from '../offline/savedForecastsStore'
import { SavedForecastItem } from './SavedForecastItem'

type Choice = 'gps' | 'map-center' | 'waypoint'

/**
 * « Télécharger pour ma sortie » — saves a point forecast and a 5 × 5 wind grid
 * around a place so the Météo page and the wind analysis keep working offline.
 */
export function OutingDownloadCard({
  gps,
  mapCenter,
}: {
  gps: Coordinate | null
  mapCenter: Coordinate
}) {
  const online = useOnlineStatus()
  const now = useNow(60_000)
  const waypoints = useWaypointsStore((s) => s.waypoints)
  const items = useSavedForecastsStore((s) => s.items)
  const loaded = useSavedForecastsStore((s) => s.loaded)
  const busy = useSavedForecastsStore((s) => s.busy)
  const outcome = useSavedForecastsStore((s) => s.outcome)
  const loadError = useSavedForecastsStore((s) => s.loadError)
  const load = useSavedForecastsStore((s) => s.load)
  const download = useSavedForecastsStore((s) => s.download)
  const remove = useSavedForecastsStore((s) => s.remove)

  const [choice, setChoice] = useState<Choice>(gps ? 'gps' : 'map-center')
  const [waypointId, setWaypointId] = useState('')
  const [days, setDays] = useState(DEFAULT_DOWNLOAD_DAYS)

  useEffect(() => {
    void load()
  }, [load])

  const place: SavedForecastPlace | null = useMemo(() => {
    if (choice === 'gps' && gps) {
      return { kind: 'gps', name: 'Ma position', coordinate: gps }
    }
    if (choice === 'waypoint') {
      const wp = waypoints.find((w) => w.id === waypointId)
      return wp
        ? {
            kind: 'waypoint',
            name: wp.name,
            coordinate: wp.coordinate,
            waypointId: wp.id,
          }
        : null
    }
    return { kind: 'map-center', name: 'Centre de la carte', coordinate: mapCenter }
  }, [choice, gps, mapCenter, waypointId, waypoints])

  const period = DOWNLOAD_PERIODS.find((p) => p.days === days) ?? DOWNLOAD_PERIODS[2]
  const dates = expectedDates(now, period.days)
  const zone = place ? windZoneSizeKm(windZoneBounds(place.coordinate)) : null

  return (
    <Card
      id="outing-download"
      tabIndex={-1}
      data-testid="outing-download"
      className="scroll-mt-4 outline-none"
    >
      <CardHeader>
        <CardTitle>Télécharger pour ma sortie</CardTitle>
        <CardDescription>
          Enregistre sur l’appareil les prévisions météo et de vent d’un lieu, pour les
          consulter sans réseau. Ce sont des prévisions, pas des mesures en direct.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink-300 mb-1 text-xs font-semibold">Lieu</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ['gps', 'Ma position', gps !== null],
                ['map-center', 'Centre de la carte', true],
                ['waypoint', 'Un repère', waypoints.length > 0],
              ] as const
            ).map(([value, label, enabled]) => (
              <Button
                key={value}
                size="md"
                variant={choice === value ? 'primary' : 'secondary'}
                aria-pressed={choice === value}
                disabled={!enabled}
                onClick={() => setChoice(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {!gps && (
            <p className="text-ink-500 text-xs">
              Position GPS indisponible : choisissez le centre de la carte ou un repère.
            </p>
          )}
          {choice === 'waypoint' && (
            <select
              aria-label="Repère"
              value={waypointId}
              onChange={(e) => setWaypointId(e.target.value)}
              className="border-surface-600 bg-surface-900 text-ink-100 h-11 rounded-lg border px-3 text-sm"
            >
              <option value="">Choisir un repère…</option>
              {waypoints.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-ink-300 mb-1 text-xs font-semibold">Période</legend>
          <div className="flex flex-wrap gap-2">
            {DOWNLOAD_PERIODS.map((p) => (
              <Button
                key={p.days}
                size="md"
                variant={days === p.days ? 'primary' : 'secondary'}
                aria-pressed={days === p.days}
                onClick={() => setDays(p.days)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <p className="text-ink-300 text-xs" data-testid="download-dates">
            {period.hint}. Dates couvertes : du {formatDateKey(dates.from)} au{' '}
            {formatDateKey(dates.to)} ({dates.count} jour{dates.count > 1 ? 's' : ''},
            calendrier du lieu, selon le fournisseur).
          </p>
        </fieldset>

        {place && zone && (
          <p className="text-ink-500 text-xs">
            Lieu de référence : {place.name} ({place.coordinate.lat.toFixed(4)},{' '}
            {place.coordinate.lng.toFixed(4)}). Le vent est téléchargé sur une grille de 5
            × 5 points d’environ {Math.round(zone.widthKm)} × {Math.round(zone.heightKm)}{' '}
            km (±{WIND_ZONE_HALF_DEGREES}°) : ce n’est pas un champ couvrant tout un
            territoire. Données météo Open-Meteo.com (licence CC BY 4.0).
          </p>
        )}

        <Button
          size="lg"
          onClick={() => place && void download(place, days)}
          disabled={!online || busy || !place}
        >
          <Download size={18} aria-hidden="true" />
          {busy ? 'Téléchargement…' : 'Télécharger pour ma sortie'}
        </Button>
        {!online && (
          <Badge variant="warning">
            Hors ligne : le téléchargement demande une connexion.
          </Badge>
        )}

        {outcome && (
          <p
            role="status"
            data-testid="download-outcome"
            className={
              outcome.kind === 'complete'
                ? 'text-status-success text-sm'
                : 'text-status-warning text-sm'
            }
          >
            {outcome.kind === 'complete'
              ? 'Téléchargement complet : vent et météo enregistrés pour toute la période.'
              : outcome.message}
          </p>
        )}
        {loadError && (
          <p role="alert" className="text-status-danger text-xs">
            Lecture des téléchargements impossible ({loadError}).
          </p>
        )}

        <div>
          <h3 className="text-ink-300 mb-2 text-xs font-semibold">
            Téléchargements enregistrés ({items.length})
          </h3>
          {loaded && items.length === 0 && (
            <p className="text-ink-500 text-xs">Aucune prévision enregistrée.</p>
          )}
          <ul className="flex flex-col gap-2">
            {items.map((saved) => (
              <SavedForecastItem
                key={saved.id}
                saved={saved}
                now={now}
                online={online}
                busy={busy}
                onUpdate={() => void download(saved.place, saved.requestedDays)}
                onDelete={() => void remove(saved.id)}
              />
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

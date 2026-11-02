import { useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import type { PointDaily, PointHourly, SavedForecast } from '@/types'
import {
  describeSavedStatus,
  formatDateKey,
  formatFetchedAt,
} from '../offline/savedForecastLogic'

/** « indisponible » is never shown as 0. */
function num(value: number | null, unit: string, digits = 0): string {
  return value === null ? 'indisponible' : `${value.toFixed(digits)} ${unit}`.trim()
}

function DailyRow({ day }: { day: PointDaily }) {
  return (
    <li className="border-surface-700 flex flex-wrap justify-between gap-x-3 border-b py-1.5 text-xs last:border-0">
      <span className="text-ink-100 font-medium">{formatDateKey(day.date)}</span>
      <span className="text-ink-300">
        min {num(day.temperatureMinCelsius, '°C')} · max{' '}
        {num(day.temperatureMaxCelsius, '°C')} · vent max{' '}
        {num(day.windSpeedMaxKmh, 'km/h')} · rafales {num(day.windGustsMaxKmh, 'km/h')}
      </span>
    </li>
  )
}

function HourRow({ hour }: { hour: PointHourly }) {
  return (
    <li className="border-surface-700 grid grid-cols-[3rem_1fr] gap-x-2 border-b py-1 text-xs last:border-0">
      <span className="text-ink-100 font-medium">{hour.time.slice(11, 16)}</span>
      <span className="text-ink-300">
        {num(hour.temperatureCelsius, '°C')} · pluie {num(hour.precipitationMm, 'mm', 1)}{' '}
        · vent {num(hour.windSpeedKmh, 'km/h')} (
        {num(hour.windDirectionDegrees, '° d’où')}) · rafales{' '}
        {num(hour.windGustsKmh, 'km/h')}
      </span>
    </li>
  )
}

export function SavedForecastItem({
  saved,
  now,
  online,
  busy,
  onUpdate,
  onDelete,
}: {
  saved: SavedForecast
  now: Date
  online: boolean
  busy: boolean
  onUpdate: () => void
  onDelete: () => void
}) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const status = describeSavedStatus(saved, now, online)
  const badge = status.kinds.includes('expired')
    ? 'danger'
    : status.kinds.includes('stale') || status.kinds.includes('partial')
      ? 'warning'
      : 'success'
  const dateKey = saved.point?.hourly[0]?.time.slice(0, 10)
  const firstDay = open ? (dateKey ?? null) : null
  const hours = saved.point && firstDay ? saved.point.hourly : []

  return (
    <li className="border-surface-700 rounded-lg border p-3" data-testid="saved-forecast">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink-100 text-sm font-semibold">{saved.place.name}</p>
          <p className="text-ink-500 text-xs">
            {saved.place.coordinate.lat.toFixed(4)},{' '}
            {saved.place.coordinate.lng.toFixed(4)} · {saved.timezone}
          </p>
        </div>
        <Badge variant={badge}>
          {saved.status === 'complete' ? 'Complet' : 'Partiel'}
        </Badge>
      </div>
      <ul className="text-ink-300 mt-1.5 space-y-0.5 text-xs">
        {status.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
        <li className="text-ink-500">
          Téléchargé le {formatFetchedAt(saved.fetchedAt)} · {saved.provider.name} ·
          format v{saved.formatVersion} · {saved.requestedDays} jour
          {saved.requestedDays > 1 ? 's' : ''} · {saved.units.temperature},{' '}
          {saved.units.speed}, {saved.units.precipitation}
        </li>
      </ul>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Masquer' : 'Consulter'}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onUpdate}
          disabled={!online || busy}
          title={online ? undefined : 'Connexion requise pour mettre à jour'}
        >
          <RefreshCw size={14} aria-hidden="true" />
          Mettre à jour
        </Button>
        {confirmDelete ? (
          <>
            <Button size="sm" variant="danger" onClick={onDelete}>
              Confirmer la suppression
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} aria-hidden="true" />
            Supprimer
          </Button>
        )}
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          {!saved.point && (
            <p className="text-status-warning text-xs">
              Prévisions météo ponctuelles non enregistrées (téléchargement partiel).
            </p>
          )}
          {saved.point && (
            <>
              <ul>
                {saved.point.daily.map((d) => (
                  <DailyRow key={d.date} day={d} />
                ))}
              </ul>
              <ul className="max-h-64 overflow-y-auto">
                {hours.map((h) => (
                  <HourRow key={h.time} hour={h} />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </li>
  )
}

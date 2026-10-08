import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CloudSun, RefreshCw } from 'lucide-react'
import { Badge, Button } from '@/components/ui'
import { useMapStore } from '@/features/map/state/mapStore'
import { useWeatherStore } from '@/features/weather/state/weatherStore'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { formatSignedDecimal } from '@/utils/coordinateFormat'
import { formatNumberFr } from '@/utils/format'
import { summarizeWeather } from '../summary'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

/**
 * Weather and wind summary. It shows only real data already on the device
 * (the last forecast saved by the Météo page) or loads one on request, with
 * the existing Open-Meteo provider. It never reads the GPS (so the home page
 * can never trigger a permission prompt) and never invents a value.
 */
export function WeatherCard() {
  const status = useWeatherStore((s) => s.status)
  const forecast = useWeatherStore((s) => s.forecast)
  const isCached = useWeatherStore((s) => s.isCached)
  const fetchedAt = useWeatherStore((s) => s.fetchedAt)
  const coordinate = useWeatherStore((s) => s.coordinate)
  const errorReason = useWeatherStore((s) => s.errorReason)
  const loadCached = useWeatherStore((s) => s.loadCached)
  const fetchWeather = useWeatherStore((s) => s.fetch)
  const mapCenter = useMapStore((s) => s.view.center)
  const isOnline = useOnlineStatus()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    void loadCached()
  }, [loadCached])

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  // Where a refresh would look: the place of the last forecast, else the map
  // centre. Never the GPS, and shown to the user before they press anything.
  const target = coordinate ?? mapCenter
  const targetLabel = coordinate
    ? `la position de la dernière prévision (${formatSignedDecimal(target.lat, target.lng, 3)})`
    : `le centre de la carte (${formatSignedDecimal(target.lat, target.lng, 3)})`
  const loading = status === 'loading'

  const summary = forecast ? summarizeWeather(forecast, fetchedAt, isCached, now) : null

  return (
    <DashboardCard icon={CloudSun} title="Météo et vent">
      {summary ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={summary.freshness === 'current' ? 'success' : 'warning'}>
              {summary.freshness === 'current' ? 'Actuel' : 'Enregistré'}
            </Badge>
            <span className="text-ink-500 text-xs">
              {summary.currentTime} (heure du lieu) · obtenu {summary.ageLabel}
            </span>
          </div>
          <p className="text-ink-100 text-sm">
            {formatNumberFr(summary.conditions.temperatureCelsius, 1)} °C · vent{' '}
            {formatNumberFr(summary.conditions.windSpeedKmh)} km/h (rafales{' '}
            {formatNumberFr(summary.conditions.windGustsKmh)} km/h) · nuages{' '}
            {formatNumberFr(summary.conditions.cloudCoverPercent)} %
          </p>
          {summary.forecast ? (
            <p className="text-ink-300 text-sm">
              <Badge variant="info">Prévision</Badge> {summary.forecast.time} :{' '}
              {formatNumberFr(summary.forecast.temperatureCelsius, 1)} °C · vent{' '}
              {formatNumberFr(summary.forecast.windSpeedKmh)} km/h
            </p>
          ) : (
            <Hint>Prévision indisponible dans les données enregistrées.</Hint>
          )}
          {summary.freshness === 'saved' && (
            <Hint>
              Ces valeurs ne sont plus « actuelles » : elles datent de {summary.ageLabel}.
            </Hint>
          )}
          {errorReason && isCached && (
            <Hint>La dernière actualisation a échoué : {errorReason}.</Hint>
          )}
        </>
      ) : status === 'error' ? (
        <p className="text-status-danger text-sm">
          Météo indisponible : {errorReason ?? 'erreur inconnue'}.
        </p>
      ) : (
        <p className="text-ink-300 text-sm">
          Indisponible : aucune prévision n’est enregistrée sur cet appareil.
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={loading || !isOnline}
          onClick={() => void fetchWeather(target)}
        >
          <RefreshCw size={14} aria-hidden="true" />
          {summary ? 'Actualiser' : 'Charger la météo'}
        </Button>
        <Link to="/weather" className={LINK_BUTTON_CLASS}>
          Détails
        </Link>
      </div>
      <Hint>
        {isOnline
          ? `Le bouton envoie les coordonnées de ${targetLabel} à Open-Meteo.`
          : 'Hors ligne : l’actualisation est impossible.'}
      </Hint>
    </DashboardCard>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Cloud,
  CloudDrizzle,
  CloudRain,
  Droplets,
  Eye,
  Gauge,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@/components/ui'
import { AdvancedChart } from '@/features/charts/components/AdvancedChart'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { useMapStore } from '@/features/map/state/mapStore'
import { OutingDownloadCard } from '../components/OutingDownloadCard'
import { SunHuntingCard } from '@/features/hunting-hours/SunHuntingCard'
import { WindPanel } from '@/features/wind/components/WindPanel'
import { useWindStore } from '@/features/wind/state/windStore'
import { useNow } from '@/hooks/useNow'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { DaySelector } from '../components/DaySelector'
import { HourlyForecast } from '../components/HourlyForecast'
import { MainWeatherCard } from '../components/MainWeatherCard'
import { WeatherDetails } from '../components/WeatherDetails'
import { WeatherHeader } from '../components/WeatherHeader'
import {
  chooseForecastSource,
  defaultHourKey,
  hoursOf,
  todayKey,
  visibleDays,
  windIndexOfHour,
} from '../forecast/forecastSource'
import { NO_SAVED_FORECAST_MESSAGE, isStale } from '../offline/savedForecastLogic'
import { useSavedForecastsStore } from '../offline/savedForecastsStore'
import { useWeatherStore } from '../state/weatherStore'
import type { HourlyForecastEntry, WeatherForecast } from '@/types'

/** Open-Meteo returns `hourly`/`current` times already localized to the
 * forecast location (`timezone=auto`), as ISO `YYYY-MM-DDTHH:mm` — slicing
 * the string directly avoids re-interpreting it through the *browser's*
 * timezone (which `new Date(iso).toLocaleTimeString()` would do). */
function formatHour(iso: string): string {
  return iso.slice(11, 16)
}

/** The next 24 hourly samples from (and including) the current hour —
 * `forecast_days=2` fetches up to 48h so this always has enough ahead,
 * regardless of what time of day the request happens. */
function next24Hours(forecast: WeatherForecast): HourlyForecastEntry[] {
  const fromIndex = forecast.hourly.findIndex((h) => h.time >= forecast.current.timestamp)
  const start = fromIndex === -1 ? 0 : fromIndex
  return forecast.hourly.slice(start, start + 24)
}

/** Picks a condition icon straight from the two real fields Open-Meteo's
 * `current` block actually has (cloud cover, precipitation) — never a
 * fabricated "weather code" or condition string this app doesn't
 * receive. Thresholds are the same plain-language bands a MétéoMédia-style
 * hero display uses (light drizzle vs. rain, clear vs. overcast). */
function conditionIcon(current: {
  cloudCoverPercent: number
  precipitationMm: number
}): LucideIcon {
  if (current.precipitationMm >= 2.5) return CloudRain
  if (current.precipitationMm > 0) return CloudDrizzle
  if (current.cloudCoverPercent >= 60) return Cloud
  return Sun
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={18} className="text-brand-400 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-ink-100 text-sm font-medium">{value}</p>
        <p className="text-ink-500 text-xs">{label}</p>
      </div>
    </div>
  )
}

/** Météo page: place, day selector, main card, sun and hunting hours, hourly
 * forecast (an hour can feed the wind analysis), details. Data comes from ONE
 * source at a time and its origin is always shown: live, last copy kept on the
 * device, or a forecast downloaded for an outing. */
export function WeatherPage() {
  const gpsReading = useGeolocation()
  const mapCenter = useMapStore((state) => state.view.center)
  const status = useWeatherStore((state) => state.status)
  const forecast = useWeatherStore((state) => state.forecast)
  const isCached = useWeatherStore((state) => state.isCached)
  const fetchedAt = useWeatherStore((state) => state.fetchedAt)
  const errorReason = useWeatherStore((state) => state.errorReason)
  const fetchWeather = useWeatherStore((state) => state.fetch)
  const livePoint = useWeatherStore((state) => state.point)
  const pointStatus = useWeatherStore((state) => state.pointStatus)
  const fetchPoint = useWeatherStore((state) => state.fetchPoint)
  const loadCachedPoint = useWeatherStore((state) => state.loadCachedPoint)
  const savedForecasts = useSavedForecastsStore((state) => state.items)
  const loadSaved = useSavedForecastsStore((state) => state.load)
  const windField = useWindStore((state) => state.field)
  const setWindHour = useWindStore((state) => state.setSelectedHourOffset)
  const online = useOnlineStatus()
  const now = useNow(60_000)

  const usingGps = gpsReading.status === 'available'
  const coordinate = usingGps ? gpsReading.value : mapCenter

  const hasFetchedRef = useRef(false)
  const hasFetchedWithGpsRef = useRef(false)

  useEffect(() => {
    void loadSaved()
    void loadCachedPoint()
  }, [loadSaved, loadCachedPoint])

  useEffect(() => {
    if (!hasFetchedRef.current) {
      // First load: fetch with whatever coordinate is available now
      // (GPS if already fixed, otherwise the map's center).
      hasFetchedRef.current = true
      hasFetchedWithGpsRef.current = usingGps
      if (online) {
        void fetchWeather(coordinate)
        void fetchPoint(coordinate)
      }
      return
    }
    if (usingGps && !hasFetchedWithGpsRef.current) {
      // GPS arrived after that first fetch — upgrade to a real position
      // once, rather than staying on the map-center approximation.
      hasFetchedWithGpsRef.current = true
      void fetchWeather(coordinate)
      void fetchPoint(coordinate)
    }
    // Deliberately NOT re-fetching on every subsequent GPS update — that
    // would hammer the API on ordinary GPS jitter. The refresh button
    // covers "I've actually moved, get me new weather."
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingGps])

  function refresh() {
    void fetchWeather(coordinate)
    void fetchPoint(coordinate)
  }

  const source = useMemo(
    () =>
      chooseForecastSource({
        live: livePoint,
        saved: savedForecasts,
        coordinate,
        now,
      }),
    [livePoint, savedForecasts, coordinate, now],
  )
  const point = source.kind === 'ready' ? source.point : null
  const days = useMemo(() => (point ? visibleDays(point, now) : []), [point, now])
  const today = point ? todayKey(point, now) : null

  const [pickedDate, setPickedDate] = useState<string | null>(null)
  const [pickedHour, setPickedHour] = useState<string | null>(null)
  const [windNote, setWindNote] = useState<string | null>(null)

  const dateKey =
    pickedDate && days.some((d) => d.date === pickedDate)
      ? pickedDate
      : (days[0]?.date ?? null)
  const day = days.find((d) => d.date === dateKey) ?? null
  const hours = point && dateKey ? hoursOf(point, dateKey) : []
  const hourKey =
    pickedHour && hours.some((h) => h.time === pickedHour)
      ? pickedHour
      : point && dateKey
        ? defaultHourKey(point, dateKey, now)
        : null
  const hour = hours.find((h) => h.time === hourKey) ?? null

  /** Points the shared timeline cursor (wind analysis, map) at an hour — or
   * says why it cannot, instead of pointing at another hour. */
  function focusWind(key: string) {
    const index = windIndexOfHour(windField, key)
    if (index === null) {
      setWindNote(
        windField
          ? 'Cette heure est hors de la période du vent chargé : l’analyse du vent n’a pas été déplacée.'
          : 'Le vent n’est pas encore chargé : l’analyse du vent n’a pas été déplacée.',
      )
      return
    }
    setWindHour(index)
    setWindNote(null)
  }

  function selectHour(key: string) {
    setPickedHour(key)
    focusWind(key)
  }

  function selectDay(key: string) {
    setPickedDate(key)
    setPickedHour(null)
    if (point) {
      const first = defaultHourKey(point, key, now)
      if (first) focusWind(first)
    }
  }

  function goToDownload() {
    const card = document.getElementById('outing-download')
    card?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    card?.focus({ preventScroll: true })
  }

  const placeName =
    source.kind === 'ready' && source.saved
      ? source.saved.place.name
      : usingGps
        ? 'Ma position'
        : 'Centre de la carte'
  const sunCoordinate =
    source.kind === 'ready' && source.saved ? source.saved.place.coordinate : coordinate
  const sourceStale =
    source.kind === 'ready' && isStale({ fetchedAt: source.fetchedAt }, now)

  return (
    <div className="flex flex-col gap-6">
      <WeatherHeader
        placeName={placeName}
        dateKey={dateKey}
        online={online}
        origin={source.kind === 'ready' ? source.origin : null}
        fetchedAt={source.kind === 'ready' ? source.fetchedAt : null}
        stale={sourceStale}
        loading={status === 'loading' || pointStatus === 'loading'}
        onRefresh={refresh}
        onDownload={goToDownload}
      />

      {!usingGps && (
        <Badge variant="warning">Position de la carte utilisée — GPS indisponible</Badge>
      )}

      {source.kind === 'ready' && source.origin !== 'live' && (
        <Badge variant="warning">
          {source.origin === 'saved'
            ? 'Prévisions enregistrées pour ce lieu — ce sont des prévisions, pas des mesures en direct.'
            : 'Copie enregistrée de la dernière prévision — elle peut ne plus refléter la prévision actuelle.'}
        </Badge>
      )}

      {source.kind === 'ready' && source.saved?.status === 'partial' && (
        <Badge variant="warning">
          Téléchargement partiel : certaines données sont manquantes et affichées «
          indisponible ».
        </Badge>
      )}

      {source.kind === 'none' && !forecast && status !== 'loading' && (
        <EmptyState
          icon={<CloudRain size={28} aria-hidden="true" />}
          title="Prévisions indisponibles"
          description={
            source.reason === 'ended'
              ? 'La période de la prévision téléchargée pour ce lieu est terminée. Téléchargez-en une nouvelle avec une connexion.'
              : `${NO_SAVED_FORECAST_MESSAGE}.`
          }
        />
      )}

      {point && day && dateKey && (
        <>
          <DaySelector
            days={days}
            selected={dateKey}
            onSelect={selectDay}
            today={today ?? ''}
          />
          <MainWeatherCard day={day} hour={hour} />
          <SunHuntingCard
            coordinate={sunCoordinate}
            placeName={placeName}
            dateKey={dateKey}
            timezone={point.timezone}
            now={now}
            located={usingGps && !(source.kind === 'ready' && source.saved)}
          />
          <section aria-labelledby="hourly-title">
            <h2 id="hourly-title" className="text-ink-300 mb-1 text-sm font-semibold">
              Prévisions horaires
            </h2>
            <p className="text-ink-500 mb-3 text-xs">
              Touchez une heure : la couche et l’analyse du vent de la carte se placent
              sur cette heure (prévision, pas une mesure).
            </p>
            {windNote && (
              <p role="status" className="text-status-warning mb-2 text-xs">
                {windNote}
              </p>
            )}
            <HourlyForecast hours={hours} selected={hourKey} onSelect={selectHour} />
          </section>
          <WeatherDetails hour={hour} />
        </>
      )}

      {isCached && fetchedAt && (
        <Badge variant="warning">
          Météo en cache affichée, datant du {new Date(fetchedAt).toLocaleString('fr-CA')}
          {errorReason ? ` — ${errorReason}` : ''}
        </Badge>
      )}

      {status === 'error' && !point && (
        <EmptyState
          icon={<CloudRain size={28} aria-hidden="true" />}
          title="Météo indisponible"
          description={
            errorReason ??
            'Impossible de joindre le fournisseur météo, et aucune prévision en cache n’existe pour le moment.'
          }
        />
      )}

      {status === 'loading' && !forecast && !point && (
        <p className="text-ink-500 text-sm">Chargement de la météo…</p>
      )}

      {forecast && (
        <>
          {!point &&
            (() => {
              const ConditionIcon = conditionIcon(forecast.current)
              return (
                <Card className="flex items-center gap-4 p-5">
                  <ConditionIcon
                    size={48}
                    className="text-brand-400 shrink-0"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-ink-100 text-4xl leading-none font-bold">
                      {Math.round(forecast.current.temperatureCelsius)}°
                    </p>
                    <p className="text-ink-500 mt-1.5 text-sm">
                      {Math.round(forecast.current.windSpeedKmh)} km/h de vent ·{' '}
                      {Math.round(forecast.current.cloudCoverPercent)} % de nuages ·{' '}
                      {new Date(forecast.current.timestamp).toLocaleTimeString('fr-CA', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </Card>
              )
            })()}

          <Card>
            <CardHeader>
              <CardTitle>Conditions actuelles</CardTitle>
              <CardDescription>
                {new Date(forecast.current.timestamp).toLocaleString('fr-CA')} ·
                Open-Meteo
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric
                icon={Thermometer}
                label="Température"
                value={`${Math.round(forecast.current.temperatureCelsius)}°C`}
              />
              <Metric
                icon={Droplets}
                label="Humidité"
                value={`${Math.round(forecast.current.relativeHumidityPercent)} %`}
              />
              <Metric
                icon={Gauge}
                label="Pression"
                value={`${Math.round(forecast.current.surfacePressureHpa)} hPa`}
              />
              <Metric
                icon={CloudRain}
                label="Précipitations"
                value={`${forecast.current.precipitationMm.toFixed(1)} mm`}
              />
              <Metric
                icon={Cloud}
                label="Couverture nuageuse"
                value={`${Math.round(forecast.current.cloudCoverPercent)} %`}
              />
              <Metric
                icon={Eye}
                label="Visibilité"
                value={
                  forecast.current.visibilityMeters !== null
                    ? `${(forecast.current.visibilityMeters / 1000).toFixed(1)} km`
                    : 'indisponible'
                }
              />
              <Metric
                icon={Wind}
                label="Vent"
                value={`${Math.round(forecast.current.windSpeedKmh)} km/h`}
              />
              <Metric
                icon={Wind}
                label="Rafales"
                value={`${Math.round(forecast.current.windGustsKmh)} km/h`}
              />
            </CardContent>
          </Card>

          {!point && (
            <div>
              <h2 className="text-ink-300 mb-3 text-sm font-semibold">
                24 prochaines heures
              </h2>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {next24Hours(forecast).map((hour) => (
                  <Card
                    key={hour.time}
                    className="flex min-w-[84px] shrink-0 flex-col items-center gap-1 p-3"
                  >
                    <span className="text-ink-500 text-xs">{formatHour(hour.time)}</span>
                    <span className="text-ink-100 text-sm font-semibold">
                      {Math.round(hour.temperatureCelsius)}°
                    </span>
                    <span className="text-ink-500 text-xs">
                      {hour.precipitationMm > 0
                        ? `${hour.precipitationMm.toFixed(1)} mm`
                        : '—'}
                    </span>
                    <span className="text-ink-500 text-xs">
                      {Math.round(hour.windSpeedKmh)} km/h
                    </span>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <WindPanel coordinate={coordinate} />

      <OutingDownloadCard
        gps={usingGps ? gpsReading.value : null}
        mapCenter={mapCenter}
      />

      {(forecast || point) && (
        <Card>
          <CardHeader>
            <CardTitle>Graphique avancé</CardTitle>
            <CardDescription>
              Touchez le graphique pour déplacer le curseur de la ligne du temps partagée
              — cela déplace aussi l’heure de la couche de vent de la page Carte et le
              repère de la page Soleil et lune.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdvancedChart />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

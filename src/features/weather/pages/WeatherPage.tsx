import { useEffect, useRef } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Cloud, CloudRain, Droplets, Eye, Gauge, RefreshCw, Thermometer, Wind } from 'lucide-react'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from '@/components/ui'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { useMapStore } from '@/features/map/state/mapStore'
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

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
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

/** Phase 5: current conditions + hourly forecast for the user's GPS
 * position (falling back to the map's last known center when GPS isn't
 * available — real data either way, just flagged which one is showing).
 * Wind's *dedicated* engine (direction/animation/timeline) is Phase 6;
 * this page only shows wind speed/gusts as one metric among others, per
 * the spec's phase split. */
export function WeatherPage() {
  const gpsReading = useGeolocation()
  const mapCenter = useMapStore((state) => state.view.center)
  const status = useWeatherStore((state) => state.status)
  const forecast = useWeatherStore((state) => state.forecast)
  const isCached = useWeatherStore((state) => state.isCached)
  const fetchedAt = useWeatherStore((state) => state.fetchedAt)
  const errorReason = useWeatherStore((state) => state.errorReason)
  const fetchWeather = useWeatherStore((state) => state.fetch)

  const usingGps = gpsReading.status === 'available'
  const coordinate = usingGps ? gpsReading.value : mapCenter

  const hasFetchedRef = useRef(false)
  const hasFetchedWithGpsRef = useRef(false)

  useEffect(() => {
    if (!hasFetchedRef.current) {
      // First load: fetch with whatever coordinate is available now
      // (GPS if already fixed, otherwise the map's center).
      hasFetchedRef.current = true
      hasFetchedWithGpsRef.current = usingGps
      void fetchWeather(coordinate)
      return
    }
    if (usingGps && !hasFetchedWithGpsRef.current) {
      // GPS arrived after that first fetch — upgrade to a real position
      // once, rather than staying on the map-center approximation.
      hasFetchedWithGpsRef.current = true
      void fetchWeather(coordinate)
    }
    // Deliberately NOT re-fetching on every subsequent GPS update — that
    // would hammer the API on ordinary GPS jitter. The refresh button
    // covers "I've actually moved, get me new weather."
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usingGps])

  function refresh() {
    void fetchWeather(coordinate)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Weather"
        description="Current conditions and the next 24 hours."
        actions={
          <button
            type="button"
            onClick={refresh}
            disabled={status === 'loading'}
            aria-label="Refresh weather"
            title="Refresh"
            className="border-surface-600 text-ink-300 hover:bg-surface-800 rounded-lg border p-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={status === 'loading' ? 'animate-spin' : ''}
              aria-hidden="true"
            />
          </button>
        }
      />

      {!usingGps && (
        <Badge variant="warning">Using map location — GPS unavailable</Badge>
      )}

      {isCached && fetchedAt && (
        <Badge variant="warning">
          Showing cached weather from {new Date(fetchedAt).toLocaleString()}
          {errorReason ? ` — ${errorReason}` : ''}
        </Badge>
      )}

      {status === 'error' && (
        <EmptyState
          icon={<CloudRain size={28} aria-hidden="true" />}
          title="Weather unavailable"
          description={errorReason ?? 'Could not reach the weather provider, and no cached forecast exists yet.'}
        />
      )}

      {status === 'loading' && !forecast && (
        <p className="text-ink-500 text-sm">Loading weather…</p>
      )}

      {forecast && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Current conditions</CardTitle>
              <CardDescription>
                {new Date(forecast.current.timestamp).toLocaleString()} · Open-Meteo
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Metric
                icon={Thermometer}
                label="Temperature"
                value={`${Math.round(forecast.current.temperatureCelsius)}°C`}
              />
              <Metric
                icon={Droplets}
                label="Humidity"
                value={`${Math.round(forecast.current.relativeHumidityPercent)}%`}
              />
              <Metric
                icon={Gauge}
                label="Pressure"
                value={`${Math.round(forecast.current.surfacePressureHpa)} hPa`}
              />
              <Metric
                icon={CloudRain}
                label="Precipitation"
                value={`${forecast.current.precipitationMm.toFixed(1)} mm`}
              />
              <Metric
                icon={Cloud}
                label="Cloud cover"
                value={`${Math.round(forecast.current.cloudCoverPercent)}%`}
              />
              <Metric
                icon={Eye}
                label="Visibility"
                value={
                  forecast.current.visibilityMeters !== null
                    ? `${(forecast.current.visibilityMeters / 1000).toFixed(1)} km`
                    : 'unavailable'
                }
              />
              <Metric
                icon={Wind}
                label="Wind"
                value={`${Math.round(forecast.current.windSpeedKmh)} km/h`}
              />
              <Metric
                icon={Wind}
                label="Gusts"
                value={`${Math.round(forecast.current.windGustsKmh)} km/h`}
              />
            </CardContent>
          </Card>

          <div>
            <h2 className="text-ink-300 mb-3 text-sm font-semibold">Next 24 hours</h2>
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
                    {hour.precipitationMm > 0 ? `${hour.precipitationMm.toFixed(1)}mm` : '—'}
                  </span>
                  <span className="text-ink-500 text-xs">{Math.round(hour.windSpeedKmh)} km/h</span>
                </Card>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

import type {
  Coordinate,
  HourlyForecastEntry,
  PointDaily,
  PointForecast,
  PointHourly,
  WeatherConditions,
  WeatherForecast,
} from '@/types'
import type { WeatherProvider } from './WeatherProvider'

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast'

// Exact parameter names verified against Open-Meteo's live docs
// (open-meteo.com/en/docs) — not guessed. Visibility is deliberately
// absent from CURRENT_PARAMS: it isn't one of Open-Meteo's native
// `current=` fields, only an `hourly=` one, so `mapResponse` below reads
// it from the first hourly sample instead.
const CURRENT_PARAMS = [
  'temperature_2m',
  'relative_humidity_2m',
  'surface_pressure',
  'precipitation',
  'cloud_cover',
  'wind_speed_10m',
  'wind_gusts_10m',
].join(',')

const HOURLY_PARAMS = [
  'temperature_2m',
  'relative_humidity_2m',
  'surface_pressure',
  'precipitation',
  'cloud_cover',
  'visibility',
  'wind_speed_10m',
  'wind_gusts_10m',
].join(',')

/** Hourly variables of the « Télécharger pour ma sortie » request. Names
 * checked against Open-Meteo's forecast API reference (hourly list). */
export const POINT_HOURLY_PARAMS = [
  'temperature_2m',
  'apparent_temperature',
  'weather_code',
  'precipitation',
  'precipitation_probability',
  'relative_humidity_2m',
  'surface_pressure',
  'cloud_cover',
  'visibility',
  'uv_index',
  'wind_speed_10m',
  'wind_gusts_10m',
  'wind_direction_10m',
  'is_day',
  'snowfall',
  'snow_depth',
] as const

/** Daily variables of the same request (min/max, sun, precipitation total). */
export const POINT_DAILY_PARAMS = [
  'weather_code',
  'temperature_2m_max',
  'temperature_2m_min',
  'apparent_temperature_max',
  'apparent_temperature_min',
  'sunrise',
  'sunset',
  'precipitation_sum',
  'uv_index_max',
  'wind_speed_10m_max',
  'wind_gusts_10m_max',
  'wind_direction_10m_dominant',
] as const

/** Provider range of `forecast_days` for this endpoint (documented 1–16). */
export const POINT_FORECAST_MAX_DAYS = 16

type Series = (number | string | null)[] | undefined

interface OpenMeteoPointResponse {
  timezone: string
  hourly?: { time?: string[] } & Record<string, Series>
  daily?: { time?: string[] } & Record<string, Series>
}

/** A finite number, else `null` — a missing/null/NaN value is « indisponible »,
 * never 0. */
function numberOrNull(series: Series, i: number): number | null {
  const v = series?.[i]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function textOrNull(series: Series, i: number): string | null {
  const v = series?.[i]
  return typeof v === 'string' && v.length > 0 ? v : null
}

export function mapPointResponse(data: OpenMeteoPointResponse): PointForecast {
  const h = data.hourly ?? {}
  const d = data.daily ?? {}
  const hourly: PointHourly[] = (h.time ?? []).map((time, i) => {
    const day = numberOrNull(h.is_day, i)
    return {
      time,
      temperatureCelsius: numberOrNull(h.temperature_2m, i),
      apparentTemperatureCelsius: numberOrNull(h.apparent_temperature, i),
      weatherCode: numberOrNull(h.weather_code, i),
      precipitationMm: numberOrNull(h.precipitation, i),
      precipitationProbabilityPercent: numberOrNull(h.precipitation_probability, i),
      relativeHumidityPercent: numberOrNull(h.relative_humidity_2m, i),
      surfacePressureHpa: numberOrNull(h.surface_pressure, i),
      cloudCoverPercent: numberOrNull(h.cloud_cover, i),
      visibilityMeters: numberOrNull(h.visibility, i),
      uvIndex: numberOrNull(h.uv_index, i),
      windSpeedKmh: numberOrNull(h.wind_speed_10m, i),
      windGustsKmh: numberOrNull(h.wind_gusts_10m, i),
      windDirectionDegrees: numberOrNull(h.wind_direction_10m, i),
      isDay: day === null ? null : day === 1,
      snowDepthMeters: numberOrNull(h.snow_depth, i),
      snowfallCm: numberOrNull(h.snowfall, i),
    }
  })
  const daily: PointDaily[] = (d.time ?? []).map((date, i) => ({
    date,
    weatherCode: numberOrNull(d.weather_code, i),
    temperatureMaxCelsius: numberOrNull(d.temperature_2m_max, i),
    temperatureMinCelsius: numberOrNull(d.temperature_2m_min, i),
    apparentTemperatureMaxCelsius: numberOrNull(d.apparent_temperature_max, i),
    apparentTemperatureMinCelsius: numberOrNull(d.apparent_temperature_min, i),
    sunrise: textOrNull(d.sunrise, i),
    sunset: textOrNull(d.sunset, i),
    precipitationSumMm: numberOrNull(d.precipitation_sum, i),
    uvIndexMax: numberOrNull(d.uv_index_max, i),
    windSpeedMaxKmh: numberOrNull(d.wind_speed_10m_max, i),
    windGustsMaxKmh: numberOrNull(d.wind_gusts_10m_max, i),
    windDirectionDominantDegrees: numberOrNull(d.wind_direction_10m_dominant, i),
  }))
  return { timezone: data.timezone, hourly, daily }
}

interface OpenMeteoCurrent {
  time: string
  temperature_2m: number
  relative_humidity_2m: number
  surface_pressure: number
  precipitation: number
  cloud_cover: number
  wind_speed_10m: number
  wind_gusts_10m: number
}

interface OpenMeteoHourly {
  time: string[]
  temperature_2m: number[]
  relative_humidity_2m: number[]
  surface_pressure: number[]
  precipitation: number[]
  cloud_cover: number[]
  visibility: number[]
  wind_speed_10m: number[]
  wind_gusts_10m: number[]
}

interface OpenMeteoResponse {
  timezone: string
  current: OpenMeteoCurrent
  hourly: OpenMeteoHourly
}

function mapResponse(data: OpenMeteoResponse): WeatherForecast {
  const current: WeatherConditions = {
    timestamp: data.current.time,
    temperatureCelsius: data.current.temperature_2m,
    relativeHumidityPercent: data.current.relative_humidity_2m,
    surfacePressureHpa: data.current.surface_pressure,
    precipitationMm: data.current.precipitation,
    cloudCoverPercent: data.current.cloud_cover,
    windSpeedKmh: data.current.wind_speed_10m,
    windGustsKmh: data.current.wind_gusts_10m,
    visibilityMeters: data.hourly.visibility[0] ?? null,
  }

  const hourly: HourlyForecastEntry[] = data.hourly.time.map((time, i) => ({
    time,
    temperatureCelsius: data.hourly.temperature_2m[i],
    relativeHumidityPercent: data.hourly.relative_humidity_2m[i],
    surfacePressureHpa: data.hourly.surface_pressure[i],
    precipitationMm: data.hourly.precipitation[i],
    cloudCoverPercent: data.hourly.cloud_cover[i],
    windSpeedKmh: data.hourly.wind_speed_10m[i],
    windGustsKmh: data.hourly.wind_gusts_10m[i],
    visibilityMeters: data.hourly.visibility[i],
  }))

  return { timezone: data.timezone, current, hourly }
}

/**
 * Open-Meteo (open-meteo.com) — free, keyless, no provider account or key
 * management needed for this app (unlike the map providers). Verified
 * live: no API key required for non-commercial use, ~10,000 calls/day
 * free-tier limit. `forecast_days=2` so the hourly array always covers a
 * full 24h window ahead regardless of what time of day the request is
 * made.
 */
export class OpenMeteoWeatherProvider implements WeatherProvider {
  async fetchForecast(coordinate: Coordinate): Promise<WeatherForecast> {
    const url = new URL(OPEN_METEO_URL)
    url.searchParams.set('latitude', String(coordinate.lat))
    url.searchParams.set('longitude', String(coordinate.lng))
    url.searchParams.set('current', CURRENT_PARAMS)
    url.searchParams.set('hourly', HOURLY_PARAMS)
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', '2')

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Requête météo échouée (${response.status})`)
    }
    const data = (await response.json()) as OpenMeteoResponse
    return mapResponse(data)
  }

  async fetchPointForecast(
    coordinate: Coordinate,
    days: number,
    signal?: AbortSignal,
  ): Promise<PointForecast> {
    const forecastDays = Math.min(
      POINT_FORECAST_MAX_DAYS,
      Math.max(1, Math.round(Number.isFinite(days) ? days : 1)),
    )
    const url = new URL(OPEN_METEO_URL)
    url.searchParams.set('latitude', String(coordinate.lat))
    url.searchParams.set('longitude', String(coordinate.lng))
    url.searchParams.set('hourly', POINT_HOURLY_PARAMS.join(','))
    url.searchParams.set('daily', POINT_DAILY_PARAMS.join(','))
    url.searchParams.set('timezone', 'auto')
    url.searchParams.set('forecast_days', String(forecastDays))
    // Units are asked for explicitly so the saved record's units are a fact,
    // not an assumption about the provider's defaults.
    url.searchParams.set('temperature_unit', 'celsius')
    url.searchParams.set('wind_speed_unit', 'kmh')
    url.searchParams.set('precipitation_unit', 'mm')

    const response = await (signal ? fetch(url, { signal }) : fetch(url))
    if (!response.ok) {
      throw new Error(`Requête météo échouée (${response.status})`)
    }
    const data = (await response.json()) as OpenMeteoPointResponse
    if (!data || typeof data.timezone !== 'string' || !data.hourly) {
      throw new Error('Réponse météo inattendue')
    }
    return mapPointResponse(data)
  }
}

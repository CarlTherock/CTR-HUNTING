import type { Coordinate, HourlyForecastEntry, WeatherConditions, WeatherForecast } from '@/types'
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
      throw new Error(`Weather request failed (${response.status})`)
    }
    const data = (await response.json()) as OpenMeteoResponse
    return mapResponse(data)
  }
}

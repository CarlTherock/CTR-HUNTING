import type {
  Coordinate,
  PointDaily,
  PointForecast,
  PointHourly,
  SavedForecastPlace,
  WindField,
  WindHourlyReading,
} from '@/types'

/** Test helpers: synthetic forecasts shaped like the provider's answers. */

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Local hour keys `YYYY-MM-DDTHH:00` for `days` calendar days from `startDate`,
 * skipping the hours in `skipHours` (e.g. `['2026-03-08T02:00']` for a clock
 * change). */
export function hourKeys(
  startDate: string,
  days: number,
  skipHours: string[] = [],
): string[] {
  const keys: string[] = []
  const start = new Date(`${startDate}T00:00:00Z`)
  for (let d = 0; d < days; d++) {
    const day = new Date(start)
    day.setUTCDate(day.getUTCDate() + d)
    const date = day.toISOString().slice(0, 10)
    for (let h = 0; h < 24; h++) {
      const key = `${date}T${pad(h)}:00`
      if (!skipHours.includes(key)) keys.push(key)
    }
  }
  return keys
}

export function makePoint(
  startDate: string,
  days: number,
  options: {
    timezone?: string
    skipHours?: string[]
    patch?: (h: PointHourly, index: number) => Partial<PointHourly>
  } = {},
): PointForecast {
  const keys = hourKeys(startDate, days, options.skipHours)
  const hourly: PointHourly[] = keys.map((time, i) => ({
    time,
    temperatureCelsius: 10 + (i % 5),
    apparentTemperatureCelsius: 8,
    weatherCode: 3,
    precipitationMm: 0,
    precipitationProbabilityPercent: 10,
    relativeHumidityPercent: 70,
    surfacePressureHpa: 1012,
    cloudCoverPercent: 40,
    visibilityMeters: 24000,
    uvIndex: 1,
    windSpeedKmh: 12,
    windGustsKmh: 25,
    windDirectionDegrees: 270,
    isDay: true,
    ...options.patch?.({} as PointHourly, i),
  }))
  const dates = [...new Set(keys.map((k) => k.slice(0, 10)))]
  const daily: PointDaily[] = dates.map((date) => ({
    date,
    weatherCode: 3,
    temperatureMaxCelsius: 14,
    temperatureMinCelsius: 6,
    apparentTemperatureMaxCelsius: 12,
    apparentTemperatureMinCelsius: 4,
    sunrise: `${date}T07:05`,
    sunset: `${date}T17:10`,
    precipitationSumMm: 0,
    uvIndexMax: 2,
    windSpeedMaxKmh: 20,
    windGustsMaxKmh: 35,
    windDirectionDominantDegrees: 270,
  }))
  return { timezone: options.timezone ?? 'America/Toronto', hourly, daily }
}

export function makeWindField(
  center: Coordinate,
  startDate: string,
  days: number,
  options: {
    timezone?: string
    samples?: number
    directionDegrees?: number
    skipHours?: string[]
    patch?: (h: WindHourlyReading, index: number) => Partial<WindHourlyReading>
  } = {},
): WindField {
  const keys = hourKeys(startDate, days, options.skipHours)
  const count = options.samples ?? 25
  return {
    timezone: options.timezone ?? 'America/Toronto',
    samples: Array.from({ length: count }, (_, s) => ({
      coordinate: {
        lat: center.lat + ((s % 5) - 2) * 0.075,
        lng: center.lng + (Math.floor(s / 5) - 2) * 0.075,
      },
      hourly: keys.map((time, i) => ({
        time,
        directionDegrees: options.directionDegrees ?? 270,
        speedKmh: 12,
        gustsKmh: 25,
        temperatureCelsius: 10,
        precipitationMm: 0,
        cloudCoverPercent: 40,
        ...options.patch?.({} as WindHourlyReading, i),
      })),
    })),
  }
}

export const QUEBEC: SavedForecastPlace = {
  kind: 'map-center',
  name: 'Centre de la carte',
  coordinate: { lat: 46.8139, lng: -71.2082 },
}

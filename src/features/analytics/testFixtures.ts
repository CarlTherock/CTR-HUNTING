import type {
  Coordinate,
  HourlyForecastEntry,
  WeatherForecast,
  WindField,
  WindHourlyReading,
} from '@/types'

/**
 * Fixtures de TEST uniquement (données simulées, jamais utilisées par
 * l'application) : deux jours horaires à Québec, fuseau America/Toronto.
 * `NOW` = 14:20 heure locale le 17 août 2026 (EDT, UTC−4).
 */
export const TZ = 'America/Toronto'
export const NOW = new Date('2026-08-17T18:20:00.000Z')
export const NOW_KEY = '2026-08-17T14:00'

export function hourKeys(): string[] {
  const keys: string[] = []
  for (const day of ['2026-08-17', '2026-08-18']) {
    for (let h = 0; h < 24; h++) keys.push(`${day}T${String(h).padStart(2, '0')}:00`)
  }
  return keys
}

export function makeWeather(
  override: (hourKey: string) => Partial<HourlyForecastEntry> = () => ({}),
): WeatherForecast {
  const hourly: HourlyForecastEntry[] = hourKeys().map((time) => ({
    time,
    temperatureCelsius: 18,
    relativeHumidityPercent: 55,
    surfacePressureHpa: 1013,
    precipitationMm: 0,
    cloudCoverPercent: 30,
    windSpeedKmh: 10,
    windGustsKmh: 15,
    visibilityMeters: 20000,
    ...override(time),
  }))
  return {
    timezone: TZ,
    current: {
      timestamp: '2026-08-17T14:15',
      temperatureCelsius: 21,
      relativeHumidityPercent: 50,
      surfacePressureHpa: 1013,
      precipitationMm: 0,
      cloudCoverPercent: 20,
      windSpeedKmh: 10,
      windGustsKmh: 15,
      visibilityMeters: 20000,
    },
    hourly,
  }
}

export function makeWindField(
  coordinates: Coordinate[],
  override: (hourKey: string, index: number) => Partial<WindHourlyReading> = () => ({}),
): WindField {
  return {
    timezone: TZ,
    samples: coordinates.map((coordinate, index) => ({
      coordinate,
      hourly: hourKeys().map((time) => ({
        time,
        directionDegrees: 270,
        speedKmh: 12,
        gustsKmh: 20,
        temperatureCelsius: 18,
        precipitationMm: 0,
        cloudCoverPercent: 30,
        ...override(time, index),
      })),
    })),
  }
}

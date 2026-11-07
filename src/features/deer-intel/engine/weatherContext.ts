import type { PointForecast, PointHourly } from '@/types'
import type { HourWeather } from './types'

/** Prévision indexée par clé locale `AAAA-MM-JJTHH:00` (la première occurrence gagne). */
export function indexForecast(forecast: PointForecast | null): Map<string, PointHourly> {
  const map = new Map<string, PointHourly>()
  for (const h of forecast?.hourly ?? []) {
    const key = h.time.slice(0, 13) + ':00'
    if (!map.has(key)) map.set(key, h)
  }
  return map
}

function shiftKey(key: string, hours: number): string {
  const [date, time] = key.split('T')
  const ms = Date.parse(`${date}T${time}:00Z`) + hours * 3_600_000
  return new Date(ms).toISOString().slice(0, 13) + ':00'
}

function diff(a: number | null | undefined, b: number | null | undefined): number | null {
  return typeof a === 'number' && typeof b === 'number' ? a - b : null
}

/**
 * Contexte météo d'une heure. Rien n'est inventé : une valeur absente reste `null`. La pression
 * est celle de SURFACE ; sa variation est calculée sur 3 h seulement si les deux valeurs
 * existent ; la variation de température « depuis hier » exige la même heure de la veille dans
 * les données (sinon `null`), jamais une « anomalie » sans normale climatique.
 */
export function hourWeather(
  index: Map<string, PointHourly>,
  localKey: string,
): HourWeather | null {
  const h = index.get(localKey)
  if (!h) return null
  const before3 = index.get(shiftKey(localKey, -3))
  const yesterday = index.get(shiftKey(localKey, -24))
  return {
    temperatureC: h.temperatureCelsius,
    temperatureChangeSinceYesterdayC: diff(
      h.temperatureCelsius,
      yesterday?.temperatureCelsius,
    ),
    surfacePressureHpa: h.surfacePressureHpa,
    pressureChange3hHpa: diff(h.surfacePressureHpa, before3?.surfacePressureHpa),
    precipitationMm: h.precipitationMm,
    windSpeedKmh: h.windSpeedKmh,
    windGustsKmh: h.windGustsKmh,
    windFromDegrees: h.windDirectionDegrees,
    cloudCoverPercent: h.cloudCoverPercent,
    snowDepthM: h.snowDepthMeters ?? null,
    snowfallCm: h.snowfallCm ?? null,
  }
}

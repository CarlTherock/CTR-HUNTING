import { useWeatherStore } from '@/features/weather/state/weatherStore'
import { useWindStore } from '@/features/wind/state/windStore'
import { windAt } from '@/utils/windField'
import type { ConditionsMeta, Coordinate, Observation } from '@/types'

export interface ConditionsSnapshot {
  conditions: NonNullable<Observation['conditions']>
  /** Absent when the weather store did not record when the data was fetched. */
  meta?: ConditionsMeta
}

/** A real conditions snapshot from whatever weather/wind data the app already
 * has loaded — only built when there is a genuine reading for every field;
 * otherwise `undefined`, never a partially fabricated snapshot. It is the
 * conditions AT THE TIME OF THE READING: callers must not attach it to an
 * observation made at another time. */
export function snapshotConditions(
  coordinate: Coordinate,
): ConditionsSnapshot | undefined {
  const { forecast, fetchedAt, isCached } = useWeatherStore.getState()
  const windField = useWindStore.getState().field
  if (!forecast || !windField) return undefined
  const reading = windAt(windField, coordinate, 0)
  if (!reading) return undefined
  return {
    conditions: {
      temperatureCelsius: forecast.current.temperatureCelsius,
      windSpeedKmh: reading.speedKmh,
      windDirectionDegrees: reading.directionDegrees,
      cloudCoverPercent: forecast.current.cloudCoverPercent,
    },
    ...(fetchedAt ? { meta: { source: 'Open-Meteo', fetchedAt, cached: isCached } } : {}),
  }
}

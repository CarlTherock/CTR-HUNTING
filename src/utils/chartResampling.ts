import type { HourlyForecastEntry } from '@/types'

export type ChartGranularity = '1h' | '3h' | '6h' | '12h' | '24h'

export const GRANULARITY_HOURS: Record<ChartGranularity, number> = {
  '1h': 1,
  '3h': 3,
  '6h': 6,
  '12h': 12,
  '24h': 24,
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0)
}

/**
 * Buckets real hourly forecast entries into wider real-time chunks (e.g.
 * `3h` = 3 real hours averaged into one point) — the "24h/12h/6h/3h/1h"
 * chart granularities (Phase 10). Every bucket's value is a genuine
 * average (or, for precipitation, a genuine sum) of the real hours it
 * covers — a `calculated` value, never a fabricated one. `time` is the
 * bucket's first real hour, so `windStore.selectedHourOffset` (a real
 * hour index) still lines up with which bucket contains it.
 */
export function resampleHourly(
  hourly: HourlyForecastEntry[],
  granularity: ChartGranularity,
): HourlyForecastEntry[] {
  const bucketHours = GRANULARITY_HOURS[granularity]
  if (bucketHours <= 1) return hourly

  const buckets: HourlyForecastEntry[] = []
  for (let i = 0; i < hourly.length; i += bucketHours) {
    const chunk = hourly.slice(i, i + bucketHours)
    if (chunk.length === 0) continue
    buckets.push({
      time: chunk[0].time,
      temperatureCelsius: average(chunk.map((c) => c.temperatureCelsius)),
      relativeHumidityPercent: average(chunk.map((c) => c.relativeHumidityPercent)),
      surfacePressureHpa: average(chunk.map((c) => c.surfacePressureHpa)),
      precipitationMm: sum(chunk.map((c) => c.precipitationMm)),
      cloudCoverPercent: average(chunk.map((c) => c.cloudCoverPercent)),
      windSpeedKmh: average(chunk.map((c) => c.windSpeedKmh)),
      windGustsKmh: average(chunk.map((c) => c.windGustsKmh)),
      visibilityMeters: average(chunk.map((c) => c.visibilityMeters)),
    })
  }
  return buckets
}

/** The real hour-of-day index (0-23) a bucket starting at a given real
 * hour offset falls into, used to line up "day 1" vs "day 2" for the
 * day-comparison overlay on the same 0-23h axis. */
export function hourOfDay(hourOffset: number): number {
  return hourOffset % 24
}

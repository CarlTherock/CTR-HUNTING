import { sampleSlopeAspect } from '@/features/map/terrainQuery'
import {
  combineAnalyses,
  historyAnalyzer,
  terrainAnalyzer,
  timeAnalyzer,
  vegetationAnalyzer,
  weatherAnalyzer,
  windAnalyzer,
} from '@/utils/analyzers'
import { computeTemporalData } from '@/utils/temporal'
import { hourIndexAt, windAt } from '@/utils/windField'
import type {
  AnalysisHeatmapCell,
  Coordinate,
  Track,
  VegetationSample,
  WeatherForecast,
  WindField,
  Waypoint,
} from '@/types'

/**
 * The same 6-analyzer combination `analysisStore`'s single-point "Analyze
 * this spot" uses, run for one grid cell of a Phase 9 heatmap. Kept as a
 * pure function (given already-fetched data, not fetching anything
 * itself) so `heatmapStore.compute()` stays a thin orchestration layer —
 * fetch once per area, then map this over every grid point. Any input
 * may be `null` (its provider failed) — that analyzer is then reported
 * unavailable instead of the whole heatmap failing.
 */
export function computeHeatmapCell(
  coordinate: Coordinate,
  queryElevation: (coordinate: Coordinate) => number | null,
  windField: WindField | null,
  weather: WeatherForecast | null,
  vegetation: VegetationSample | null,
  waypoints: Waypoint[],
  tracks: Track[],
  now: Date,
): AnalysisHeatmapCell {
  const terrain = terrainAnalyzer(sampleSlopeAspect(queryElevation, coordinate))
  const vegetationResult = vegetationAnalyzer(vegetation)
  const weatherResult = weatherAnalyzer(weather?.current ?? null, weather?.hourly ?? [])
  // The *current* hour's real reading — Open-Meteo's hourly array starts
  // at local midnight, so index 0 was the 00:00 reading, not "now".
  const hourIndex = windField ? hourIndexAt(windField, now) : null
  const windResult = windAnalyzer(
    windField && hourIndex !== null ? windAt(windField, coordinate, hourIndex) : null,
    undefined,
  )
  const timeResult = timeAnalyzer(computeTemporalData(now, coordinate), now)
  const historyResult = historyAnalyzer(coordinate, waypoints, tracks)

  return {
    coordinate,
    combined: combineAnalyses([
      terrain,
      vegetationResult,
      weatherResult,
      windResult,
      timeResult,
      historyResult,
    ]),
  }
}

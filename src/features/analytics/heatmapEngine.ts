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
import { windAt } from '@/utils/windField'
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
 * fetch once per area, then map this over every grid point.
 */
export function computeHeatmapCell(
  coordinate: Coordinate,
  queryElevation: (coordinate: Coordinate) => number | null,
  windField: WindField,
  weather: WeatherForecast,
  vegetation: VegetationSample | null,
  waypoints: Waypoint[],
  tracks: Track[],
  now: Date,
): AnalysisHeatmapCell {
  const terrain = terrainAnalyzer(sampleSlopeAspect(queryElevation, coordinate))
  const vegetationResult = vegetationAnalyzer(vegetation)
  const weatherResult = weatherAnalyzer(weather.current, weather.hourly)
  const windResult = windAnalyzer(windAt(windField, coordinate, 0), undefined)
  const timeResult = timeAnalyzer(computeTemporalData(now, coordinate), now)
  const historyResult = historyAnalyzer(coordinate, waypoints, tracks)

  return {
    coordinate,
    combined: combineAnalyses([terrain, vegetationResult, weatherResult, windResult, timeResult, historyResult]),
  }
}

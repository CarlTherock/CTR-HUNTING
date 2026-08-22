import { create } from 'zustand'
import { vegetationProvider } from '@/services/vegetation'
import { weatherProvider } from '@/services/weather'
import { windProvider } from '@/services/wind'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { sampleSlopeAspect } from '@/features/map/terrainQuery'
import {
  combineAnalyses,
  historyAnalyzer,
  terrainAnalyzer,
  timeAnalyzer,
  unavailableResult,
  vegetationAnalyzer,
  weatherAnalyzer,
  windAnalyzer,
} from '@/utils/analyzers'
import { computeTemporalData } from '@/utils/temporal'
import type { CombinedAnalysis, Coordinate } from '@/types'

export type AnalysisMode = 'idle' | 'analyzing'
export type AnalysisStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Real-world radius the vegetation/history lookups consider "nearby" —
 * matches `HISTORY_RADIUS_METERS`'s intent, a reasonable "same immediate
 * area" scale for a hand-picked hunting spot, not a tuned/fabricated
 * number. */
const VEGETATION_RADIUS_METERS = 300
/** A small bounding box around the tapped point for a single-cell wind
 * grid fetch — `gridSize: 1` means exactly one real sample, at
 * essentially the tapped coordinate. */
const WIND_QUERY_DEGREES = 0.02

interface AnalysisState {
  mode: AnalysisMode
  status: AnalysisStatus
  coordinate: Coordinate | null
  combined: CombinedAnalysis | null
  errorReason: string | null

  startAnalyzing: () => void
  cancel: () => void
  /** Runs every analyzer for `coordinate`. `queryElevation` is supplied by
   * the caller (only `MapPage` holds a live `MapInstance`) so this store
   * stays engine-agnostic. `optimalWindDirections` is passed when
   * analyzing an existing waypoint, so the wind analyzer can check it
   * against the live reading — omitted for an arbitrary tapped point. */
  analyze: (
    coordinate: Coordinate,
    queryElevation: (coordinate: Coordinate) => number | null,
    optimalWindDirections?: number[],
  ) => Promise<void>
  close: () => void
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  mode: 'idle',
  status: 'idle',
  coordinate: null,
  combined: null,
  errorReason: null,

  startAnalyzing: () => set({ mode: 'analyzing' }),
  cancel: () => set({ mode: 'idle' }),

  analyze: async (coordinate, queryElevation, optimalWindDirections) => {
    set({ mode: 'idle', status: 'loading', coordinate, combined: null, errorReason: null })

    const slopeAspect = sampleSlopeAspect(queryElevation, coordinate)
    const terrain = terrainAnalyzer(slopeAspect)

    const { waypoints } = useWaypointsStore.getState()
    const { tracks } = useTracksStore.getState()
    const history = historyAnalyzer(coordinate, waypoints, tracks)

    const now = new Date()
    const temporalData = computeTemporalData(now, coordinate)
    const time = timeAnalyzer(temporalData, now)

    const [weatherOutcome, windOutcome, vegetationOutcome] = await Promise.allSettled([
      weatherProvider.fetchForecast(coordinate),
      windProvider.fetchWindField(
        {
          west: coordinate.lng - WIND_QUERY_DEGREES,
          east: coordinate.lng + WIND_QUERY_DEGREES,
          south: coordinate.lat - WIND_QUERY_DEGREES,
          north: coordinate.lat + WIND_QUERY_DEGREES,
        },
        1,
      ),
      vegetationProvider.fetchVegetation(coordinate, VEGETATION_RADIUS_METERS),
    ])

    const weather =
      weatherOutcome.status === 'fulfilled'
        ? weatherAnalyzer(weatherOutcome.value.current, weatherOutcome.value.hourly)
        : unavailableResult('weather', weatherOutcome.reason instanceof Error ? weatherOutcome.reason.message : 'Weather lookup failed.')

    const wind =
      windOutcome.status === 'fulfilled' && windOutcome.value.samples[0]?.hourly[0]
        ? windAnalyzer(windOutcome.value.samples[0].hourly[0], optimalWindDirections)
        : unavailableResult('wind', windOutcome.status === 'rejected' && windOutcome.reason instanceof Error ? windOutcome.reason.message : 'Wind lookup failed.')

    const vegetation =
      vegetationOutcome.status === 'fulfilled'
        ? vegetationAnalyzer(vegetationOutcome.value)
        : unavailableResult('vegetation', vegetationOutcome.reason instanceof Error ? vegetationOutcome.reason.message : 'Vegetation lookup failed.')

    const combined = combineAnalyses([terrain, vegetation, weather, wind, time, history])
    set({ status: 'ready', combined })
  },

  close: () => set({ status: 'idle', combined: null, coordinate: null }),
}))

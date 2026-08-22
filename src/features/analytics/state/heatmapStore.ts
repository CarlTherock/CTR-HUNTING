import { create } from 'zustand'
import { vegetationProvider } from '@/services/vegetation'
import { weatherProvider } from '@/services/weather'
import { windProvider } from '@/services/wind'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { buildGrid } from '@/utils/grid'
import { computeHeatmapCell } from '../heatmapEngine'
import type { AnalysisHeatmapCell, AnalyzerId, Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export type HeatmapStatus = 'idle' | 'loading' | 'ready' | 'error'
/** Which score colors the heatmap — the combined average of all 6
 * analyzers, or one specific analyzer alone. Switching this is a pure
 * client-side re-projection of the already-computed cells (see
 * `MapPage.tsx`'s heatmap effect) — never a re-fetch, same "configurable,
 * instant" principle as the Phase 6 weather-layer switcher. */
export type HeatmapView = 'combined' | AnalyzerId

/** Same spatial resolution as the wind flow-field grid (Phase 6) — real
 * spatial detail without pushing per-fetch cost too high, since a
 * heatmap compute fans out to 3 real network requests total (one
 * batched wind grid, one weather point, one batched vegetation bbox),
 * never one request per cell. */
const GRID_SIZE = 5

interface HeatmapState {
  status: HeatmapStatus
  enabled: boolean
  cells: AnalysisHeatmapCell[]
  errorReason: string | null
  selectedView: HeatmapView

  toggle: (bounds: LngLatBounds, queryElevation: (coordinate: Coordinate) => number | null) => void
  compute: (bounds: LngLatBounds, queryElevation: (coordinate: Coordinate) => number | null) => Promise<void>
  setSelectedView: (view: HeatmapView) => void
}

export const useHeatmapStore = create<HeatmapState>((set, get) => ({
  status: 'idle',
  enabled: false,
  cells: [],
  errorReason: null,
  selectedView: 'combined',

  toggle: (bounds, queryElevation) => {
    const { enabled, cells } = get()
    if (enabled) {
      set({ enabled: false })
      return
    }
    set({ enabled: true })
    if (cells.length === 0) void get().compute(bounds, queryElevation)
  },

  compute: async (bounds, queryElevation) => {
    set({ status: 'loading', errorReason: null })
    try {
      const center: Coordinate = {
        lat: (bounds.north + bounds.south) / 2,
        lng: (bounds.east + bounds.west) / 2,
      }
      const [windField, weather, vegetationSamples] = await Promise.all([
        windProvider.fetchWindField(bounds, GRID_SIZE),
        weatherProvider.fetchForecast(center),
        vegetationProvider.fetchVegetationGrid(bounds, GRID_SIZE),
      ])

      const points = buildGrid(bounds, GRID_SIZE)
      const { waypoints } = useWaypointsStore.getState()
      const { tracks } = useTracksStore.getState()
      const now = new Date()

      const cells = points.map((coordinate, i) =>
        computeHeatmapCell(
          coordinate,
          queryElevation,
          windField,
          weather,
          vegetationSamples[i] ?? null,
          waypoints,
          tracks,
          now,
        ),
      )
      set({ status: 'ready', cells })
    } catch (err) {
      set({ status: 'error', errorReason: err instanceof Error ? err.message : 'Unknown error' })
    }
  },

  setSelectedView: (view) => set({ selectedView: view }),
}))

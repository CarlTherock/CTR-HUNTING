import { create } from 'zustand'
import { windProvider } from '@/services/wind'
import { windAt as windAtSample } from '@/utils/windField'
import type { LngLatBounds } from '@/utils/tiles'
import type { Coordinate, WeatherMapLayer, WindField, WindHourlyReading } from '@/types'

export type WindLayerStatus = 'idle' | 'loading' | 'available' | 'error'

/** grid resolution — 5x5 = 25 real sampled points per fetch, one batched
 * request (see `OpenMeteoWindProvider`). Enough spatial detail to see
 * genuine variation across a typical hunting-area viewport without
 * pushing toward the free-tier's per-minute call budget on frequent
 * re-fetches. */
const GRID_SIZE = 5

interface WindState {
  status: WindLayerStatus
  field: WindField | null
  errorReason: string | null
  /** Whether the flow-field layer is toggled on — kept separate from
   * `status` so turning it off doesn't discard the fetched field (no
   * need to re-fetch on toggling back on). */
  enabled: boolean
  /** Hourly index the timeline scrubber is on, 0 = soonest, up to 47
   * (both Open-Meteo fetches here and `weatherStore`'s cover a real 48h
   * window — `forecast_days=2`). Doubles as this app's shared timeline
   * cursor (Phase 10): `features/charts/components/AdvancedChart.tsx`,
   * `WeatherPage.tsx`, and `DayTimelineBar.tsx` all read/write this same
   * value rather than each owning a separate one, so dragging any one of
   * them moves all the others — reusing this store directly (an
   * established pattern in this app, see `WindComparisonPanel.tsx`)
   * rather than introducing a parallel "timeline" store that would just
   * have to stay in sync with this one. */
  selectedHourOffset: number
  /** Which Windy-style layer the map canvas renders — switching this
   * never re-fetches: temperature/precipitation/cloud cover already ride
   * along on the same batched grid request as wind (see
   * `OpenMeteoWindProvider`), so every layer is instantly available once
   * one fetch has landed. */
  activeLayer: WeatherMapLayer

  toggle: (bounds: LngLatBounds) => void
  fetch: (bounds: LngLatBounds) => Promise<void>
  setSelectedHourOffset: (offset: number) => void
  setActiveLayer: (layer: WeatherMapLayer) => void
  /** Real wind reading nearest `coordinate` at the currently scrubbed
   * hour — `null` if no field is loaded, never a guess. */
  windAt: (coordinate: Coordinate) => WindHourlyReading | null
}

export const useWindStore = create<WindState>((set, get) => ({
  status: 'idle',
  field: null,
  errorReason: null,
  enabled: false,
  selectedHourOffset: 0,
  activeLayer: 'wind',

  toggle: (bounds) => {
    const { enabled, field } = get()
    if (enabled) {
      set({ enabled: false })
      return
    }
    set({ enabled: true })
    if (!field) void get().fetch(bounds)
  },

  fetch: async (bounds) => {
    set({ status: 'loading' })
    try {
      const field = await windProvider.fetchWindField(bounds, GRID_SIZE)
      set({ status: 'available', field, errorReason: null })
    } catch (err) {
      set({ status: 'error', errorReason: err instanceof Error ? err.message : 'Unknown error' })
    }
  },

  setSelectedHourOffset: (offset) => set({ selectedHourOffset: Math.max(0, Math.min(47, offset)) }),

  setActiveLayer: (layer) => set({ activeLayer: layer }),

  windAt: (coordinate) => {
    const { field, selectedHourOffset } = get()
    if (!field) return null
    return windAtSample(field, coordinate, selectedHourOffset)
  },
}))

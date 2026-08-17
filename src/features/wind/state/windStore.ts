import { create } from 'zustand'
import { windProvider } from '@/services/wind'
import { windAt as windAtSample } from '@/utils/windField'
import type { LngLatBounds } from '@/utils/tiles'
import type { Coordinate, WindField, WindHourlyReading } from '@/types'

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
  /** Hourly index the timeline scrubber is on, 0 = soonest. */
  selectedHourOffset: number

  toggle: (bounds: LngLatBounds) => void
  fetch: (bounds: LngLatBounds) => Promise<void>
  setSelectedHourOffset: (offset: number) => void
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

  setSelectedHourOffset: (offset) => set({ selectedHourOffset: Math.max(0, Math.min(23, offset)) }),

  windAt: (coordinate) => {
    const { field, selectedHourOffset } = get()
    if (!field) return null
    return windAtSample(field, coordinate, selectedHourOffset)
  },
}))

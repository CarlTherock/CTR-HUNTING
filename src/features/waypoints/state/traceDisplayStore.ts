import { create } from 'zustand'
import { DEFAULT_TRIP_COLOR, sanitizeTripColor, type TrackFilter } from '../trackStyle'

interface TraceDisplayState {
  /** Which kinds of recorded traces are drawn on the map. */
  filter: TrackFilter
  setFilter: (filter: TrackFilter) => void
  /** Colour given to the NEXT normal trip (chosen before starting). */
  nextTripColor: string
  setNextTripColor: (color: string) => void
}

/** Display preferences only (kept in memory): changing them never touches
 * recorded data. */
export const useTraceDisplayStore = create<TraceDisplayState>((set) => ({
  filter: 'all',
  setFilter: (filter) => set({ filter }),
  nextTripColor: DEFAULT_TRIP_COLOR,
  setNextTripColor: (color) => set({ nextTripColor: sanitizeTripColor(color) }),
}))

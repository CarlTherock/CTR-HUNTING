import { create } from 'zustand'
import type { MapViewState } from '@/types'

/** Default camera: no assumed location — Phase 1 has no GPS yet (that's
 * slice 1.3), so we never guess the user's position. Zoom 12 (regional/
 * town scale) rather than 6 (whole-province scale), per user feedback
 * that the map opened too far out to be useful before a GPS fix or a
 * manual pan — doubled from the original default of 6. */
const DEFAULT_VIEW: MapViewState = {
  center: { lat: 46.8139, lng: -71.208 },
  zoom: 12,
  pitch: 0,
  bearing: 0,
}

interface MapState {
  view: MapViewState
  setView: (view: Partial<MapViewState>) => void
}

/**
 * Shared map viewport state. Zustand (not component state or context)
 * because the viewport is read by multiple decoupled components — this is
 * the same store later phases extend to synchronize the map with weather,
 * wind and the Phase 10 timeline cursor.
 */
export const useMapStore = create<MapState>((set) => ({
  view: DEFAULT_VIEW,
  setView: (partial) =>
    set((state) => ({
      view: { ...state.view, ...partial },
    })),
}))

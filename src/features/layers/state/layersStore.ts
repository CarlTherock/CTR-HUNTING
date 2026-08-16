import { create } from 'zustand'
import type { MapBaseLayerId, MapOverlayId } from '@/types'

interface LayersState {
  baseLayer: MapBaseLayerId
  setBaseLayer: (layer: MapBaseLayerId) => void
  overlays: Record<MapOverlayId, boolean>
  toggleOverlay: (overlay: MapOverlayId) => void
}

/**
 * Which base map style is active, and which overlays (slice 1.4:
 * trails, hydrography, contours) are shown on top of it. Separate from
 * `mapStore` (viewport): this is a layer-selection concern owned by
 * `features/layers`, not the map's camera.
 */
export const useLayersStore = create<LayersState>((set) => ({
  baseLayer: 'outdoor',
  setBaseLayer: (layer) => set({ baseLayer: layer }),
  overlays: { trails: true, hydrography: true, contours: true },
  toggleOverlay: (overlay) =>
    set((state) => ({
      overlays: { ...state.overlays, [overlay]: !state.overlays[overlay] },
    })),
}))

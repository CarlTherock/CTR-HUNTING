import { create } from 'zustand'
import type { MapBaseLayerId, MapOverlayId } from '@/types'

interface LayersState {
  baseLayer: MapBaseLayerId
  /** `true` once the user picked a layer themselves this session. Until
   * then `baseLayer` is just a placeholder the startup default replaces. */
  baseLayerChosenByUser: boolean
  /** The user's own choice (from the layer panel). */
  setBaseLayer: (layer: MapBaseLayerId) => void
  /** Applies the startup default without marking it as a user choice. */
  setInitialBaseLayer: (layer: MapBaseLayerId) => void
  /** Explicit, user-visible explanation when the map is not on the layer it
   * should be on (provider not configured, style failed to load). */
  baseLayerNotice: string | null
  setBaseLayerNotice: (notice: string | null) => void
  overlays: Record<MapOverlayId, boolean>
  toggleOverlay: (overlay: MapOverlayId) => void
}

/**
 * Which base map style is active, and which overlays (slice 1.4:
 * trails, hydrography, contours) are shown on top of it. Separate from
 * `mapStore` (viewport): this is a layer-selection concern owned by
 * `features/layers`, not the map's camera.
 *
 * The initial "outdoor" is only a placeholder: `MapPage` replaces it, against
 * the real `availableBaseLayers` (see `startupBaseLayer.ts`), right before
 * creating the map — so the app opens on the hybrid satellite view unless the
 * user chose otherwise this session. Kept out of this store on purpose: it
 * would otherwise import `services/map` at module load, which every test
 * mocking that module would then have to stub too.
 */
export const useLayersStore = create<LayersState>((set) => ({
  baseLayer: 'outdoor',
  baseLayerChosenByUser: false,
  setBaseLayer: (layer) =>
    set({ baseLayer: layer, baseLayerChosenByUser: true, baseLayerNotice: null }),
  setInitialBaseLayer: (layer) => set({ baseLayer: layer }),
  baseLayerNotice: null,
  setBaseLayerNotice: (notice) => set({ baseLayerNotice: notice }),
  overlays: { trails: true, hydrography: true, contours: true },
  toggleOverlay: (overlay) =>
    set((state) => ({
      overlays: { ...state.overlays, [overlay]: !state.overlays[overlay] },
    })),
}))

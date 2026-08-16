import { create } from 'zustand'
import type { MapBaseLayerId } from '@/types'

interface LayersState {
  baseLayer: MapBaseLayerId
  setBaseLayer: (layer: MapBaseLayerId) => void
}

/**
 * Which base map style is active. Separate from `mapStore` (viewport):
 * this is a layer-selection concern owned by `features/layers`, not the
 * map's camera — kept apart so each can grow independently as slice 1.4
 * (additional, independently-toggleable overlays) builds on this.
 */
export const useLayersStore = create<LayersState>((set) => ({
  baseLayer: 'outdoor',
  setBaseLayer: (layer) => set({ baseLayer: layer }),
}))

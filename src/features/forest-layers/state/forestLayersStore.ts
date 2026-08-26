import { create } from 'zustand'
import type { ForestLayerId } from '@/types'

interface ForestLayersState {
  /** Which real Québec government layers (`services/map/
   * forestLayerTiles.ts`) are currently shown — absent/false means off.
   * Independent toggles: any combination can be on at once, same as the
   * map's other overlay panels. */
  enabled: Partial<Record<ForestLayerId, boolean>>
  opacity: number
  toggle: (id: ForestLayerId) => void
  setOpacity: (opacity: number) => void
}

export const useForestLayersStore = create<ForestLayersState>((set) => ({
  enabled: {},
  opacity: 0.65,

  toggle: (id) =>
    set((state) => ({ enabled: { ...state.enabled, [id]: !state.enabled[id] } })),

  setOpacity: (opacity) => set({ opacity: Math.max(0, Math.min(1, opacity)) }),
}))

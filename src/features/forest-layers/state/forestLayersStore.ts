import { create } from 'zustand'
import type { ForestLayerId, OverlayStatus } from '@/types'

interface ForestLayersState {
  /** Which real Québec government layers (`services/map/
   * forestLayerTiles.ts`) are currently shown — absent/false means off.
   * Independent toggles: any combination can be on at once, same as the
   * map's other overlay panels. */
  enabled: Partial<Record<ForestLayerId, boolean>>
  /** Default opacity, used by every layer without its own value. */
  opacity: number
  /** Per-layer opacity (e.g. the LiDAR relief over the satellite view). */
  layerOpacity: Partial<Record<ForestLayerId, number>>
  /** Load state reported by the map engine, per enabled layer. */
  status: Partial<Record<ForestLayerId, OverlayStatus>>
  toggle: (id: ForestLayerId) => void
  setOpacity: (opacity: number) => void
  setLayerOpacity: (id: ForestLayerId, opacity: number) => void
  setStatus: (id: ForestLayerId, status: OverlayStatus) => void
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/** Opacity actually applied to a layer. */
export function effectiveOpacity(
  state: Pick<ForestLayersState, 'opacity' | 'layerOpacity'>,
  id: ForestLayerId,
): number {
  return state.layerOpacity[id] ?? state.opacity
}

export const useForestLayersStore = create<ForestLayersState>((set) => ({
  enabled: {},
  opacity: 0.65,
  layerOpacity: {},
  status: {},

  toggle: (id) =>
    set((state) => ({ enabled: { ...state.enabled, [id]: !state.enabled[id] } })),

  setOpacity: (opacity) => set({ opacity: clamp01(opacity) }),

  setLayerOpacity: (id, opacity) =>
    set((state) => ({ layerOpacity: { ...state.layerOpacity, [id]: clamp01(opacity) } })),

  setStatus: (id, status) =>
    set((state) => ({ status: { ...state.status, [id]: status } })),
}))

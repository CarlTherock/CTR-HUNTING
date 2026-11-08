import { create } from 'zustand'

export type HuntLayerKey = 'sectors' | 'candidates' | 'corridors' | 'extent'
export const DEFAULT_HUNT_LAYERS: Record<HuntLayerKey, boolean> = {
  sectors: true, candidates: true, corridors: true, extent: true,
}
interface PresentationState {
  dateKey: string | null
  layers: Record<HuntLayerKey, boolean>
  setDateKey(dateKey: string): void
  setLayer(key: HuntLayerKey, visible: boolean): void
}
/** Présentation seulement : aucun score ni enregistrement d'analyse n'est modifié. */
export const useHuntPresentationStore = create<PresentationState>((set) => ({
  dateKey: null,
  layers: { ...DEFAULT_HUNT_LAYERS },
  setDateKey: (dateKey) => set({ dateKey }),
  setLayer: (key, visible) => set((s) => ({ layers: { ...s.layers, [key]: visible } })),
}))

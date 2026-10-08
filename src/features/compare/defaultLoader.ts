import { useHeatmapStore } from '@/features/analytics/state/heatmapStore'
import { useWindStore } from '@/features/wind/state/windStore'
import { vegetationProvider } from '@/services/vegetation'
import { windProvider } from '@/services/wind'
import { CompareDataLoader } from './compareData'
import type { SharedWindCandidate } from './compareData'

/** Vent déjà chargé ailleurs : la couche de vent de la carte et la carte de
 * potentiel. Lecture seule, aucune requête. */
export function sharedWindFromStores(): SharedWindCandidate[] {
  const candidates: SharedWindCandidate[] = []
  const wind = useWindStore.getState()
  if (wind.field && wind.fetchedAt) {
    candidates.push({
      field: wind.field,
      fetchedAt: wind.fetchedAt,
      origin: 'couche de vent de la carte',
    })
  }
  const heatmap = useHeatmapStore.getState()
  if (heatmap.windField && heatmap.computedAt) {
    candidates.push({
      field: heatmap.windField,
      fetchedAt: heatmap.computedAt,
      origin: 'carte de potentiel',
    })
  }
  return candidates
}

/** Le chargeur de l'application : fournisseurs réels derrière leurs
 * adaptateurs (`services/wind`, `services/vegetation`). */
export const compareDataLoader = new CompareDataLoader({
  fetchWind: (bounds, gridSize, signal) =>
    windProvider.fetchWindField(bounds, gridSize, signal),
  fetchVegetation: (bounds, gridSize, signal) =>
    vegetationProvider.fetchVegetationGrid(bounds, gridSize, signal),
  nowMs: () => Date.now(),
  sharedWind: sharedWindFromStores,
})

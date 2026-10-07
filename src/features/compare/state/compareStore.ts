import { create } from 'zustand'
import { listObservations } from '@/database/observationsRepository'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { buildHourOptions } from '@/utils/analysisTime'
import type { HourOption } from '@/utils/analysisTime'
import type { Observation } from '@/types'
import { isAbortError } from '../compareData'
import type { CompareDataLoader, CompareDataset } from '../compareData'
import { compareDataLoader } from '../defaultLoader'
import { MAX_WAYPOINTS } from '../criteria'
import type { CompareRecords } from '../types'

export type CompareStatus = 'idle' | 'loading' | 'ready'

interface CompareState {
  /** Ids sélectionnés dans la liste (2 à 4 pour comparer), dans l'ordre de sélection. */
  selectedIds: string[]
  panelOpen: boolean
  /** Heure choisie (`YYYY-MM-DDTHH:00`) ; `null` = l'heure en cours. */
  hourKey: string | null
  status: CompareStatus
  dataset: CompareDataset | null
  records: CompareRecords
  /** Horodatage de la dernière lecture réussie (ISO). */
  loadedAt: string | null

  toggleSelected: (id: string) => void
  /** Retire de la sélection les ids qui ne sont plus visibles (filtre de
   * territoire) ou qui n'existent plus. */
  pruneSelection: (visibleIds: readonly string[]) => void
  clearSelection: () => void
  openPanel: () => void
  closePanel: () => void
  setHourKey: (hourKey: string | null) => void
  /** Recharge les données de la sélection courante. L'appel précédent
   * encore en cours est ANNULÉ (AbortController) et son résultat ignoré. */
  load: () => Promise<void>
  /** Vide le cache mémoire puis recharge (bouton « Actualiser »). */
  refresh: () => Promise<void>
}

const EMPTY_RECORDS: CompareRecords = {
  waypoints: [],
  tracks: [],
  observations: [],
  readAt: null,
}

let currentController: AbortController | null = null

async function readObservations(): Promise<Observation[]> {
  try {
    return await listObservations()
  } catch {
    return []
  }
}

/** Fabrique le store ; `loader` est injectable pour les tests. */
export function createCompareStore(loader: CompareDataLoader) {
  return create<CompareState>((set, get) => ({
    selectedIds: [],
    panelOpen: false,
    hourKey: null,
    status: 'idle',
    dataset: null,
    records: EMPTY_RECORDS,
    loadedAt: null,

    toggleSelected: (id) =>
      set((state) => {
        if (state.selectedIds.includes(id)) {
          return { selectedIds: state.selectedIds.filter((x) => x !== id) }
        }
        if (state.selectedIds.length >= MAX_WAYPOINTS) return state
        return { selectedIds: [...state.selectedIds, id] }
      }),

    pruneSelection: (visibleIds) => {
      const visible = new Set(visibleIds)
      const { selectedIds } = get()
      const kept = selectedIds.filter((id) => visible.has(id))
      if (kept.length !== selectedIds.length) set({ selectedIds: kept })
    },

    clearSelection: () => set({ selectedIds: [] }),

    // Le panneau recharge lui-même quand il est ouvert ou que la sélection change.
    openPanel: () => set({ panelOpen: true }),

    closePanel: () => {
      currentController?.abort()
      currentController = null
      set({ panelOpen: false, status: 'idle' })
    },

    setHourKey: (hourKey) => set({ hourKey }),

    refresh: () => {
      loader.clearCache()
      return get().load()
    },

    load: async () => {
      currentController?.abort()
      const controller = new AbortController()
      currentController = controller

      const waypoints = useWaypointsStore.getState().waypoints
      const selected = get()
        .selectedIds.map((id) => waypoints.find((w) => w.id === id))
        .filter((w): w is NonNullable<typeof w> => w !== undefined)
      if (selected.length < 2) {
        set({ status: 'idle', dataset: null })
        return
      }

      set({ status: 'loading' })
      try {
        const [dataset, observations] = await Promise.all([
          loader.load(
            selected.map((w) => w.coordinate),
            controller.signal,
          ),
          readObservations(),
        ])
        // Sélection modifiée entre-temps : ce résultat est périmé.
        if (currentController !== controller || controller.signal.aborted) return
        const readAt = new Date().toISOString()
        set({
          status: 'ready',
          dataset,
          loadedAt: readAt,
          records: {
            waypoints,
            tracks: useTracksStore.getState().tracks,
            observations,
            readAt,
          },
        })
      } catch (error) {
        if (isAbortError(error) || currentController !== controller) return
        // `load` ne rejette que pour une annulation ; tout autre cas est un bug
        // inattendu : on l'affiche comme vent/végétation indisponibles.
        const reason = error instanceof Error ? error.message : 'erreur inconnue'
        set({
          status: 'ready',
          dataset: {
            key: 'error',
            bounds: { south: 0, west: 0, north: 0, east: 0 },
            windField: null,
            wind: { status: 'error', reason },
            windOrigin: null,
            windOriginLabel: null,
            vegetation: null,
            vegetationState: { status: 'error', reason },
            vegetationOrigin: null,
          },
        })
      }
    },
  }))
}

export const useCompareStore = createCompareStore(compareDataLoader)

/** Heures réellement présentes dans le vent chargé (rien d'extrapolé). */
export function availableHours(dataset: CompareDataset | null, now: Date): HourOption[] {
  if (!dataset?.windField) return []
  return buildHourOptions(dataset.windField, null, now).filter((o) => o.hasWind)
}

/** Heure à utiliser : celle choisie si elle existe dans les données, sinon
 * l'heure en cours si elle y est, sinon la première heure disponible. */
export function effectiveHourKey(
  requested: string | null,
  options: readonly HourOption[],
): string | null {
  if (options.length === 0) return null
  if (requested && options.some((o) => o.hourKey === requested)) return requested
  const current = options.find((o) => o.kind === 'current')
  if (current) return null
  return options[0].hourKey
}

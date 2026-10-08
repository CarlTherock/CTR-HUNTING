import { create } from 'zustand'
import { getSetting, setSetting } from '@/database/settingsRepository'
import {
  archiveTerritory,
  countTerritoryContents,
  createTerritory,
  deleteTerritoryKeepingContent,
  listTerritories,
  restoreTerritory,
  totalContents,
  updateTerritory,
} from '@/database/territoriesRepository'
import type { TerritoryContents } from '@/database/territoriesRepository'
import {
  ALL_TERRITORIES,
  UNCLASSIFIED_LABEL,
  activeTerritoryIdFor,
  parseStoredFilter,
} from '../filter'
import type { TerritoryFilter } from '../filter'
import type { Territory } from '@/types'

const FILTER_SETTING_KEY = 'territoryFilter'
export const MAX_TERRITORY_NAME_LENGTH = 80

export type TerritoryResult =
  { ok: true; territory: Territory } | { ok: false; error: string }

/** A deletion waiting for the user's explicit confirmation. */
export interface PendingTerritoryDelete {
  id: string
  name: string
  /** Items that will be moved to « Non classé » (never deleted). */
  contents: TerritoryContents
}

interface TerritoriesState {
  territories: Territory[]
  loaded: boolean
  /** Shared by the Waypoints, Traces and Journal lists and by the map. */
  filter: TerritoryFilter
  pendingDelete: PendingTerritoryDelete | null
  /** Last failure to read/write territories, shown to the user. */
  error: string | null

  load: () => Promise<void>
  create: (name: string, notes?: string) => Promise<TerritoryResult>
  rename: (id: string, name: string) => Promise<TerritoryResult>
  archive: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
  setFilter: (filter: TerritoryFilter) => void
  /** Step 1 of a deletion: counts the content and asks for confirmation.
   * Nothing is changed. */
  requestDelete: (id: string) => Promise<void>
  cancelDelete: () => void
  /** Step 2: deletes the folder and moves its content to « Non classé ».
   * Returns the number of items moved, or `null` if there was nothing
   * pending or the write failed (then nothing changed). */
  confirmDelete: () => Promise<TerritoryContents | null>
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'erreur inconnue'
}

/** Normalises for comparison: case and accents ignored. */
function comparable(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-CA')
}

/** Returns the cleaned name, or an error message in French. */
export function validateTerritoryName(
  raw: string,
  territories: readonly Territory[],
  selfId?: string,
): { name: string } | { error: string } {
  const name = raw.trim().replace(/\s+/g, ' ')
  if (!name) return { error: 'Donnez un nom au territoire.' }
  if (name.length > MAX_TERRITORY_NAME_LENGTH) {
    return { error: `Le nom est limité à ${MAX_TERRITORY_NAME_LENGTH} caractères.` }
  }
  const key = comparable(name)
  if (key === comparable(UNCLASSIFIED_LABEL)) {
    return {
      error: `« ${UNCLASSIFIED_LABEL} » est réservé aux éléments sans territoire.`,
    }
  }
  if (territories.some((t) => t.id !== selfId && comparable(t.name) === key)) {
    return { error: 'Un territoire porte déjà ce nom.' }
  }
  return { name }
}

/** Called after a territory was deleted so the other stores can drop the
 * stale `territoryId` from their in-memory copies (the database was already
 * updated by the same transaction). Registered by the stores that hold
 * territory-tagged items; this store does not import them. */
type ReleaseListener = (territoryId: string) => void
const releaseListeners = new Set<ReleaseListener>()
export function onTerritoryDeleted(listener: ReleaseListener): void {
  releaseListeners.add(listener)
}

export const useTerritoriesStore = create<TerritoriesState>((set, get) => {
  function persistFilter(filter: TerritoryFilter) {
    // A preference: if storage is unavailable the filter just does not
    // survive a reload.
    try {
      void setSetting(FILTER_SETTING_KEY, filter).catch(() => undefined)
    } catch {
      /* ignore */
    }
  }

  return {
    territories: [],
    loaded: false,
    filter: ALL_TERRITORIES,
    pendingDelete: null,
    error: null,

    load: async () => {
      try {
        const territories = await listTerritories()
        let filter: TerritoryFilter = ALL_TERRITORIES
        try {
          filter = parseStoredFilter(
            await getSetting<unknown>(FILTER_SETTING_KEY, null),
            territories,
          )
        } catch {
          /* unreadable preference: show everything */
        }
        set({ territories, filter, loaded: true, error: null })
      } catch (error) {
        set({
          loaded: true,
          error: `Territoires illisibles sur l’appareil : ${describeError(error)}.`,
        })
      }
    },

    create: async (name, notes) => {
      const checked = validateTerritoryName(name, get().territories)
      if ('error' in checked) return { ok: false, error: checked.error }
      try {
        const territory = await createTerritory({
          name: checked.name,
          notes: notes?.trim() || undefined,
        })
        set((state) => ({ territories: [...state.territories, territory], error: null }))
        return { ok: true, territory }
      } catch (error) {
        return {
          ok: false,
          error: `Création impossible : ${describeError(error)}.`,
        }
      }
    },

    rename: async (id, name) => {
      const existing = get().territories.find((t) => t.id === id)
      if (!existing) return { ok: false, error: 'Territoire introuvable.' }
      const checked = validateTerritoryName(name, get().territories, id)
      if ('error' in checked) return { ok: false, error: checked.error }
      try {
        await updateTerritory(id, { name: checked.name })
        const updated = {
          ...existing,
          name: checked.name,
          updatedAt: new Date().toISOString(),
        }
        set((state) => ({
          territories: state.territories.map((t) => (t.id === id ? updated : t)),
          error: null,
        }))
        return { ok: true, territory: updated }
      } catch (error) {
        return {
          ok: false,
          error: `Renommage impossible : ${describeError(error)}.`,
        }
      }
    },

    archive: async (id) => {
      try {
        const archivedAt = await archiveTerritory(id)
        // An archived territory is no longer selectable: do not stay
        // filtered on it.
        const { filter } = get()
        const resetFilter = filter.kind === 'territory' && filter.id === id
        set((state) => ({
          territories: state.territories.map((t) =>
            t.id === id ? { ...t, archivedAt, updatedAt: archivedAt } : t,
          ),
          filter: resetFilter ? ALL_TERRITORIES : state.filter,
          error: null,
        }))
        if (resetFilter) persistFilter(ALL_TERRITORIES)
      } catch (error) {
        set({ error: `Archivage impossible : ${describeError(error)}.` })
      }
    },

    restore: async (id) => {
      try {
        await restoreTerritory(id)
        set((state) => ({
          territories: state.territories.map((t) => {
            if (t.id !== id) return t
            const restored: Territory = { ...t, updatedAt: new Date().toISOString() }
            delete restored.archivedAt
            return restored
          }),
          error: null,
        }))
      } catch (error) {
        set({ error: `Restauration impossible : ${describeError(error)}.` })
      }
    },

    setFilter: (filter) => {
      set({ filter })
      persistFilter(filter)
    },

    requestDelete: async (id) => {
      const territory = get().territories.find((t) => t.id === id)
      if (!territory) return
      try {
        const contents = await countTerritoryContents(id)
        set({
          pendingDelete: { id, name: territory.name, contents },
          error: null,
        })
      } catch (error) {
        set({ error: `Suppression impossible : ${describeError(error)}.` })
      }
    },

    cancelDelete: () => set({ pendingDelete: null }),

    confirmDelete: async () => {
      const pending = get().pendingDelete
      if (!pending) return null
      try {
        const moved = await deleteTerritoryKeepingContent(pending.id)
        const { filter } = get()
        const resetFilter = filter.kind === 'territory' && filter.id === pending.id
        set((state) => ({
          territories: state.territories.filter((t) => t.id !== pending.id),
          pendingDelete: null,
          filter: resetFilter ? ALL_TERRITORIES : state.filter,
          error: null,
        }))
        if (resetFilter) persistFilter(ALL_TERRITORIES)
        releaseListeners.forEach((listener) => listener(pending.id))
        return moved
      } catch (error) {
        set({
          pendingDelete: null,
          error: `Suppression impossible, rien n’a été modifié : ${describeError(error)}.`,
        })
        return null
      }
    },
  }
})

/** The territory new items are filed in (see `activeTerritoryIdFor`). */
export function getActiveTerritoryId(): string | undefined {
  const { filter, territories } = useTerritoriesStore.getState()
  return activeTerritoryIdFor(filter, territories)
}

export { totalContents }
export type { TerritoryContents }

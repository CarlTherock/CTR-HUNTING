import { create } from 'zustand'
import {
  deleteAllLocalData,
  summarizeLocalData,
  type LocalDataSummary,
} from '@/database/wipeRepository'
import { clearOfflineCaches } from '@/offline/clearOfflineCaches'
import { reloadDataStores, useBackupStore } from '@/features/backup/state/backupStore'
import { useGuidanceStore } from '@/features/guidance/state/guidanceStore'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWeatherStore } from '@/features/weather/state/weatherStore'

/** The word to type for the second confirmation step. */
export const CONFIRMATION_WORD = 'SUPPRIMER'

export type DeletionStep = 'closed' | 'review' | 'confirm' | 'running' | 'done' | 'error'

interface DataDeletionState {
  step: DeletionStep
  summary: LocalDataSummary | null
  /** Why deleting is refused right now (recording, download in progress…). */
  blocker: string | null
  /** Failure message when nothing could be deleted. */
  error: string | null
  /** Set after a successful deletion when the tile caches could not be removed. */
  cacheWarning: string | null

  /** Step 1: reads and shows what would be deleted. Deletes nothing. */
  open: () => Promise<void>
  /** Review → confirmation. Still deletes nothing. */
  goToConfirm: () => void
  back: () => void
  cancel: () => void
  /** Step 2: deletes, but only from the `confirm` step and with the typed word. */
  confirmDelete: (typed: string) => Promise<boolean>
}

/** Something running right now would write into the database while it is
 * being emptied, or be cut off: the user must finish it first. */
function currentBlocker(): string | null {
  if (useTracksStore.getState().status !== 'idle') {
    return 'Un enregistrement de trace est en cours. Arrêtez-le avant de supprimer vos données.'
  }
  if (useOfflineStore.getState().mode === 'downloading') {
    return 'Un téléchargement de carte est en cours. Annulez-le ou attendez sa fin avant de supprimer vos données.'
  }
  return null
}

function describeError(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'erreur inconnue'
}

export const useDataDeletionStore = create<DataDeletionState>((set, get) => ({
  step: 'closed',
  summary: null,
  blocker: null,
  error: null,
  cacheWarning: null,

  open: async () => {
    set({ error: null, cacheWarning: null, blocker: currentBlocker() })
    try {
      const summary = await summarizeLocalData()
      set({ step: 'review', summary })
    } catch (error) {
      set({
        step: 'error',
        summary: null,
        error: `Impossible de lire les données de cet appareil : ${describeError(error)}. Rien n’a été supprimé.`,
      })
    }
  },

  goToConfirm: () => {
    if (get().step !== 'review') return
    const blocker = currentBlocker()
    if (blocker) {
      set({ blocker })
      return
    }
    set({ step: 'confirm', blocker: null })
  },

  back: () => {
    if (get().step === 'confirm') set({ step: 'review' })
  },

  cancel: () => {
    if (get().step === 'running') return
    set({ step: 'closed', summary: null, blocker: null, error: null, cacheWarning: null })
  },

  confirmDelete: async (typed) => {
    if (get().step !== 'confirm') return false
    if (typed.trim().toLocaleUpperCase('fr-CA') !== CONFIRMATION_WORD) return false
    const blocker = currentBlocker()
    if (blocker) {
      set({ step: 'review', blocker })
      return false
    }

    set({ step: 'running', error: null, cacheWarning: null })
    try {
      // One transaction: either everything is deleted or nothing is.
      await deleteAllLocalData()
    } catch (error) {
      set({
        step: 'error',
        error: `La suppression a échoué (${describeError(error)}). Aucune donnée n’a été supprimée.`,
      })
      return false
    }

    // Tiles live in Cache Storage (not transactional): removed only after the
    // database is empty, so a failure here never leaves areas marked
    // « Terminée » with their tiles already gone.
    let cacheWarning: string | null = null
    try {
      await clearOfflineCaches()
    } catch (error) {
      cacheWarning = `Vos données sont supprimées, mais les tuiles de carte hors ligne n’ont pas pu être retirées (${describeError(error)}). Videz les données du site dans les réglages du navigateur pour les effacer.`
    }

    // In-memory copies must not keep showing deleted data.
    useGuidanceStore.getState().stop()
    useWeatherStore.setState({
      status: 'idle',
      forecast: null,
      coordinate: null,
      fetchedAt: null,
      isCached: false,
      errorReason: null,
    })
    await reloadDataStores()
    await useBackupStore.getState().loadStatus()

    set({ step: 'done', summary: null, cacheWarning })
    return true
  },
}))

export type { LocalDataSummary }

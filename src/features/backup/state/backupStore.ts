import { create } from 'zustand'
import {
  countUserData,
  getLastBackupAt,
  getReminderDismissedUntil,
  setLastBackupAt,
  setReminderDismissedUntil,
} from '@/database/backupRepository'
import type { BackupCounts } from '../backupReminder'
import {
  getStoragePersistence,
  requestStoragePersistence,
  type PersistenceState,
} from '@/services/storagePersistence'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useJournalStore } from '@/features/journal/state/journalStore'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import type { Progress } from '../core/tasks'
import { downloadBlob } from '../download'
import type { ConflictMode, RestoreReport } from '../engine/restoreApply'
import type { RestorePlan } from '../engine/restorePlan'
import type { BackupManifest } from '../engine/format'

/** In-memory stores keep copies of the tables; after a restore/import they
 * must be reloaded or the new data would stay invisible until a restart. */
export async function reloadDataStores(): Promise<void> {
  await Promise.allSettled([
    useWaypointsStore.getState().load(),
    useTracksStore.getState().load(),
    useJournalStore.getState().load(),
    useOfflineStore.getState().load(),
  ])
}

export interface BackupResult {
  blob: Blob
  fileName: string
  bytes: number
  photoCount: number
  createdAt: string
  counts: BackupManifest['counts']
}

type BackupStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled'
type RestoreStatus =
  'idle' | 'reading' | 'preview' | 'applying' | 'done' | 'error' | 'cancelled'

interface BackupState {
  lastBackupAt: string | null
  counts: BackupCounts
  dismissedUntil: string | null
  persistence: PersistenceState | 'unknown'
  statusLoaded: boolean

  backupStatus: BackupStatus
  backupProgress: Progress | null
  backupError: string | null
  backupResult: BackupResult | null

  restoreStatus: RestoreStatus
  restoreProgress: Progress | null
  restoreError: string | null
  restoreFileName: string | null
  plan: RestorePlan | null
  mode: ConflictMode
  report: RestoreReport | null

  loadStatus: () => Promise<void>
  /** Hides the reminder for 3 days. */
  dismissReminder: () => Promise<void>
  requestPersistence: () => Promise<void>
  startBackup: () => Promise<void>
  cancel: () => void
  chooseRestoreFile: (file: File) => Promise<void>
  setMode: (mode: ConflictMode) => void
  confirmRestore: () => Promise<void>
  resetRestore: () => void
}

let controller: AbortController | null = null

function describe(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'erreur inconnue'
}

function isCancel(error: unknown): boolean {
  return error instanceof Error && error.name === 'BackupCancelledError'
}

export const useBackupStore = create<BackupState>((set, get) => ({
  lastBackupAt: null,
  counts: { waypoints: 0, tracks: 0, observations: 0 },
  dismissedUntil: null,
  persistence: 'unknown',
  statusLoaded: false,

  backupStatus: 'idle',
  backupProgress: null,
  backupError: null,
  backupResult: null,

  restoreStatus: 'idle',
  restoreProgress: null,
  restoreError: null,
  restoreFileName: null,
  plan: null,
  mode: 'keep-local',
  report: null,

  loadStatus: async () => {
    const [lastBackupAt, dismissedUntil, counts, persistence] = await Promise.all([
      getLastBackupAt().catch(() => null),
      getReminderDismissedUntil().catch(() => null),
      countUserData().catch(() => null),
      getStoragePersistence(),
    ])
    set({
      lastBackupAt,
      dismissedUntil,
      counts: counts
        ? {
            waypoints: counts.waypoints,
            tracks: counts.tracks,
            observations: counts.observations,
          }
        : { waypoints: 0, tracks: 0, observations: 0 },
      persistence,
      statusLoaded: true,
    })
  },

  dismissReminder: async () => {
    const until = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    set({ dismissedUntil: until })
    await setReminderDismissedUntil(until).catch(() => undefined)
  },

  requestPersistence: async () => {
    set({ persistence: await requestStoragePersistence() })
  },

  startBackup: async () => {
    if (get().backupStatus === 'running') return
    controller = new AbortController()
    set({
      backupStatus: 'running',
      backupProgress: null,
      backupError: null,
      backupResult: null,
    })
    try {
      // fflate and the whole engine are only fetched now (lazy chunk).
      const { createBackup } = await import('../engine/backupCreate')
      const result = await createBackup({
        signal: controller.signal,
        onProgress: (progress) => set({ backupProgress: progress }),
      })
      await setLastBackupAt(result.manifest.createdAt)
      set({
        backupStatus: 'done',
        lastBackupAt: result.manifest.createdAt,
        backupResult: {
          blob: result.blob,
          fileName: result.fileName,
          bytes: result.blob.size,
          photoCount: result.photoCount,
          createdAt: result.manifest.createdAt,
          counts: result.manifest.counts,
        },
      })
      downloadBlob(result.blob, result.fileName)
      // First successful backup: ask the browser for persistent storage
      // (a request, not a guarantee; the answer is shown as-is).
      if (get().persistence !== 'granted') void get().requestPersistence()
    } catch (error) {
      if (isCancel(error)) set({ backupStatus: 'cancelled' })
      else set({ backupStatus: 'error', backupError: describe(error) })
    } finally {
      controller = null
    }
  },

  cancel: () => controller?.abort(),

  chooseRestoreFile: async (file) => {
    controller = new AbortController()
    set({
      restoreStatus: 'reading',
      restoreProgress: null,
      restoreError: null,
      restoreFileName: file.name,
      plan: null,
      report: null,
      mode: 'keep-local',
    })
    try {
      const [{ readBackup }, { planRestore }] = await Promise.all([
        import('../engine/backupRead'),
        import('../engine/restorePlan'),
      ])
      const options = {
        signal: controller.signal,
        onProgress: (progress: Progress) => set({ restoreProgress: progress }),
      }
      const parsed = await readBackup(file, options)
      const plan = await planRestore(parsed, options)
      set({ restoreStatus: 'preview', plan })
    } catch (error) {
      if (isCancel(error)) set({ restoreStatus: 'cancelled', plan: null })
      else set({ restoreStatus: 'error', restoreError: describe(error), plan: null })
    } finally {
      controller = null
    }
  },

  setMode: (mode) => set({ mode }),

  confirmRestore: async () => {
    const { plan, mode } = get()
    if (!plan || get().restoreStatus !== 'preview') return
    controller = new AbortController()
    set({ restoreStatus: 'applying', restoreProgress: null })
    try {
      const { applyRestore } = await import('../engine/restoreApply')
      const report = await applyRestore(plan, {
        mode,
        signal: controller.signal,
        onProgress: (progress) => set({ restoreProgress: progress }),
      })
      await reloadDataStores()
      set({ restoreStatus: 'done', report, plan: null })
      void get().loadStatus()
    } catch (error) {
      if (isCancel(error)) set({ restoreStatus: 'cancelled', plan: null })
      else set({ restoreStatus: 'error', restoreError: describe(error), plan: null })
    } finally {
      controller = null
    }
  },

  resetRestore: () =>
    set({
      restoreStatus: 'idle',
      restoreProgress: null,
      restoreError: null,
      restoreFileName: null,
      plan: null,
      report: null,
      mode: 'keep-local',
    }),
}))

import { create } from 'zustand'
import {
  createOfflineArea,
  deleteOfflineArea as deleteOfflineAreaRecord,
  listOfflineAreas,
  updateOfflineArea,
} from '@/database/offlineAreasRepository'
import { deleteTiles } from '@/offline/tileCache'
import { emptyDownloadSummary } from '@/services/map/downloadLedger'
import { deriveAreaStatus } from '../areaStatus'
import type { DownloadAreaProgress, MapInstance } from '@/services/map'
import { tileCountForBounds } from '@/utils/tiles'
import type { LngLatBounds } from '@/utils/tiles'
import type { MapBaseLayerId, OfflineArea, OfflineAreaStatus } from '@/types'

export type OfflineSelectionMode = 'idle' | 'selecting' | 'downloading'

interface OfflineState {
  areas: OfflineArea[]
  loaded: boolean
  mode: OfflineSelectionMode
  /** Extra zoom levels beyond the current view to also download (0–3) —
   * more levels means more detail once zoomed in offline, at the cost of
   * more tiles. */
  extraZoomLevels: number
  /** Captured once, when the user arms selection — frozen even if they
   * keep panning behind the selection panel, so "start download" always
   * downloads exactly what was framed at that moment. */
  selectedBounds: LngLatBounds | null
  selectedZoom: number | null
  activeAreaId: string | null
  downloadProgress: DownloadAreaProgress | null
  /** Area whose download run just ended — drives the result banner on the
   * map until the user dismisses it. */
  lastResultAreaId: string | null

  load: () => Promise<void>
  startSelecting: (bounds: LngLatBounds, zoom: number) => void
  cancelSelecting: () => void
  setExtraZoomLevels: (levels: number) => void
  startDownload: (map: MapInstance, baseLayer: MapBaseLayerId) => Promise<void>
  /** Re-downloads an *existing* area's same bounds/zoom range — e.g. after
   * reconnecting, to pick up tiles that may have changed since it was
   * first saved. Overwrites that area's record in place rather than
   * creating a new one. */
  refreshArea: (map: MapInstance, area: OfflineArea) => Promise<void>
  /** Resumes an incomplete / interrupted / failed area on the same record:
   * tiles already cached are reused, only missing ones are re-fetched. */
  retryArea: (map: MapInstance, area: OfflineArea) => Promise<void>
  cancelDownload: () => void
  dismissResult: () => void
  deleteArea: (id: string) => Promise<void>
}

let nextDefaultNumber = 1
let activeAbortController: AbortController | null = null
/** Minimum delay between two progress writes to IndexedDB. */
const PERSIST_INTERVAL_MS = 500

const union = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])]

export const useOfflineStore = create<OfflineState>((set, get) => {
  /** Shared by `startDownload`, `refreshArea` and `retryArea` — all run the
   * same download-and-persist sequence against an already-created `area`
   * record. Tiles already in the cache are reused (cache-first), so a retry
   * only re-fetches what is missing; `tileUrls` are merged, never replaced,
   * and nothing already cached is ever deleted on cancel/failure. */
  async function runDownload(
    map: MapInstance,
    area: OfflineArea,
    bounds: LngLatBounds,
    minZoom: number,
    maxZoom: number,
  ): Promise<void> {
    if (activeAbortController) return // one download at a time
    const controller = new AbortController()
    activeAbortController = controller

    const baselineUrls = area.tileUrls
    const baselineBytes = area.bytesDownloaded
    const attempts = (area.attempts ?? 0) + 1
    const lastAttemptAt = new Date().toISOString()
    const patchArea = (patch: Partial<OfflineArea>) =>
      set((state) => ({
        areas: state.areas.map((a) => (a.id === area.id ? { ...a, ...patch } : a)),
      }))

    const initial: DownloadAreaProgress = {
      tilesDownloaded: 0,
      bytesDownloaded: 0,
      tileUrls: [],
      summary: emptyDownloadSummary(),
    }
    set({
      mode: 'downloading',
      activeAreaId: area.id,
      downloadProgress: initial,
      lastResultAreaId: null,
    })
    patchArea({ status: 'downloading', attempts, lastAttemptAt })
    await updateOfflineArea(area.id, {
      status: 'downloading',
      attempts,
      lastAttemptAt,
      lastError: undefined,
    })

    /** What gets stored for a run's progress: this run's numbers on top of
     * what earlier runs already cached. */
    const merged = (progress: DownloadAreaProgress) => ({
      tilesDownloaded: progress.tilesDownloaded,
      bytesDownloaded: baselineBytes + progress.bytesDownloaded,
      tileUrls: union(baselineUrls, progress.tileUrls),
      summary: progress.summary,
    })

    let lastPersist = 0
    try {
      const result = await map.downloadArea(
        bounds,
        minZoom,
        maxZoom,
        (progress) => {
          set({ downloadProgress: progress })
          const now = Date.now()
          if (now - lastPersist < PERSIST_INTERVAL_MS) return
          lastPersist = now
          void updateOfflineArea(area.id, merged(progress))
        },
        controller.signal,
      )
      const status = deriveAreaStatus(result.summary)
      const patch: Partial<OfflineArea> = {
        ...merged(result),
        status,
        ...(status === 'complete' ? { completedAt: new Date().toISOString() } : {}),
      }
      await updateOfflineArea(area.id, patch)
      set({
        mode: 'idle',
        activeAreaId: null,
        downloadProgress: null,
        lastResultAreaId: area.id,
      })
      patchArea(patch)
    } catch (err) {
      const isCancelled = err instanceof DOMException && err.name === 'AbortError'
      const progress = get().downloadProgress ?? initial
      const status: OfflineAreaStatus = isCancelled ? 'interrupted' : 'error'
      const patch: Partial<OfflineArea> = {
        ...merged(progress),
        status,
        ...(isCancelled
          ? {}
          : { lastError: err instanceof Error ? err.message : String(err) }),
      }
      await updateOfflineArea(area.id, patch)
      set({
        mode: 'idle',
        activeAreaId: null,
        downloadProgress: null,
        lastResultAreaId: area.id,
      })
      patchArea(patch)
      // Cancellation is a deliberate user action, not a failure — only
      // real errors should surface (e.g. to an error boundary/toast).
      if (!isCancelled) throw err
    } finally {
      activeAbortController = null
    }
  }

  return {
    areas: [],
    loaded: false,
    mode: 'idle',
    extraZoomLevels: 2,
    selectedBounds: null,
    selectedZoom: null,
    activeAreaId: null,
    downloadProgress: null,
    lastResultAreaId: null,

    load: async () => {
      let areas = await listOfflineAreas()
      nextDefaultNumber = areas.length + 1
      // A record still "downloading" while no download runs here means the
      // app was closed or killed mid-download: say so, and persist it.
      if (!activeAbortController) {
        const stuck = areas.filter((a) => a.status === 'downloading')
        if (stuck.length > 0) {
          await Promise.all(
            stuck.map((a) => updateOfflineArea(a.id, { status: 'interrupted' })),
          )
          areas = areas.map((a) =>
            a.status === 'downloading' ? { ...a, status: 'interrupted' as const } : a,
          )
        }
      }
      set({ areas, loaded: true })
    },

    startSelecting: (bounds, zoom) =>
      set({ mode: 'selecting', selectedBounds: bounds, selectedZoom: zoom }),
    cancelSelecting: () =>
      set({ mode: 'idle', selectedBounds: null, selectedZoom: null }),
    setExtraZoomLevels: (levels) =>
      set({ extraZoomLevels: Math.max(0, Math.min(3, levels)) }),

    startDownload: async (map, baseLayer) => {
      const { selectedBounds: bounds, selectedZoom } = get()
      if (!bounds || selectedZoom === null) return

      const minZoom = Math.round(selectedZoom)
      const maxZoom = minZoom + get().extraZoomLevels
      const tileCount = tileCountForBounds(bounds, minZoom, maxZoom)

      const area = await createOfflineArea({
        name: `Zone hors ligne ${nextDefaultNumber++}`,
        bounds,
        minZoom,
        maxZoom,
        baseLayer,
        tileCount,
      })
      set((state) => ({
        areas: [...state.areas, area],
        selectedBounds: null,
        selectedZoom: null,
      }))
      await runDownload(map, area, bounds, minZoom, maxZoom)
    },

    refreshArea: async (map, area) => {
      const current = get().areas.find((a) => a.id === area.id) ?? area
      await runDownload(map, current, current.bounds, current.minZoom, current.maxZoom)
    },

    retryArea: async (map, area) => {
      // Always from the stored record: the caller's copy may be stale.
      const current = get().areas.find((a) => a.id === area.id) ?? area
      await runDownload(map, current, current.bounds, current.minZoom, current.maxZoom)
    },

    cancelDownload: () => activeAbortController?.abort(),

    dismissResult: () => set({ lastResultAreaId: null }),

    deleteArea: async (id) => {
      const area = get().areas.find((a) => a.id === id)
      if (area) await deleteTiles(area.tileUrls)
      await deleteOfflineAreaRecord(id)
      set((state) => ({ areas: state.areas.filter((a) => a.id !== id) }))
    },
  }
})

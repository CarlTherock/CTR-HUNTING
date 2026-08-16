import { create } from 'zustand'
import {
  createOfflineArea,
  deleteOfflineArea as deleteOfflineAreaRecord,
  listOfflineAreas,
  updateOfflineArea,
} from '@/database/offlineAreasRepository'
import { deleteTiles } from '@/offline/tileCache'
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
  cancelDownload: () => void
  deleteArea: (id: string) => Promise<void>
}

let nextDefaultNumber = 1
let activeAbortController: AbortController | null = null

export const useOfflineStore = create<OfflineState>((set, get) => {
  /** Shared by `startDownload` and `refreshArea` — both just run the same
   * download-and-persist sequence against an already-created `area`
   * record, differing only in how that record came to exist. */
  async function runDownload(
    map: MapInstance,
    area: OfflineArea,
    bounds: LngLatBounds,
    minZoom: number,
    maxZoom: number,
  ): Promise<void> {
    const controller = new AbortController()
    activeAbortController = controller
    set({
      mode: 'downloading',
      activeAreaId: area.id,
      downloadProgress: { tilesDownloaded: 0, bytesDownloaded: 0, tileUrls: [] },
    })

    const persistProgress = (progress: DownloadAreaProgress, status: OfflineAreaStatus) =>
      updateOfflineArea(area.id, {
        status,
        tilesDownloaded: progress.tilesDownloaded,
        bytesDownloaded: progress.bytesDownloaded,
        tileUrls: progress.tileUrls,
        ...(status === 'complete' ? { completedAt: new Date().toISOString() } : {}),
      })

    try {
      const result = await map.downloadArea(
        bounds,
        minZoom,
        maxZoom,
        (progress) => {
          set({ downloadProgress: progress })
          void updateOfflineArea(area.id, {
            tilesDownloaded: progress.tilesDownloaded,
            bytesDownloaded: progress.bytesDownloaded,
            tileUrls: progress.tileUrls,
          })
        },
        controller.signal,
      )
      await persistProgress(result, 'complete')
      set((state) => ({
        mode: 'idle',
        activeAreaId: null,
        downloadProgress: null,
        areas: state.areas.map((a) =>
          a.id === area.id
            ? { ...a, status: 'complete', ...result, completedAt: new Date().toISOString() }
            : a,
        ),
      }))
    } catch (err) {
      const isCancelled = err instanceof DOMException && err.name === 'AbortError'
      const progress = get().downloadProgress ?? { tilesDownloaded: 0, bytesDownloaded: 0, tileUrls: [] }
      const status: OfflineAreaStatus = isCancelled ? 'cancelled' : 'error'
      await persistProgress(progress, status)
      set((state) => ({
        mode: 'idle',
        activeAreaId: null,
        downloadProgress: null,
        areas: state.areas.map((a) => (a.id === area.id ? { ...a, status, ...progress } : a)),
      }))
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

    load: async () => {
      const areas = await listOfflineAreas()
      nextDefaultNumber = areas.length + 1
      set({ areas, loaded: true })
    },

    startSelecting: (bounds, zoom) =>
      set({ mode: 'selecting', selectedBounds: bounds, selectedZoom: zoom }),
    cancelSelecting: () => set({ mode: 'idle', selectedBounds: null, selectedZoom: null }),
    setExtraZoomLevels: (levels) => set({ extraZoomLevels: Math.max(0, Math.min(3, levels)) }),

    startDownload: async (map, baseLayer) => {
      const { selectedBounds: bounds, selectedZoom } = get()
      if (!bounds || selectedZoom === null) return

      const minZoom = Math.round(selectedZoom)
      const maxZoom = minZoom + get().extraZoomLevels
      const tileCount = tileCountForBounds(bounds, minZoom, maxZoom)

      const area = await createOfflineArea({
        name: `Offline area ${nextDefaultNumber++}`,
        bounds,
        minZoom,
        maxZoom,
        baseLayer,
        tileCount,
      })
      set((state) => ({ areas: [...state.areas, area], selectedBounds: null, selectedZoom: null }))
      await runDownload(map, area, bounds, minZoom, maxZoom)
    },

    refreshArea: async (map, area) => {
      await runDownload(map, area, area.bounds, area.minZoom, area.maxZoom)
    },

    cancelDownload: () => activeAbortController?.abort(),

    deleteArea: async (id) => {
      const area = get().areas.find((a) => a.id === id)
      if (area) await deleteTiles(area.tileUrls)
      await deleteOfflineAreaRecord(id)
      set((state) => ({ areas: state.areas.filter((a) => a.id !== id) }))
    },
  }
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useOfflineStore } from './offlineStore'
import type { DownloadAreaProgress, MapInstance } from '@/services/map'

vi.mock('@/offline/tileCache', () => ({
  deleteTiles: vi.fn().mockResolvedValue(undefined),
}))

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

function fakeMapInstance(
  downloadArea: MapInstance['downloadArea'] = vi
    .fn()
    .mockResolvedValue({ tilesDownloaded: 4, bytesDownloaded: 40_000, tileUrls: ['a', 'b', 'c', 'd'] }),
): MapInstance {
  return {
    setView: vi.fn(),
    setBaseLayer: vi.fn(),
    setOverlayVisible: vi.fn(),
    setUserLocationMarker: vi.fn(),
    setWaypoints: vi.fn(),
    setTrackPreview: vi.fn(),
    getBounds: vi.fn().mockReturnValue(BOUNDS),
    downloadArea,
    destroy: vi.fn(),
  }
}

const RESET_STATE = {
  areas: [],
  loaded: false,
  mode: 'idle' as const,
  extraZoomLevels: 2,
  selectedBounds: null,
  selectedZoom: null,
  activeAreaId: null,
  downloadProgress: null,
}

afterEach(async () => {
  await db.offlineAreas.clear()
  useOfflineStore.setState(RESET_STATE)
  vi.clearAllMocks()
})

describe('offlineStore', () => {
  it('loads areas from Dexie', async () => {
    await db.offlineAreas.add({
      id: 'a1',
      name: 'Existing',
      bounds: BOUNDS,
      minZoom: 10,
      maxZoom: 12,
      baseLayer: 'outdoor',
      status: 'complete',
      tileCount: 10,
      tilesDownloaded: 10,
      bytesDownloaded: 1000,
      tileUrls: [],
      createdAt: '2026-08-16T00:00:00.000Z',
    })

    await useOfflineStore.getState().load()

    expect(useOfflineStore.getState().loaded).toBe(true)
    expect(useOfflineStore.getState().areas).toHaveLength(1)
  })

  it('arms selection with the frozen bounds/zoom, and cancelling clears them', () => {
    useOfflineStore.getState().startSelecting(BOUNDS, 12)
    expect(useOfflineStore.getState().mode).toBe('selecting')
    expect(useOfflineStore.getState().selectedBounds).toEqual(BOUNDS)
    expect(useOfflineStore.getState().selectedZoom).toBe(12)

    useOfflineStore.getState().cancelSelecting()
    expect(useOfflineStore.getState().mode).toBe('idle')
    expect(useOfflineStore.getState().selectedBounds).toBeNull()
  })

  it('clamps extraZoomLevels to [0, 3]', () => {
    useOfflineStore.getState().setExtraZoomLevels(10)
    expect(useOfflineStore.getState().extraZoomLevels).toBe(3)

    useOfflineStore.getState().setExtraZoomLevels(-5)
    expect(useOfflineStore.getState().extraZoomLevels).toBe(0)
  })

  it('startDownload is a no-op if nothing was selected first', async () => {
    const map = fakeMapInstance()
    await useOfflineStore.getState().startDownload(map, 'outdoor')
    expect(map.downloadArea).not.toHaveBeenCalled()
  })

  it('startDownload persists a "downloading" area immediately, then marks it complete with the real result', async () => {
    const map = fakeMapInstance()
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    await useOfflineStore.getState().startDownload(map, 'outdoor')

    expect(map.downloadArea).toHaveBeenCalledWith(
      BOUNDS,
      12,
      14, // 12 + default extraZoomLevels (2)
      expect.any(Function),
      expect.any(Object),
    )

    const state = useOfflineStore.getState()
    expect(state.mode).toBe('idle')
    expect(state.activeAreaId).toBeNull()
    expect(state.areas).toHaveLength(1)
    expect(state.areas[0].status).toBe('complete')
    expect(state.areas[0].tilesDownloaded).toBe(4)

    const [persisted] = await db.offlineAreas.toArray()
    expect(persisted.status).toBe('complete')
    expect(persisted.bytesDownloaded).toBe(40_000)
  })

  it('reports live progress via onProgress during the download', async () => {
    let capturedOnProgress: ((p: DownloadAreaProgress) => void) | undefined
    const map = fakeMapInstance(
      vi.fn().mockImplementation((_b, _min, _max, onProgress) => {
        capturedOnProgress = onProgress
        onProgress({ tilesDownloaded: 1, bytesDownloaded: 500, tileUrls: ['a'] })
        return Promise.resolve({ tilesDownloaded: 1, bytesDownloaded: 500, tileUrls: ['a'] })
      }),
    )
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    await useOfflineStore.getState().startDownload(map, 'outdoor')

    expect(capturedOnProgress).toBeDefined()
    const [persisted] = await db.offlineAreas.toArray()
    expect(persisted.tilesDownloaded).toBe(1)
  })

  it('marks an area cancelled (not an error) when the download is aborted, and does not throw', async () => {
    const map = fakeMapInstance(
      vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
    )
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    await expect(useOfflineStore.getState().startDownload(map, 'outdoor')).resolves.toBeUndefined()

    const state = useOfflineStore.getState()
    expect(state.areas[0].status).toBe('cancelled')
    expect(state.mode).toBe('idle')
  })

  it('marks an area errored and rethrows on a real failure', async () => {
    const map = fakeMapInstance(vi.fn().mockRejectedValue(new Error('network down')))
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    await expect(useOfflineStore.getState().startDownload(map, 'outdoor')).rejects.toThrow(
      'network down',
    )

    expect(useOfflineStore.getState().areas[0].status).toBe('error')
  })

  it('cancelDownload aborts the signal passed to map.downloadArea', async () => {
    let capturedSignal: AbortSignal | undefined
    const map = fakeMapInstance(
      vi.fn().mockImplementation((_b, _min, _max, _onProgress, signal: AbortSignal) => {
        capturedSignal = signal
        return new Promise(() => {
          /* never resolves — cancellation is asserted directly on the signal */
        })
      }),
    )
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    void useOfflineStore.getState().startDownload(map, 'outdoor')
    await vi.waitFor(() => expect(capturedSignal).toBeDefined())

    useOfflineStore.getState().cancelDownload()
    expect(capturedSignal?.aborted).toBe(true)
  })

  it('refreshArea re-downloads an existing area using its own saved bounds/zoom, overwriting it in place', async () => {
    const firstMap = fakeMapInstance()
    useOfflineStore.getState().startSelecting(BOUNDS, 12)
    await useOfflineStore.getState().startDownload(firstMap, 'outdoor')
    const existing = useOfflineStore.getState().areas[0]
    const existingId = existing.id

    const refreshMap = fakeMapInstance(
      vi
        .fn()
        .mockResolvedValue({ tilesDownloaded: 9, bytesDownloaded: 90_000, tileUrls: ['x', 'y'] }),
    )
    await useOfflineStore.getState().refreshArea(refreshMap, existing)

    expect(refreshMap.downloadArea).toHaveBeenCalledWith(
      existing.bounds,
      existing.minZoom,
      existing.maxZoom,
      expect.any(Function),
      expect.any(Object),
    )
    const state = useOfflineStore.getState()
    expect(state.areas).toHaveLength(1) // overwritten, not duplicated
    expect(state.areas[0].id).toBe(existingId)
    expect(state.areas[0].tilesDownloaded).toBe(9)
    expect(state.areas[0].bytesDownloaded).toBe(90_000)
  })

  it('deleteArea removes the Dexie record and its tiles, and updates state', async () => {
    const map = fakeMapInstance()
    useOfflineStore.getState().startSelecting(BOUNDS, 12)
    await useOfflineStore.getState().startDownload(map, 'outdoor')
    const id = useOfflineStore.getState().areas[0].id

    await useOfflineStore.getState().deleteArea(id)

    expect(useOfflineStore.getState().areas).toEqual([])
    expect(await db.offlineAreas.get(id)).toBeUndefined()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useOfflineStore } from './offlineStore'
import type { DownloadAreaProgress, MapInstance } from '@/services/map'
import { deleteTiles } from '@/offline/tileCache'
import { progressFixture, summaryFixture } from '@/test/downloadFixtures'

vi.mock('@/offline/tileCache', () => ({
  deleteTiles: vi.fn().mockResolvedValue(undefined),
}))

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

function fakeMapInstance(
  downloadArea: MapInstance['downloadArea'] = vi
    .fn()
    .mockResolvedValue(progressFixture()),
): MapInstance {
  return {
    setView: vi.fn(),
    setBaseLayer: vi.fn(),
    setOverlayVisible: vi.fn(),
    setUserLocationMarker: vi.fn(),
    setWaypoints: vi.fn(),
    setDraftWaypoint: vi.fn(),
    setSelectedWaypoint: vi.fn(),
    setSharedPoint: vi.fn(),
    setTrackPreview: vi.fn(),
    setMeasurePath: vi.fn(),
    setGuidanceLine: vi.fn(),
    setUserHeading: vi.fn(),
    setWindField: vi.fn(),
    setAnalysisHeatmap: vi.fn(),
    setRasterOverlay: vi.fn(),
    setWeatherFrames: vi.fn(),
    isWeatherFrameReady: vi.fn().mockReturnValue(true),
    setTerrainEnabled: vi.fn(),
    queryElevation: vi.fn().mockReturnValue(null),
    resize: vi.fn(),
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
  lastResultAreaId: null,
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
        const progress = progressFixture({
          tilesDownloaded: 1,
          bytesDownloaded: 500,
          tileUrls: ['a'],
          summary: { requested: 1, succeeded: 1 },
        })
        onProgress(progress)
        return Promise.resolve(progress)
      }),
    )
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    await useOfflineStore.getState().startDownload(map, 'outdoor')

    expect(capturedOnProgress).toBeDefined()
    const [persisted] = await db.offlineAreas.toArray()
    expect(persisted.tilesDownloaded).toBe(1)
  })

  it('marks an area interrupted (not an error) when the download is aborted, and does not throw', async () => {
    const map = fakeMapInstance(
      vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')),
    )
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    await expect(
      useOfflineStore.getState().startDownload(map, 'outdoor'),
    ).resolves.toBeUndefined()

    const state = useOfflineStore.getState()
    expect(state.areas[0].status).toBe('interrupted')
    expect(state.mode).toBe('idle')
  })

  it('marks an area errored and rethrows on a real failure', async () => {
    const map = fakeMapInstance(vi.fn().mockRejectedValue(new Error('network down')))
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    await expect(
      useOfflineStore.getState().startDownload(map, 'outdoor'),
    ).rejects.toThrow('network down')

    expect(useOfflineStore.getState().areas[0].status).toBe('error')
  })

  it('cancelDownload aborts the signal passed to map.downloadArea', async () => {
    let capturedSignal: AbortSignal | undefined
    const map = fakeMapInstance(
      vi.fn().mockImplementation((_b, _min, _max, _onProgress, signal: AbortSignal) => {
        capturedSignal = signal
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () =>
            reject(new DOMException('cancelled', 'AbortError')),
          )
        })
      }),
    )
    useOfflineStore.getState().startSelecting(BOUNDS, 12)

    const running = useOfflineStore.getState().startDownload(map, 'outdoor')
    await vi.waitFor(() => expect(capturedSignal).toBeDefined())

    useOfflineStore.getState().cancelDownload()
    expect(capturedSignal?.aborted).toBe(true)
    await running
    expect(useOfflineStore.getState().areas[0].status).toBe('interrupted')
  })

  it('refreshArea re-downloads an existing area using its own saved bounds/zoom, overwriting it in place', async () => {
    const firstMap = fakeMapInstance()
    useOfflineStore.getState().startSelecting(BOUNDS, 12)
    await useOfflineStore.getState().startDownload(firstMap, 'outdoor')
    const existing = useOfflineStore.getState().areas[0]
    const existingId = existing.id

    const refreshMap = fakeMapInstance(
      vi.fn().mockResolvedValue(
        progressFixture({
          tilesDownloaded: 9,
          bytesDownloaded: 90_000,
          tileUrls: ['x', 'y'],
        }),
      ),
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
    // Bytes are cumulative: what earlier runs cached is still in the cache.
    expect(state.areas[0].bytesDownloaded).toBe(130_000)
    // tileUrls are merged (union), never replaced.
    expect(state.areas[0].tileUrls.sort()).toEqual(['a', 'b', 'c', 'd', 'x', 'y'])
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

  describe('honest download status', () => {
    async function download(result: DownloadAreaProgress | Error) {
      const map = fakeMapInstance(
        result instanceof Error
          ? vi.fn().mockRejectedValue(result)
          : vi.fn().mockResolvedValue(result),
      )
      useOfflineStore.getState().startSelecting(BOUNDS, 12)
      await useOfflineStore
        .getState()
        .startDownload(map, 'outdoor')
        .catch(() => undefined)
      return map
    }

    it.each([
      ['a failed request', { failed: 1, failures: [{ url: 'u', reason: 'timeout' }] }],
      ['a timed-out step', { stepsCompleted: 1, stepsTimedOut: 1 }],
      [
        'an essential resource failure',
        {
          essentialFailures: [{ url: 'u', reason: 'HTTP 500' }],
        },
      ],
      ['an unfinished sweep', { stepsCompleted: 1 }],
      ['no tile at all', { succeeded: 0, reused: 0, requested: 0 }],
    ])('never grants "complete" with %s', async (_label, summary) => {
      await download(progressFixture({ summary }))
      const [area] = useOfflineStore.getState().areas
      expect(area.status).toBe('incomplete')
      expect(area.completedAt).toBeUndefined()
      expect((await db.offlineAreas.toArray())[0].status).toBe('incomplete')
    })

    it('absent tiles (404/204) and reused tiles do not block "complete"', async () => {
      await download(
        progressFixture({
          summary: { succeeded: 0, reused: 3, absent: 2, absentUrls: ['x', 'y'] },
        }),
      )
      expect(useOfflineStore.getState().areas[0].status).toBe('complete')
    })

    it('cancelling mid-sweep marks the area interrupted, keeps the partial ledger and deletes no tile', async () => {
      const partial = progressFixture({
        tilesDownloaded: 2,
        tileUrls: ['t1', 't2'],
        summary: { succeeded: 2, stepsCompleted: 1 },
      })
      const map = fakeMapInstance(
        vi.fn().mockImplementation((_b, _min, _max, onProgress) => {
          onProgress(partial)
          return Promise.reject(new DOMException('cancelled', 'AbortError'))
        }),
      )
      useOfflineStore.getState().startSelecting(BOUNDS, 12)
      await useOfflineStore.getState().startDownload(map, 'outdoor')

      const [area] = useOfflineStore.getState().areas
      expect(area.status).toBe('interrupted')
      expect(area.tileUrls).toEqual(['t1', 't2'])
      expect(area.summary?.stepsCompleted).toBe(1)
      expect((await db.offlineAreas.toArray())[0].tileUrls).toEqual(['t1', 't2'])
      expect(deleteTiles).not.toHaveBeenCalled()
    })

    it('an exception marks the area "error" with its message, keeping tiles', async () => {
      await download(new Error('Le style de la carte n’est pas chargé'))
      const [area] = useOfflineStore.getState().areas
      expect(area.status).toBe('error')
      expect(area.lastError).toMatch(/style/)
      expect(deleteTiles).not.toHaveBeenCalled()
    })

    it('retryArea resumes the SAME record: attempts counted, tileUrls unioned, completes once failures are gone', async () => {
      const first = progressFixture({
        tilesDownloaded: 3,
        bytesDownloaded: 30_000,
        tileUrls: ['t1', 't2', 't3'],
        summary: {
          requested: 4,
          succeeded: 3,
          failed: 1,
          failures: [{ url: 'https://x/t4', reason: 'HTTP 503' }],
        },
      })
      await download(first)
      const incomplete = useOfflineStore.getState().areas[0]
      expect(incomplete.status).toBe('incomplete')
      expect(incomplete.attempts).toBe(1)

      // Second run: t1..t3 come from the cache (reused), only t4 is fetched.
      const retryMap = fakeMapInstance(
        vi.fn().mockResolvedValue(
          progressFixture({
            tilesDownloaded: 4,
            bytesDownloaded: 10_000,
            tileUrls: ['t4'],
            summary: { requested: 4, succeeded: 1, reused: 3 },
          }),
        ),
      )
      await useOfflineStore.getState().retryArea(retryMap, incomplete)

      const state = useOfflineStore.getState()
      expect(state.areas).toHaveLength(1)
      const [area] = state.areas
      expect(area.id).toBe(incomplete.id)
      expect(area.status).toBe('complete')
      expect(area.attempts).toBe(2)
      expect(area.lastAttemptAt).toBeDefined()
      expect(area.tileUrls.sort()).toEqual(['t1', 't2', 't3', 't4'])
      expect(area.bytesDownloaded).toBe(40_000)
      expect(area.tilesDownloaded).toBe(4)
      expect(area.summary?.reused).toBe(3)
      expect((await db.offlineAreas.toArray())[0].attempts).toBe(2)
      expect(state.lastResultAreaId).toBe(incomplete.id)
    })

    it('refuses to start a second download while one is running', async () => {
      let release: (p: DownloadAreaProgress) => void = () => undefined
      const slow = fakeMapInstance(
        vi.fn().mockReturnValue(new Promise<DownloadAreaProgress>((r) => (release = r))),
      )
      useOfflineStore.getState().startSelecting(BOUNDS, 12)
      const running = useOfflineStore.getState().startDownload(slow, 'outdoor')
      await vi.waitFor(() => expect(slow.downloadArea).toHaveBeenCalled())

      const other = fakeMapInstance()
      await useOfflineStore
        .getState()
        .retryArea(other, useOfflineStore.getState().areas[0])
      expect(other.downloadArea).not.toHaveBeenCalled()

      release(progressFixture())
      await running
    })
  })

  describe('load() recovery', () => {
    const base = {
      bounds: BOUNDS,
      minZoom: 10,
      maxZoom: 12,
      baseLayer: 'outdoor' as const,
      tileCount: 10,
      tilesDownloaded: 2,
      bytesDownloaded: 1000,
      tileUrls: ['kept'],
      createdAt: '2026-08-16T00:00:00.000Z',
    }

    it('a record stuck in "downloading" with no active download becomes "interrupted", persisted, tiles untouched', async () => {
      await db.offlineAreas.add({
        ...base,
        id: 'stuck',
        name: 'Stuck',
        status: 'downloading',
      })
      await db.offlineAreas.add({
        ...base,
        id: 'ok',
        name: 'Fine',
        status: 'complete',
        summary: summaryFixture(),
      })

      await useOfflineStore.getState().load()

      const byId = Object.fromEntries(
        useOfflineStore.getState().areas.map((a) => [a.id, a.status]),
      )
      expect(byId).toEqual({ stuck: 'interrupted', ok: 'complete' })
      expect((await db.offlineAreas.get('stuck'))?.status).toBe('interrupted')
      expect((await db.offlineAreas.get('stuck'))?.tileUrls).toEqual(['kept'])
      expect(deleteTiles).not.toHaveBeenCalled()
    })

    it('does not touch a "downloading" record while a download is really running', async () => {
      let release: (p: DownloadAreaProgress) => void = () => undefined
      const slow = fakeMapInstance(
        vi.fn().mockReturnValue(new Promise<DownloadAreaProgress>((r) => (release = r))),
      )
      useOfflineStore.getState().startSelecting(BOUNDS, 12)
      const running = useOfflineStore.getState().startDownload(slow, 'outdoor')
      await vi.waitFor(() => expect(slow.downloadArea).toHaveBeenCalled())

      await useOfflineStore.getState().load()
      expect(useOfflineStore.getState().areas[0].status).toBe('downloading')

      release(progressFixture())
      await running
    })
  })
})

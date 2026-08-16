import { afterEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  createOfflineArea,
  deleteOfflineArea,
  listOfflineAreas,
  updateOfflineArea,
} from './offlineAreasRepository'

const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

describe('offlineAreasRepository (IndexedDB via Dexie)', () => {
  afterEach(async () => {
    await db.offlineAreas.clear()
  })

  it('starts empty', async () => {
    expect(await listOfflineAreas()).toEqual([])
  })

  it('creates an area as downloading, with zero progress', async () => {
    const area = await createOfflineArea({
      name: 'Camp area',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 14,
      baseLayer: 'outdoor',
      tileCount: 42,
    })

    expect(area.id).toBeTruthy()
    expect(area.status).toBe('downloading')
    expect(area.tilesDownloaded).toBe(0)
    expect(area.bytesDownloaded).toBe(0)
    expect(area.tileUrls).toEqual([])
    expect(await listOfflineAreas()).toEqual([area])
  })

  it('persists progress updates', async () => {
    const area = await createOfflineArea({
      name: 'Camp area',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 12,
      baseLayer: 'outdoor',
      tileCount: 4,
    })

    await updateOfflineArea(area.id, {
      tilesDownloaded: 2,
      bytesDownloaded: 20_000,
      tileUrls: ['https://example.com/1', 'https://example.com/2'],
    })

    const [reloaded] = await listOfflineAreas()
    expect(reloaded.tilesDownloaded).toBe(2)
    expect(reloaded.bytesDownloaded).toBe(20_000)
    expect(reloaded.tileUrls).toHaveLength(2)
  })

  it('marks an area complete', async () => {
    const area = await createOfflineArea({
      name: 'Camp area',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 12,
      baseLayer: 'outdoor',
      tileCount: 4,
    })

    await updateOfflineArea(area.id, { status: 'complete', completedAt: '2026-08-16T12:00:00.000Z' })

    const [reloaded] = await listOfflineAreas()
    expect(reloaded.status).toBe('complete')
    expect(reloaded.completedAt).toBe('2026-08-16T12:00:00.000Z')
  })

  it('deletes an area', async () => {
    const area = await createOfflineArea({
      name: 'Camp area',
      bounds: BOUNDS,
      minZoom: 12,
      maxZoom: 12,
      baseLayer: 'outdoor',
      tileCount: 4,
    })

    await deleteOfflineArea(area.id)
    expect(await listOfflineAreas()).toEqual([])
  })
})

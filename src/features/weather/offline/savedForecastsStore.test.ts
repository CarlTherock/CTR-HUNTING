import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { listSavedForecasts } from '@/database/savedForecastsRepository'
import { useSavedForecastsStore } from './savedForecastsStore'
import { QUEBEC, makePoint, makeWindField } from './savedForecastFixtures'

const fetchPointForecast = vi.fn()
const fetchWindField = vi.fn()
vi.mock('@/services/weather', () => ({
  weatherProvider: {
    fetchPointForecast: (...a: unknown[]) => fetchPointForecast(...a),
  },
}))
vi.mock('@/services/wind', () => ({
  windProvider: { fetchWindField: (...a: unknown[]) => fetchWindField(...a) },
}))

const C = QUEBEC.coordinate
const NOW = new Date('2026-11-02T14:00:00.000Z')
const later = new Date('2026-11-02T20:00:00.000Z')

function okNetwork(days = 3) {
  fetchPointForecast.mockResolvedValue(makePoint('2026-11-02', days))
  fetchWindField.mockResolvedValue(makeWindField(C, '2026-11-02', days))
}

function resetStore() {
  useSavedForecastsStore.setState({
    items: [],
    loaded: false,
    busy: false,
    outcome: null,
    loadError: null,
  })
}

beforeEach(async () => {
  resetStore()
  await db.savedForecasts.clear()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('savedForecastsStore', () => {
  it('downloads online, then reads it back with no network at all', async () => {
    okNetwork()
    const outcome = await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    expect(outcome.kind).toBe('complete')
    expect(fetchPointForecast).toHaveBeenCalledWith(C, 3)

    // The network disappears: reading needs nothing but the local database.
    fetchPointForecast.mockRejectedValue(new Error('offline'))
    fetchWindField.mockRejectedValue(new Error('offline'))
    const saved = await listSavedForecasts()
    expect(saved).toHaveLength(1)
    expect(saved[0].status).toBe('complete')
    expect(saved[0].point?.hourly).toHaveLength(72)
    expect(saved[0].windField?.samples).toHaveLength(25)
  })

  it('survives closing and relaunching the app (store state lost, Dexie kept)', async () => {
    okNetwork()
    await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    resetStore() // a fresh launch: nothing in memory
    expect(useSavedForecastsStore.getState().items).toHaveLength(0)
    await useSavedForecastsStore.getState().load()
    const state = useSavedForecastsStore.getState()
    expect(state.loaded).toBe(true)
    expect(state.items).toHaveLength(1)
    expect(state.items[0].fetchedAt).toBe(NOW.toISOString())
    expect(state.items[0].place.name).toBe('Centre de la carte')
  })

  it('stores a partial download as partial, never as complete', async () => {
    fetchPointForecast.mockResolvedValue(makePoint('2026-11-02', 3))
    fetchWindField.mockRejectedValue(new Error('timeout'))
    const outcome = await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    expect(outcome.kind).toBe('partial')
    const [saved] = await listSavedForecasts()
    expect(saved.status).toBe('partial')
    expect(saved.missing).toContain('wind-grid')
    expect(saved.windField).toBeNull()
  })

  it('a failed update keeps the previous download and says why', async () => {
    okNetwork()
    await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    fetchPointForecast.mockRejectedValue(new Error('HTTP 503'))
    fetchWindField.mockRejectedValue(new Error('HTTP 503'))
    const outcome = await useSavedForecastsStore.getState().download(QUEBEC, 3, later)
    expect(outcome.kind).toBe('kept-previous')
    expect('message' in outcome && outcome.message).toMatch(/HTTP 503.*conservé/)
    const saved = await listSavedForecasts()
    expect(saved).toHaveLength(1)
    expect(saved[0].fetchedAt).toBe(NOW.toISOString())
  })

  it('a partial update never replaces a complete download', async () => {
    okNetwork()
    await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    fetchWindField.mockRejectedValue(new Error('timeout'))
    const outcome = await useSavedForecastsStore.getState().download(QUEBEC, 3, later)
    expect(outcome.kind).toBe('kept-previous')
    const [saved] = await listSavedForecasts()
    expect(saved.status).toBe('complete')
    expect(saved.fetchedAt).toBe(NOW.toISOString())
  })

  it('updating the same place replaces its record instead of adding another', async () => {
    okNetwork()
    await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    await useSavedForecastsStore.getState().download(QUEBEC, 3, later)
    const saved = await listSavedForecasts()
    expect(saved).toHaveLength(1)
    expect(saved[0].fetchedAt).toBe(later.toISOString())
  })

  it('keeps one download per place: another place is added', async () => {
    okNetwork()
    await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    await useSavedForecastsStore
      .getState()
      .download(
        { kind: 'gps', name: 'Ma position', coordinate: { lat: 47.5, lng: -70.1 } },
        3,
        NOW,
      )
    expect(await listSavedForecasts()).toHaveLength(2)
  })

  it('refuses when the device cannot hold the download (storage quota)', async () => {
    okNetwork()
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: { estimate: () => Promise.resolve({ quota: 100_000, usage: 99_000 }) },
    })
    const outcome = await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    expect(outcome.kind).toBe('failed')
    expect('message' in outcome && outcome.message).toMatch(/Espace de stockage/)
    expect(await listSavedForecasts()).toHaveLength(0)
  })

  it('nothing is saved when both requests fail (no false « complete »)', async () => {
    fetchPointForecast.mockRejectedValue(new Error('offline'))
    fetchWindField.mockRejectedValue(new Error('offline'))
    const outcome = await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    expect(outcome.kind).toBe('failed')
    expect(await listSavedForecasts()).toHaveLength(0)
  })

  it('deleting a download removes only that download (waypoints stay)', async () => {
    okNetwork()
    await db.waypoints.add({
      id: 'w1',
      name: 'Affût',
      coordinate: C,
      category: 'stand',
    } as never)
    await useSavedForecastsStore.getState().download(QUEBEC, 3, NOW)
    const [saved] = await listSavedForecasts()
    await useSavedForecastsStore.getState().remove(saved.id)
    expect(await listSavedForecasts()).toHaveLength(0)
    expect(await db.waypoints.count()).toBe(1)
    await db.waypoints.clear()
  })

  it('limits the number of downloads and asks to delete one first', async () => {
    okNetwork()
    for (let i = 0; i < 8; i++) {
      await useSavedForecastsStore
        .getState()
        .download(
          { kind: 'gps', name: `Lieu ${i}`, coordinate: { lat: 46 + i * 0.5, lng: -71 } },
          3,
          NOW,
        )
    }
    const outcome = await useSavedForecastsStore
      .getState()
      .download(
        { kind: 'gps', name: 'Lieu 9', coordinate: { lat: 55, lng: -71 } },
        3,
        NOW,
      )
    expect(outcome.kind).toBe('failed')
    expect(await listSavedForecasts()).toHaveLength(8)
  })
})

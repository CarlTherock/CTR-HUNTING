import { afterEach, describe, expect, it, vi } from 'vitest'
import { NOW, makeWindField } from '@/features/analytics/testFixtures'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { Waypoint } from '@/types'
import { abortError } from '../compareData'
import type { CompareDataLoader, CompareDataset } from '../compareData'
import { availableHours, createCompareStore, effectiveHourKey } from './compareStore'

function wp(id: string, lat: number): Waypoint {
  return {
    id,
    name: `Cache ${id}`,
    coordinate: { lat, lng: -71.2 },
    category: 'stand_blind',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  }
}

const WAYPOINTS = ['a', 'b', 'c', 'd', 'e'].map((id, i) => wp(id, 46.8 + i * 0.01))

function dataset(key: string): CompareDataset {
  return {
    key,
    bounds: { south: 46.7, west: -71.3, north: 46.9, east: -71.1 },
    windField: makeWindField(WAYPOINTS.map((w) => w.coordinate)),
    wind: { status: 'ok', fetchedAt: NOW.toISOString() },
    windOrigin: 'network',
    windOriginLabel: null,
    vegetation: [],
    vegetationState: { status: 'ok', fetchedAt: NOW.toISOString() },
    vegetationOrigin: 'network',
  }
}

interface Pending {
  coordinates: { lat: number; lng: number }[]
  signal: AbortSignal
  resolve: (d: CompareDataset) => void
}

function fakeLoader() {
  const pending: Pending[] = []
  const loader = {
    load: vi.fn(
      (coordinates: { lat: number; lng: number }[], signal: AbortSignal) =>
        new Promise<CompareDataset>((resolve, reject) => {
          pending.push({ coordinates, signal, resolve })
          signal.addEventListener('abort', () => reject(abortError()))
        }),
    ),
    clearCache: vi.fn(),
  }
  return { loader: loader as unknown as CompareDataLoader, mock: loader, pending }
}

function seed() {
  useWaypointsStore.setState({ waypoints: WAYPOINTS, loaded: true })
  useTracksStore.setState({ tracks: [], loaded: true })
}

afterEach(() => {
  useWaypointsStore.setState({ waypoints: [], loaded: false })
  useTracksStore.setState({ tracks: [], loaded: false })
})

describe('compareStore — selection', () => {
  it('selects up to 4 waypoints, keeps the order and ignores a 5th', () => {
    const { loader } = fakeLoader()
    const store = createCompareStore(loader)
    for (const id of ['a', 'b', 'c', 'd', 'e']) store.getState().toggleSelected(id)
    expect(store.getState().selectedIds).toEqual(['a', 'b', 'c', 'd'])
    store.getState().toggleSelected('b')
    expect(store.getState().selectedIds).toEqual(['a', 'c', 'd'])
    store.getState().toggleSelected('e')
    expect(store.getState().selectedIds).toEqual(['a', 'c', 'd', 'e'])
  })

  it('drops from the selection what the territory filter hides or what no longer exists', () => {
    const { loader } = fakeLoader()
    const store = createCompareStore(loader)
    for (const id of ['a', 'b', 'c']) store.getState().toggleSelected(id)
    store.getState().pruneSelection(['a', 'c', 'zzz'])
    expect(store.getState().selectedIds).toEqual(['a', 'c'])
    store.getState().clearSelection()
    expect(store.getState().selectedIds).toEqual([])
  })
})

describe('compareStore — loading', () => {
  it('does not request anything with fewer than 2 waypoints', async () => {
    seed()
    const { loader, mock } = fakeLoader()
    const store = createCompareStore(loader)
    store.getState().toggleSelected('a')
    await store.getState().load()
    expect(mock.load).not.toHaveBeenCalled()
    expect(store.getState().status).toBe('idle')
  })

  it('asks the loader ONCE with the selected coordinates, and keeps every waypoint as records', async () => {
    seed()
    const { loader, mock, pending } = fakeLoader()
    const store = createCompareStore(loader)
    store.getState().toggleSelected('c')
    store.getState().toggleSelected('a')
    const loading = store.getState().load()
    expect(store.getState().status).toBe('loading')
    expect(mock.load).toHaveBeenCalledTimes(1)
    expect(pending[0].coordinates).toEqual([
      WAYPOINTS[2].coordinate,
      WAYPOINTS[0].coordinate,
    ])
    pending[0].resolve(dataset('one'))
    await loading
    const state = store.getState()
    expect(state.status).toBe('ready')
    expect(state.dataset?.key).toBe('one')
    // Les enregistrements couvrent TOUS les points (pas seulement les 2 choisis).
    expect(state.records.waypoints).toHaveLength(5)
    expect(state.records.readAt).not.toBeNull()
  })

  it('aborts the obsolete request when the selection changes and ignores its result', async () => {
    seed()
    const { loader, mock, pending } = fakeLoader()
    const store = createCompareStore(loader)
    store.getState().toggleSelected('a')
    store.getState().toggleSelected('b')
    const first = store.getState().load()
    store.getState().toggleSelected('c')
    const second = store.getState().load()
    expect(mock.load).toHaveBeenCalledTimes(2)
    expect(pending[0].signal.aborted).toBe(true)
    expect(pending[1].signal.aborted).toBe(false)
    expect(pending[1].coordinates).toHaveLength(3)
    pending[1].resolve(dataset('second'))
    await Promise.all([first, second])
    expect(store.getState().dataset?.key).toBe('second')
    expect(store.getState().status).toBe('ready')
  })

  it('a late answer of the aborted request never overwrites the newer one', async () => {
    seed()
    const { loader, pending } = fakeLoader()
    const store = createCompareStore(loader)
    store.getState().toggleSelected('a')
    store.getState().toggleSelected('b')
    const first = store.getState().load()
    store.getState().toggleSelected('c')
    const second = store.getState().load()
    pending[1].resolve(dataset('newer'))
    await second
    pending[0].resolve(dataset('older'))
    await first
    expect(store.getState().dataset?.key).toBe('newer')
  })

  it('closing the panel aborts the pending request', async () => {
    seed()
    const { loader, pending } = fakeLoader()
    const store = createCompareStore(loader)
    store.getState().toggleSelected('a')
    store.getState().toggleSelected('b')
    store.getState().openPanel()
    const loading = store.getState().load()
    store.getState().closePanel()
    await loading
    expect(pending[0].signal.aborted).toBe(true)
    expect(store.getState().panelOpen).toBe(false)
    expect(store.getState().status).toBe('idle')
  })

  it('refresh empties the loader cache and loads again', async () => {
    seed()
    const { loader, mock, pending } = fakeLoader()
    const store = createCompareStore(loader)
    store.getState().toggleSelected('a')
    store.getState().toggleSelected('b')
    const refreshing = store.getState().refresh()
    expect(mock.clearCache).toHaveBeenCalledTimes(1)
    expect(mock.load).toHaveBeenCalledTimes(1)
    pending[0].resolve(dataset('fresh'))
    await refreshing
    expect(store.getState().dataset?.key).toBe('fresh')
  })

  it('changing the hour is a plain state change: the loader is never called', () => {
    const { loader, mock } = fakeLoader()
    const store = createCompareStore(loader)
    store.getState().setHourKey('2026-08-17T18:00')
    expect(store.getState().hourKey).toBe('2026-08-17T18:00')
    expect(mock.load).not.toHaveBeenCalled()
  })
})

describe('available hours', () => {
  it('only offers hours present in the loaded wind data', () => {
    const hours = availableHours(dataset('x'), NOW)
    expect(hours).toHaveLength(48)
    expect(hours.every((h) => h.hasWind)).toBe(true)
    expect(availableHours(null, NOW)).toEqual([])
    expect(availableHours({ ...dataset('x'), windField: null }, NOW)).toEqual([])
  })

  it('falls back to the current hour, then to the first available hour', () => {
    const hours = availableHours(dataset('x'), NOW)
    expect(effectiveHourKey('2026-08-17T18:00', hours)).toBe('2026-08-17T18:00')
    // Heure demandée absente des données : retombe sur « maintenant » (null).
    expect(effectiveHourKey('2026-09-01T10:00', hours)).toBeNull()
    expect(effectiveHourKey(null, hours)).toBeNull()
    expect(effectiveHourKey(null, [])).toBeNull()
    const futureOnly = hours.filter((h) => h.kind === 'forecast')
    expect(effectiveHourKey(null, futureOnly)).toBe(futureOnly[0].hourKey)
  })
})

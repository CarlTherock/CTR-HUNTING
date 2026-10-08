import { describe, expect, it, vi } from 'vitest'
import { makeWindField } from '@/features/analytics/testFixtures'
import type { Coordinate, VegetationSample, WindField } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import {
  BOUNDS_STEP_DEGREES,
  CACHE_TTL_MS,
  CompareDataLoader,
  RequestCache,
  VEGETATION_GRID_SIZE,
  WIND_GRID_SIZE,
  boundsKey,
  compareBounds,
  findReusableWind,
  isAbortError,
} from './compareData'
import type { CompareDataDeps, SharedWindCandidate } from './compareData'

const P1: Coordinate = { lat: 46.801, lng: -71.201 }
const P2: Coordinate = { lat: 46.812, lng: -71.213 }
const P3: Coordinate = { lat: 46.823, lng: -71.224 }
const P4: Coordinate = { lat: 46.834, lng: -71.235 }
const FOUR = [P1, P2, P3, P4]

const NOW_MS = Date.parse('2026-08-17T18:20:00.000Z')

interface Harness {
  deps: CompareDataDeps
  wind: ReturnType<typeof vi.fn>
  vegetation: ReturnType<typeof vi.fn>
  clock: { now: number }
  shared: SharedWindCandidate[]
}

function harness(
  options: {
    wind?: (b: LngLatBounds, n: number, s: AbortSignal) => Promise<WindField>
    vegetation?: (
      b: LngLatBounds,
      n: number,
      s: AbortSignal,
    ) => Promise<VegetationSample[]>
  } = {},
): Harness {
  const clock = { now: NOW_MS }
  const shared: SharedWindCandidate[] = []
  const wind = vi.fn(
    options.wind ?? (() => Promise.resolve(makeWindField([P1, P2, P3, P4]))),
  )
  const vegetation = vi.fn(options.vegetation ?? (() => Promise.resolve([])))
  return {
    wind,
    vegetation,
    clock,
    shared,
    deps: {
      fetchWind: wind,
      fetchVegetation: vegetation,
      nowMs: () => clock.now,
      sharedWind: () => shared,
    },
  }
}

/** A promise whose resolution the test controls, and that rejects like fetch on abort. */
function controllable<T>() {
  let resolve!: (value: T) => void
  const holder: { signal?: AbortSignal } = {}
  const make = (_b: LngLatBounds, _n: number, signal: AbortSignal) => {
    holder.signal = signal
    return new Promise<T>((res, rej) => {
      resolve = res
      signal.addEventListener('abort', () =>
        rej(new DOMException('aborted', 'AbortError')),
      )
    })
  }
  return { make, resolve: (v: T) => resolve(v), holder }
}

describe('compareBounds / boundsKey', () => {
  it('encloses every point and snaps outward to the rounding step', () => {
    const bounds = compareBounds(FOUR)
    for (const p of FOUR) {
      expect(p.lat).toBeGreaterThan(bounds.south)
      expect(p.lat).toBeLessThan(bounds.north)
      expect(p.lng).toBeGreaterThan(bounds.west)
      expect(p.lng).toBeLessThan(bounds.east)
    }
    const onStep = (v: number) =>
      Math.abs(v / BOUNDS_STEP_DEGREES - Math.round(v / BOUNDS_STEP_DEGREES)) < 1e-6
    expect([bounds.south, bounds.north, bounds.west, bounds.east].every(onStep)).toBe(
      true,
    )
  })

  it('gives the same bounds (hence the same cache key) to slightly different selections', () => {
    const near = [
      { lat: P1.lat + 0.002, lng: P1.lng - 0.001 },
      { lat: P2.lat - 0.001, lng: P2.lng + 0.002 },
    ]
    const far = [
      { lat: P1.lat + 0.3, lng: P1.lng },
      { lat: P2.lat, lng: P2.lng },
    ]
    const a = compareBounds([P1, P2])
    expect(compareBounds(near)).toEqual(a)
    expect(boundsKey(a, '2026-08-17')).toBe(boundsKey(compareBounds(near), '2026-08-17'))
    expect(boundsKey(compareBounds(far), '2026-08-17')).not.toBe(
      boundsKey(a, '2026-08-17'),
    )
    expect(boundsKey(a, '2026-08-18')).not.toBe(boundsKey(a, '2026-08-17'))
  })
})

describe('CompareDataLoader — grouped requests', () => {
  it('makes exactly ONE wind request and ONE vegetation request for 4 waypoints', async () => {
    const h = harness()
    const loader = new CompareDataLoader(h.deps)
    const dataset = await loader.load(FOUR, new AbortController().signal)
    expect(h.wind).toHaveBeenCalledTimes(1)
    expect(h.vegetation).toHaveBeenCalledTimes(1)
    const [windBounds, windGrid] = h.wind.mock.calls[0]
    expect(windGrid).toBe(WIND_GRID_SIZE)
    expect(h.vegetation.mock.calls[0][1]).toBe(VEGETATION_GRID_SIZE)
    // La même emprise englobante pour les deux requêtes.
    expect(windBounds).toEqual(compareBounds(FOUR))
    expect(h.vegetation.mock.calls[0][0]).toEqual(windBounds)
    expect(dataset.wind.status).toBe('ok')
    expect(dataset.windOrigin).toBe('network')
    expect(dataset.vegetationState.status).toBe('ok')
  })

  it('serves a repeated selection from the memory cache (0 extra requests)', async () => {
    const h = harness()
    const loader = new CompareDataLoader(h.deps)
    await loader.load(FOUR, new AbortController().signal)
    h.clock.now += 60_000
    const again = await loader.load(FOUR, new AbortController().signal)
    expect(h.wind).toHaveBeenCalledTimes(1)
    expect(h.vegetation).toHaveBeenCalledTimes(1)
    expect(again.windOrigin).toBe('cache')
    expect(again.vegetationOrigin).toBe('cache')
    // L'horodatage est celui du chargement d'origine, pas celui de la relecture.
    expect(again.wind.status === 'ok' && again.wind.fetchedAt).toBe(
      new Date(NOW_MS).toISOString(),
    )
  })

  it('refetches once the short time-to-live has elapsed', async () => {
    const h = harness()
    const loader = new CompareDataLoader(h.deps)
    await loader.load(FOUR, new AbortController().signal)
    h.clock.now += CACHE_TTL_MS + 1
    await loader.load(FOUR, new AbortController().signal)
    expect(h.wind).toHaveBeenCalledTimes(2)
    expect(h.vegetation).toHaveBeenCalledTimes(2)
  })

  it('shares one request between two concurrent identical loads', async () => {
    const wind = controllable<WindField>()
    const h = harness({ wind: wind.make })
    const loader = new CompareDataLoader(h.deps)
    const first = loader.load(FOUR, new AbortController().signal)
    const second = loader.load(FOUR, new AbortController().signal)
    wind.resolve(makeWindField(FOUR))
    await Promise.all([first, second])
    expect(h.wind).toHaveBeenCalledTimes(1)
    expect(h.vegetation).toHaveBeenCalledTimes(1)
  })

  it('does not cache failures and keeps the other source', async () => {
    let fail = true
    const h = harness({
      wind: () =>
        fail
          ? Promise.reject(new Error('Requête de vent échouée (503)'))
          : Promise.resolve(makeWindField(FOUR)),
    })
    const loader = new CompareDataLoader(h.deps)
    const failed = await loader.load(FOUR, new AbortController().signal)
    expect(failed.wind).toEqual({
      status: 'error',
      reason: 'Requête de vent échouée (503)',
    })
    expect(failed.windField).toBeNull()
    expect(failed.vegetationState.status).toBe('ok')
    fail = false
    const retried = await loader.load(FOUR, new AbortController().signal)
    expect(h.wind).toHaveBeenCalledTimes(2)
    expect(retried.wind.status).toBe('ok')
    expect(h.vegetation).toHaveBeenCalledTimes(1)
  })

  it('reports a vegetation failure without failing the wind', async () => {
    const h = harness({ vegetation: () => Promise.reject(new Error('Overpass 429')) })
    const dataset = await new CompareDataLoader(h.deps).load(
      FOUR,
      new AbortController().signal,
    )
    expect(dataset.wind.status).toBe('ok')
    expect(dataset.vegetationState).toEqual({ status: 'error', reason: 'Overpass 429' })
  })

  it('skips the heavy vegetation query when the points are too far apart', async () => {
    const h = harness()
    const dataset = await new CompareDataLoader(h.deps).load(
      [P1, { lat: 47.6, lng: -70.2 }],
      new AbortController().signal,
    )
    expect(h.vegetation).not.toHaveBeenCalled()
    expect(dataset.vegetationState.status).toBe('skipped')
    expect(h.wind).toHaveBeenCalledTimes(1)
  })

  it('clearCache forces the next load to fetch again', async () => {
    const h = harness()
    const loader = new CompareDataLoader(h.deps)
    await loader.load(FOUR, new AbortController().signal)
    loader.clearCache()
    await loader.load(FOUR, new AbortController().signal)
    expect(h.wind).toHaveBeenCalledTimes(2)
  })
})

describe('CompareDataLoader — cancellation of obsolete requests', () => {
  it('aborts the in-flight requests when the caller aborts, and rejects with AbortError', async () => {
    const wind = controllable<WindField>()
    const veg = controllable<VegetationSample[]>()
    const h = harness({ wind: wind.make, vegetation: veg.make })
    const loader = new CompareDataLoader(h.deps)
    const controller = new AbortController()
    const pending = loader.load(FOUR, controller.signal)
    expect(wind.holder.signal?.aborted).toBe(false)
    controller.abort()
    await expect(pending).rejects.toSatisfy(isAbortError)
    expect(wind.holder.signal?.aborted).toBe(true)
    expect(veg.holder.signal?.aborted).toBe(true)
  })

  it('a changed selection aborts the first load and starts exactly one new one', async () => {
    const first = controllable<WindField>()
    let call = 0
    const h = harness({
      wind: (b, n, s) => {
        call++
        return call === 1 ? first.make(b, n, s) : Promise.resolve(makeWindField([P1, P2]))
      },
    })
    const loader = new CompareDataLoader(h.deps)
    const c1 = new AbortController()
    const c2 = new AbortController()
    const stale = loader.load(FOUR, c1.signal)
    c1.abort()
    const fresh = loader.load([P1, { lat: 47.2, lng: -71.0 }], c2.signal)
    await expect(stale).rejects.toSatisfy(isAbortError)
    const dataset = await fresh
    expect(first.holder.signal?.aborted).toBe(true)
    expect(h.wind).toHaveBeenCalledTimes(2)
    expect(dataset.wind.status).toBe('ok')
  })

  it('keeps a shared request alive while another caller still waits for it', async () => {
    const wind = controllable<WindField>()
    const h = harness({ wind: wind.make })
    const loader = new CompareDataLoader(h.deps)
    const c1 = new AbortController()
    const c2 = new AbortController()
    const a = loader.load(FOUR, c1.signal)
    const b = loader.load(FOUR, c2.signal)
    c1.abort()
    await expect(a).rejects.toSatisfy(isAbortError)
    expect(wind.holder.signal?.aborted).toBe(false)
    wind.resolve(makeWindField(FOUR))
    const dataset = await b
    expect(dataset.wind.status).toBe('ok')
    expect(h.wind).toHaveBeenCalledTimes(1)
  })

  it('rejects immediately without any request when the signal is already aborted', async () => {
    const h = harness()
    const controller = new AbortController()
    controller.abort()
    await expect(
      new CompareDataLoader(h.deps).load(FOUR, controller.signal),
    ).rejects.toSatisfy(isAbortError)
    expect(h.wind).not.toHaveBeenCalled()
    expect(h.vegetation).not.toHaveBeenCalled()
  })
})

describe('reusing wind that is already loaded elsewhere', () => {
  const field = makeWindField(FOUR)
  const fresh = (fetchedAtMs: number): SharedWindCandidate => ({
    field,
    fetchedAt: new Date(fetchedAtMs).toISOString(),
    origin: 'couche de vent de la carte',
  })

  it('reuses a recent field that has a grid point near every waypoint (0 wind requests)', async () => {
    const h = harness()
    h.shared.push(fresh(NOW_MS - 2 * 60_000))
    const dataset = await new CompareDataLoader(h.deps).load(
      FOUR,
      new AbortController().signal,
    )
    expect(h.wind).not.toHaveBeenCalled()
    expect(dataset.windOrigin).toBe('map')
    expect(dataset.windOriginLabel).toBe('couche de vent de la carte')
    expect(dataset.wind.status === 'ok' && dataset.wind.fetchedAt).toBe(
      new Date(NOW_MS - 2 * 60_000).toISOString(),
    )
    // La végétation, elle, n'existe nulle part ailleurs : une requête.
    expect(h.vegetation).toHaveBeenCalledTimes(1)
  })

  it('does not reuse an old field', () => {
    expect(findReusableWind(FOUR, [fresh(NOW_MS - CACHE_TTL_MS - 1)], NOW_MS)).toBeNull()
  })

  it('does not reuse a field whose nearest grid point is too far from a waypoint', () => {
    const farPoint = { lat: P1.lat + 0.2, lng: P1.lng }
    expect(findReusableWind([...FOUR, farPoint], [fresh(NOW_MS)], NOW_MS)).toBeNull()
  })

  it('ignores a field with an unreadable or future date', () => {
    expect(
      findReusableWind(FOUR, [{ ...fresh(NOW_MS), fetchedAt: 'n’importe quoi' }], NOW_MS),
    ).toBeNull()
    expect(findReusableWind(FOUR, [fresh(NOW_MS + 60_000)], NOW_MS)).toBeNull()
  })
})

describe('RequestCache', () => {
  it('never lets an aborted waiter resolve and removes its entry', async () => {
    const cache = new RequestCache<number>(1000, () => 0)
    const holder: { signal?: AbortSignal } = {}
    const controller = new AbortController()
    const pending = cache.get(
      'k',
      (signal) => {
        holder.signal = signal
        return new Promise<number>(() => undefined)
      },
      controller.signal,
    )
    controller.abort()
    await expect(pending).rejects.toSatisfy(isAbortError)
    expect(holder.signal?.aborted).toBe(true)
    expect(cache.size).toBe(0)
  })
})

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { deriveAreaStatus } from '@/features/offline/areaStatus'
import { tileCountForBounds } from '@/utils/tiles'

type Handler = (
  params: { url: string },
  controller: AbortController,
) => Promise<{ data: unknown }>

const { handlers, tiles, resources } = vi.hoisted(() => ({
  handlers: {} as Record<string, Handler>,
  tiles: new Map<string, Response>(),
  resources: new Map<string, Response>(),
}))

vi.mock('maplibre-gl', () => ({
  addProtocol: (name: string, handler: Handler) => {
    handlers[name] = handler
  },
}))
vi.mock('../../offline/tileCache', () => ({
  getTile: async (url: string) => tiles.get(url)?.clone() ?? null,
  putTile: async (url: string, response: Response) => void tiles.set(url, response),
}))
vi.mock('../../offline/resourceCache', () => ({
  getResource: async (url: string) => resources.get(url)?.clone() ?? null,
  putResource: async (url: string, response: Response) =>
    void resources.set(url, response),
}))

import { sweepDownloadArea } from './downloadArea'
import {
  ensureOfflineProtocolsRegistered,
  setRetryBackoffForTests,
} from './offlineProtocols'

// Small box at zoom 11: a handful of sweep steps.
const BOUNDS = { west: -71.3, south: 46.7, east: -71.1, north: 46.9 }

beforeAll(() => ensureOfflineProtocolsRegistered())
beforeEach(() => {
  tiles.clear()
  resources.clear()
})
/** Every request started by any fake engine in this file. Awaited after each
 * test so a request still retrying can never leak into the next test (it
 * would hit the next test's `fetch` stub and tile cache). */
const allPending: Promise<unknown>[] = []

afterEach(async () => {
  await Promise.allSettled(allPending.splice(0))
  setRetryBackoffForTests()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** A map whose camera moves make the engine "request" one tile per step
 * (through the real ctrtile handler) and go idle once they all settled. */
function fakeEngineMap(options: { neverIdle?: boolean } = {}) {
  const pending: Promise<unknown>[] = []
  const stepJumps: number[] = []
  let counter = 0
  const map = {
    isStyleLoaded: () => true,
    getCenter: () => ({ lng: 0, lat: 0 }),
    getZoom: () => 3,
    getPitch: () => 0,
    getBearing: () => 0,
    jumpTo(view: { center: unknown; zoom: number }) {
      if (!Array.isArray(view.center)) return // restoring the saved view
      stepJumps.push(view.zoom)
      const id = counter++
      const url = `ctrtile://tiles.test/${view.zoom}/${id}.png?key=SECRET`
      const request = handlers
        .ctrtile({ url }, new AbortController())
        .catch(() => undefined)
      pending.push(request)
      allPending.push(request)
    },
    once(_event: string, handler: () => void) {
      if (options.neverIdle) return
      void Promise.allSettled(pending).then(() => handler())
    },
    off() {
      /* nothing to detach in the fake */
    },
  }
  return { map: map as unknown as MapLibreMap, stepJumps }
}

describe('sweepDownloadArea', () => {
  it('a clean sweep counts every step and tile and is derived "complete"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(new Uint8Array(10))),
    )
    const { map, stepJumps } = fakeEngineMap()

    const result = await sweepDownloadArea(
      map,
      BOUNDS,
      11,
      11,
      vi.fn(),
      new AbortController().signal,
    )

    expect(result.summary.stepsTotal).toBe(stepJumps.length)
    expect(result.summary).toMatchObject({
      stepsCompleted: stepJumps.length,
      stepsTimedOut: 0,
      failed: 0,
      succeeded: stepJumps.length,
    })
    expect(result.tilesDownloaded).toBe(stepJumps.length)
    expect(result.tileUrls).toHaveLength(stepJumps.length)
    expect(deriveAreaStatus(result.summary)).toBe('complete')
  })

  it('a step that never reaches idle is retried once, then recorded as timed out (never skipped silently)', async () => {
    // The requests of a never-idle step still run: make them fail fast and
    // finish within this test.
    setRetryBackoffForTests([1, 1])
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const { map, stepJumps } = fakeEngineMap({ neverIdle: true })

    const result = await sweepDownloadArea(
      map,
      BOUNDS,
      11,
      11,
      vi.fn(),
      new AbortController().signal,
      10, // step timeout (ms)
    )

    const steps = result.summary.stepsTotal
    expect(steps).toBeGreaterThan(0)
    expect(stepJumps).toHaveLength(steps * 2) // each step aimed twice
    expect(result.summary).toMatchObject({ stepsCompleted: 0, stepsTimedOut: steps })
    expect(deriveAreaStatus(result.summary)).toBe('incomplete')
  })

  it('failures then retry/resume: the second run reuses cached tiles and refetches only the failed one', async () => {
    // Real timers with tiny retry pauses: deterministic, no race between fake
    // timers and the real asynchronous reading of Response bodies.
    setRetryBackoffForTests([1, 1])
    const broken = { on: true }
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string) =>
        broken.on && /\/0\.png/.test(url)
          ? new Response('', { status: 503 })
          : new Response(new Uint8Array(10)),
      )
    vi.stubGlobal('fetch', fetchMock)

    // Run 1: tile #0 keeps failing (503 on all 3 attempts).
    const first = fakeEngineMap()
    const run1 = sweepDownloadArea(
      first.map,
      BOUNDS,
      11,
      11,
      vi.fn(),
      new AbortController().signal,
    )
    const result1 = await run1

    const total = result1.summary.stepsTotal
    expect(total).toBeGreaterThan(1)
    expect(result1.summary).toMatchObject({ failed: 1, succeeded: total - 1, retried: 2 })
    expect(result1.summary.failures[0].url).toMatch(/\/0\.png$/)
    expect(JSON.stringify(result1.summary)).not.toContain('SECRET')
    expect(deriveAreaStatus(result1.summary)).toBe('incomplete')
    expect(tiles.size).toBe(total - 1) // nothing deleted, nothing fake cached

    // Run 2 (same area, failure lifted): only the failed tile hits the network.
    broken.on = false
    fetchMock.mockClear()
    const second = fakeEngineMap()
    const run2 = sweepDownloadArea(
      second.map,
      BOUNDS,
      11,
      11,
      vi.fn(),
      new AbortController().signal,
    )
    const result2 = await run2

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result2.summary).toMatchObject({
      failed: 0,
      succeeded: 1,
      reused: total - 1,
    })
    expect(deriveAreaStatus(result2.summary)).toBe('complete')
  })

  it('cancelling mid-sweep rejects with AbortError, keeps the tiles already cached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response(new Uint8Array(10))),
    )
    const { map, stepJumps } = fakeEngineMap()
    const controller = new AbortController()
    const progress = vi.fn((p: { summary: { stepsCompleted: number } }) => {
      if (p.summary.stepsCompleted >= 1) controller.abort()
    })

    await expect(
      sweepDownloadArea(map, BOUNDS, 11, 11, progress, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(tiles.size).toBeGreaterThanOrEqual(1)
    expect(tiles.size).toBeLessThan(tileCountForBounds(BOUNDS, 11, 11))
    expect(stepJumps.length).toBeLessThan(tileCountForBounds(BOUNDS, 11, 11))
  })

  it('refuses to sweep when the map style is not loaded (error, not a fake success)', async () => {
    const { map } = fakeEngineMap()
    ;(map as unknown as { isStyleLoaded: () => boolean }).isStyleLoaded = () => false
    await expect(
      sweepDownloadArea(map, BOUNDS, 11, 11, vi.fn(), new AbortController().signal, 5),
    ).rejects.toThrow(/style/)
  })
})

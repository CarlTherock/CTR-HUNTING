import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteTiles,
  estimateStorageUsage,
  fetchAndCacheTile,
  getTile,
  hasTile,
} from './tileCache'

// jsdom doesn't implement the Cache Storage API — a minimal in-memory
// fake covering exactly the surface `tileCache.ts` uses (open/match/put/
// delete), matching this codebase's established pattern of hand-rolled
// fakes for browser APIs the test environment lacks (see
// MapLibreProvider.test.ts).
class FakeCache {
  store = new Map<string, Response>()
  async match(url: string) {
    return this.store.get(url)
  }
  async put(url: string, response: Response) {
    this.store.set(url, response)
  }
  async delete(url: string) {
    return this.store.delete(url)
  }
}

function installFakeCaches() {
  const cache = new FakeCache()
  const fakeCaches = {
    open: async () => cache,
  }
  vi.stubGlobal('caches', fakeCaches)
  return cache
}

describe('tileCache', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('hasTile / getTile', () => {
    beforeEach(() => installFakeCaches())

    it('reports false/null for an uncached url', async () => {
      expect(await hasTile('https://example.com/tile/1/2/3.pbf')).toBe(false)
      expect(await getTile('https://example.com/tile/1/2/3.pbf')).toBeNull()
    })
  })

  describe('fetchAndCacheTile', () => {
    it('fetches, caches, and returns the real byte size', async () => {
      const cache = installFakeCaches()
      const bytes = new Uint8Array(1234)
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/x-protobuf' } }),
        ),
      )

      const url = 'https://example.com/tile/5/10/12.pbf'
      const size = await fetchAndCacheTile(url)

      expect(size).toBe(1234)
      expect(await cache.match(url)).toBeDefined()
      expect(await hasTile(url)).toBe(true)
    })

    it('throws on a non-OK response and does not cache it', async () => {
      const cache = installFakeCaches()
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

      await expect(fetchAndCacheTile('https://example.com/missing.pbf')).rejects.toThrow(
        /404/,
      )
      expect(cache.store.size).toBe(0)
    })
  })

  describe('deleteTiles', () => {
    it('removes exactly the given urls, leaving others untouched', async () => {
      const cache = installFakeCaches()
      await cache.put('https://example.com/a', new Response('a'))
      await cache.put('https://example.com/b', new Response('b'))

      await deleteTiles(['https://example.com/a'])

      expect(await cache.match('https://example.com/a')).toBeUndefined()
      expect(await cache.match('https://example.com/b')).toBeDefined()
    })
  })

  describe('estimateStorageUsage', () => {
    it('returns real usage/quota when the Storage API is available', async () => {
      vi.stubGlobal('navigator', {
        ...navigator,
        storage: { estimate: vi.fn().mockResolvedValue({ usage: 1000, quota: 100_000 }) },
      })

      expect(await estimateStorageUsage()).toEqual({ usage: 1000, quota: 100_000 })
    })

    it('returns null when the Storage API is unavailable', async () => {
      vi.stubGlobal('navigator', { ...navigator, storage: undefined })

      expect(await estimateStorageUsage()).toBeNull()
    })
  })
})

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadLedger } from './downloadLedger'

type Handler = (
  params: { url: string; type?: string },
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

import {
  ensureOfflineProtocolsRegistered,
  setRetryBackoffForTests,
  setActiveDownload,
  REQUEST_TIMEOUT_MS,
} from './offlineProtocols'

const TILE = 'https://tiles.test/5/10/12.pbf?key=SECRET'
const tileRequest = { url: TILE.replace('https://', 'ctrtile://') }
const STYLE = 'https://api.test/maps/style.json?key=SECRET'
const styleRequest = {
  url: STYLE.replace('https://', 'ctrfresh://'),
  type: 'json',
}

const ok = (size = 10) => new Response(new Uint8Array(size), { status: 200 })

/** A fetch that never answers on its own but honours its abort signal. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        )
      }),
  )
}

beforeAll(() => ensureOfflineProtocolsRegistered())
beforeEach(() => {
  tiles.clear()
  resources.clear()
})
afterEach(() => {
  setActiveDownload(null)
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function startDownload() {
  const ledger = new DownloadLedger()
  setActiveDownload({ ledger })
  return ledger
}

describe('a request that outlives its download', () => {
  it('keeps retrying into ITS ledger and never into a later download', async () => {
    setRetryBackoffForTests([20, 20])
    const first = startDownload()
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)

    const stale = handlers
      .ctrtile(tileRequest, new AbortController())
      .catch(() => undefined)
    // The first download ends and a second one starts while the request is
    // still waiting to retry.
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = startDownload()
    await stale
    setRetryBackoffForTests()

    expect(first.summary().retried).toBe(2)
    expect(second.summary().retried).toBe(0)
    expect(second.summary().requested).toBe(0)
  })
})

describe('ctrtile during a download', () => {
  it('network error then success on retry: succeeded, 1 retry, no failure', async () => {
    vi.useFakeTimers()
    const ledger = startDownload()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new TypeError('offline')).mockResolvedValue(ok(42)),
    )

    const promise = handlers.ctrtile(tileRequest, new AbortController())
    await vi.runAllTimersAsync()
    const result = await promise

    expect((result.data as ArrayBuffer).byteLength).toBe(42)
    expect(ledger.summary()).toMatchObject({ succeeded: 1, failed: 0, retried: 1 })
    expect(tiles.has('https://tiles.test/5/10/12.pbf?key=SECRET')).toBe(true)
  })

  it('a hanging tile times out after 15 s on each of 3 attempts, then is recorded as failed (timeout)', async () => {
    vi.useFakeTimers()
    const ledger = startDownload()
    const fetchMock = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const promise = handlers.ctrtile(tileRequest, new AbortController())
    const assertion = expect(promise).rejects.toThrow(/expirée/)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.runAllTimersAsync()
    await assertion

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const summary = ledger.summary()
    expect(summary).toMatchObject({ failed: 1, retried: 2, succeeded: 0 })
    expect(summary.failures).toEqual([
      { url: 'https://tiles.test/5/10/12.pbf', reason: 'timeout' },
    ])
    expect(JSON.stringify(summary)).not.toContain('SECRET')
  })

  it('retries exhausted on HTTP 503: failed with the status as reason', async () => {
    vi.useFakeTimers()
    const ledger = startDownload()
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response('x', { status: 503 }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = handlers.ctrtile(tileRequest, new AbortController())
    const assertion = expect(promise).rejects.toThrow(/503/)
    await vi.runAllTimersAsync()
    await assertion

    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(ledger.summary().failures[0].reason).toBe('HTTP 503')
    expect(ledger.summary().retried).toBe(2)
  })

  it('backs off 250 ms then 750 ms between attempts', async () => {
    vi.useFakeTimers()
    startDownload()
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)

    const promise = handlers.ctrtile(tileRequest, new AbortController())
    const assertion = expect(promise).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(249)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(749)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    await assertion
  })

  it.each([404, 204])(
    'HTTP %s is "absent": recorded, not retried, not a failure',
    async (status) => {
      const ledger = startDownload()
      const fetchMock = vi
        .fn()
        .mockImplementation(async () => new Response(null, { status }))
      vi.stubGlobal('fetch', fetchMock)

      const promise = handlers.ctrtile(tileRequest, new AbortController())
      if (status === 204) {
        expect(((await promise).data as ArrayBuffer).byteLength).toBe(0)
      } else {
        await expect(promise).rejects.toThrow(/404/)
      }

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const summary = ledger.summary()
      expect(summary).toMatchObject({ absent: 1, failed: 0, retried: 0 })
      expect(summary.absentUrls).toEqual(['https://tiles.test/5/10/12.pbf'])
    },
  )

  it('does not retry a definitive client error (403)', async () => {
    const ledger = startDownload()
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => new Response('', { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(handlers.ctrtile(tileRequest, new AbortController())).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(ledger.summary()).toMatchObject({ failed: 1, retried: 0 })
  })

  it('serves a cached tile as "reused" without any network request', async () => {
    const ledger = startDownload()
    tiles.set('https://tiles.test/5/10/12.pbf?key=SECRET', ok(7))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await handlers.ctrtile(tileRequest, new AbortController())

    expect((result.data as ArrayBuffer).byteLength).toBe(7)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(ledger.summary()).toMatchObject({ reused: 1, succeeded: 0 })
  })

  it('a request aborted by the engine/user is neither a success nor a failure', async () => {
    const ledger = startDownload()
    vi.stubGlobal('fetch', hangingFetch())
    const controller = new AbortController()
    const promise = handlers.ctrtile(tileRequest, controller)
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    controller.abort()
    await expect(promise).rejects.toThrow()
    expect(ledger.summary()).toMatchObject({ failed: 0, succeeded: 0, retried: 0 })
  })
})

describe('ctrtile in normal browsing (no download)', () => {
  it('makes a single attempt, still bounded by the 15 s timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = hangingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const promise = handlers.ctrtile(tileRequest, new AbortController())
    const assertion = expect(promise).rejects.toThrow(/expirée/)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry a network error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(handlers.ctrtile(tileRequest, new AbortController())).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('ctrfresh cached-copy fallback', () => {
  const cachedStyle = () => new Response('{"version":8,"name":"cached"}')

  it('network failure with a cached copy: serves the cache (offline cold start)', async () => {
    resources.set(STYLE, cachedStyle())
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const result = await handlers.ctrfresh(styleRequest, new AbortController())
    expect(result.data).toEqual({ version: 8, name: 'cached' })
  })

  it('HTTP 503 with a cached copy: serves the cache', async () => {
    resources.set(STYLE, cachedStyle())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('', { status: 503 })),
    )
    const result = await handlers.ctrfresh(styleRequest, new AbortController())
    expect(result.data).toEqual({ version: 8, name: 'cached' })
  })

  it('timeout with a cached copy: serves the cache', async () => {
    vi.useFakeTimers()
    resources.set(STYLE, cachedStyle())
    vi.stubGlobal('fetch', hangingFetch())
    const promise = handlers.ctrfresh(styleRequest, new AbortController())
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    expect((await promise).data).toEqual({ version: 8, name: 'cached' })
  })

  it.each([401, 403, 404])(
    'HTTP %s with a cached copy: the error propagates (no stale style masks a bad key)',
    async (status) => {
      resources.set(STYLE, cachedStyle())
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => new Response('', { status })),
      )
      await expect(
        handlers.ctrfresh(styleRequest, new AbortController()),
      ).rejects.toThrow(new RegExp(String(status)))
    },
  )

  it('refreshes the cached copy on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async () => new Response('{"version":8,"name":"fresh"}')),
    )
    const result = await handlers.ctrfresh(styleRequest, new AbortController())
    expect(result.data).toEqual({ version: 8, name: 'fresh' })
    expect(await (resources.get(STYLE) as Response).json()).toEqual({
      version: 8,
      name: 'fresh',
    })
  })
})

describe('essential resources during a download', () => {
  const GLYPH = 'https://glyphs.test/Noto/0-255.pbf?key=SECRET'
  const glyphRequest = {
    url: GLYPH.replace('https://', 'ctrstatic://'),
    type: 'arrayBuffer',
  }

  it('a glyph that fails after retries is an essential failure (no query string)', async () => {
    vi.useFakeTimers()
    const ledger = startDownload()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const promise = handlers.ctrstatic(glyphRequest, new AbortController())
    const assertion = expect(promise).rejects.toThrow()
    await vi.runAllTimersAsync()
    await assertion
    expect(ledger.summary().essentialFailures).toEqual([
      { url: 'https://glyphs.test/Noto/0-255.pbf', reason: 'réseau' },
    ])
  })

  it('a style refused with 403 during a download is an essential failure', async () => {
    const ledger = startDownload()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('', { status: 403 })),
    )
    await expect(handlers.ctrfresh(styleRequest, new AbortController())).rejects.toThrow()
    expect(ledger.summary().essentialFailures).toEqual([
      { url: 'https://api.test/maps/style.json', reason: 'HTTP 403' },
    ])
  })

  it('a style served from cache after a network failure is not an essential failure', async () => {
    const ledger = startDownload()
    resources.set(STYLE, new Response('{"version":8}'))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    vi.useFakeTimers()
    const promise = handlers.ctrfresh(styleRequest, new AbortController())
    await vi.runAllTimersAsync()
    await promise
    expect(ledger.summary().essentialFailures).toEqual([])
  })
})

/**
 * MapLibre custom protocols that make the map survive a cold start with no
 * network. Three request families are redirected (see `transformMapRequest`):
 *
 *  - `ctrtile://`   map tiles            → cache-first (tile cache, per area)
 *  - `ctrfresh://`  style, TileJSON,     → network-first; the cached copy only
 *                   sprite JSON            replaces a network failure / timeout /
 *                                          5xx (stale beats nothing). A definitive
 *                                          401/403/404 is propagated, never masked.
 *  - `ctrstatic://` glyphs, sprite image → cache-first (immutable assets)
 *
 * Time-varying weather imagery is never cached (unique URL per frame).
 *
 * Every request has a 15 s per-attempt timeout. While an offline-area
 * download is active (`setActiveDownload`), transient failures are retried
 * (3 attempts max) and every outcome is written to the download's ledger.
 */
import { addProtocol } from 'maplibre-gl'
import * as resourceCache from '../../offline/resourceCache'
import * as tileCache from '../../offline/tileCache'
import type { DownloadLedger } from './downloadLedger'

export const CTR_TILE_PROTOCOL = 'ctrtile'
export const CTR_FRESH_PROTOCOL = 'ctrfresh'
export const CTR_STATIC_PROTOCOL = 'ctrstatic'

const NON_CACHED_HOSTS = /^https?:\/\/geo\.weather\.gc\.ca\//

/** Per-attempt network timeout, for every request (download or browsing). */
export const REQUEST_TIMEOUT_MS = 15_000
/** Attempts per request while a download is active (1 try + 2 retries). */
export const DOWNLOAD_MAX_ATTEMPTS = 3
/** Pause before retry #1 and retry #2. */
export const RETRY_BACKOFF_MS = [250, 750] as const

/** Retry pauses actually used. Production always uses `RETRY_BACKOFF_MS`;
 * tests shorten them (see `setRetryBackoffForTests`) so they can run on real
 * timers instead of racing fake timers against real body reads. */
let retryBackoffMs: readonly number[] = RETRY_BACKOFF_MS

/** TEST ONLY: replaces the retry pauses; call with no argument to restore. */
export function setRetryBackoffForTests(pauses?: readonly number[]): void {
  retryBackoffMs = pauses ?? RETRY_BACKOFF_MS
}

export interface ActiveDownload {
  ledger: DownloadLedger
}
let activeDownload: ActiveDownload | null = null

/** While set, requests are retried and tallied in the download's ledger.
 * Outside a download, browsing keeps a single attempt per request. */
export function setActiveDownload(download: ActiveDownload | null): void {
  activeDownload = download
}

let registered = false

function realUrl(url: string, protocol: string): string {
  return url.replace(`${protocol}://`, 'https://')
}

/** A request that did not produce a usable answer. `kind` tells whether it
 * is worth retrying / falling back to a cached copy. */
export class ResourceFetchError extends Error {
  readonly kind: 'timeout' | 'network' | 'http'
  readonly status?: number

  constructor(kind: 'timeout' | 'network' | 'http', status?: number) {
    super(
      kind === 'http'
        ? `Requête échouée (HTTP ${status})`
        : kind === 'timeout'
          ? 'Requête expirée (délai dépassé)'
          : 'Requête échouée (réseau)',
    )
    this.name = 'ResourceFetchError'
    this.kind = kind
    this.status = status
  }
}

/** Short reason recorded in the download ledger. */
export function failureReason(error: unknown): string {
  if (error instanceof ResourceFetchError) {
    if (error.kind === 'http') return `HTTP ${error.status}`
    return error.kind === 'timeout' ? 'timeout' : 'réseau'
  }
  return 'erreur'
}

/** Worth retrying (and worth serving a cached copy for): the request may
 * well succeed later. 401/403/404 and other 4xx are definitive answers. */
export function isTransient(error: unknown): boolean {
  if (!(error instanceof ResourceFetchError)) return false
  if (error.kind !== 'http') return true
  const status = error.status ?? 0
  return status >= 500 || status === 408 || status === 429
}

/** 404 / 204: the provider has no tile there. Not a failure. */
export function isAbsent(error: unknown): boolean {
  return (
    error instanceof ResourceFetchError &&
    error.kind === 'http' &&
    (error.status === 404 || error.status === 204)
  )
}

interface Fetched {
  data: ArrayBuffer
  contentType: string | null
}

function abortError(): DOMException {
  return new DOMException('Requête annulée', 'AbortError')
}

/** One attempt, bounded by `REQUEST_TIMEOUT_MS` for headers AND body.
 * Implemented with an explicit controller + timer (rather than
 * `AbortSignal.timeout`) so the timeout is testable with fake timers. */
async function attemptFetch(url: string, signal: AbortSignal): Promise<Fetched> {
  if (signal.aborted) throw abortError()
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok || response.status === 204) {
      throw new ResourceFetchError('http', response.status)
    }
    return {
      data: await response.arrayBuffer(),
      contentType: response.headers.get('content-type'),
    }
  } catch (error) {
    if (error instanceof ResourceFetchError) throw error
    if (signal.aborted) throw abortError()
    throw new ResourceFetchError(timedOut ? 'timeout' : 'network')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Fetches `url`. Single attempt in normal use; up to
 * `DOWNLOAD_MAX_ATTEMPTS` (with short backoff) while a download is active,
 * and only for transient failures. Every retry is counted in the ledger. */
export async function fetchResource(
  url: string,
  signal: AbortSignal,
  ledger?: DownloadLedger,
): Promise<Fetched> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptFetch(url, signal)
    } catch (error) {
      // Bound to the ledger captured when the request started, never to the
      // global: a request that outlives its download must not retry, or count
      // into, a later download.
      const maxAttempts = ledger ? DOWNLOAD_MAX_ATTEMPTS : 1
      if (attempt >= maxAttempts || !isTransient(error) || signal.aborted) throw error
      ledger?.retry()
      await sleep(retryBackoffMs[attempt - 1] ?? 750, signal)
    }
  }
}

function toResponse(fetched: Fetched): Response {
  return new Response(fetched.data.slice(0), {
    status: 200,
    headers: fetched.contentType ? { 'content-type': fetched.contentType } : undefined,
  })
}

function jsonOrBytes(type: string | undefined, data: ArrayBuffer) {
  return type === 'json'
    ? { data: JSON.parse(new TextDecoder().decode(data)) as object }
    : { data }
}

export function ensureOfflineProtocolsRegistered(): void {
  if (registered) return
  registered = true

  addProtocol(CTR_TILE_PROTOCOL, async (params, abortController) => {
    const url = realUrl(params.url, CTR_TILE_PROTOCOL)
    // Captured once: a request that outlives the download keeps writing to
    // its own (by then closed, hence inert) ledger.
    const ledger = activeDownload?.ledger
    ledger?.requested(url)

    const cached = await tileCache.getTile(url)
    if (cached) {
      const data = await cached.arrayBuffer()
      ledger?.reused(url)
      return { data }
    }

    try {
      const fetched = await fetchResource(url, abortController.signal, ledger)
      try {
        await tileCache.putTile(url, toResponse(fetched))
      } catch (error) {
        ledger?.failed(url, 'stockage')
        throw error
      }
      ledger?.succeeded(url, fetched.data.byteLength)
      return { data: fetched.data }
    } catch (error) {
      // Cancelled by the engine or the user: neither a success nor a failure.
      if (abortController.signal.aborted) throw error
      if (isAbsent(error)) {
        ledger?.absent(url)
        // 204 = "empty tile": hand the engine an empty body, as before.
        if ((error as ResourceFetchError).status === 204) {
          return { data: new ArrayBuffer(0) }
        }
        throw error
      }
      if (error instanceof ResourceFetchError) ledger?.failed(url, failureReason(error))
      throw error
    }
  })

  addProtocol(CTR_FRESH_PROTOCOL, async (params, abortController) => {
    const url = realUrl(params.url, CTR_FRESH_PROTOCOL)
    const ledger = activeDownload?.ledger
    try {
      const fetched = await fetchResource(url, abortController.signal, ledger)
      try {
        await resourceCache.putResource(url, toResponse(fetched))
        ledger?.essentialOk(url)
      } catch {
        // The map still works this session; the offline copy is what is lost.
        ledger?.essentialFailed(url, 'stockage')
      }
      return jsonOrBytes(params.type, fetched.data)
    } catch (error) {
      if (abortController.signal.aborted) throw error
      // A cached copy only stands in for an unreachable / struggling
      // provider. An explicit 401/403/404 must reach the caller (so a bad
      // key makes the app fall back to another base layer).
      if (isTransient(error)) {
        const cached = await resourceCache.getResource(url)
        if (cached) return jsonOrBytes(params.type, await cached.arrayBuffer())
      }
      ledger?.essentialFailed(url, failureReason(error))
      throw error
    }
  })

  addProtocol(CTR_STATIC_PROTOCOL, async (params, abortController) => {
    const url = realUrl(params.url, CTR_STATIC_PROTOCOL)
    const ledger = activeDownload?.ledger
    const cached = await resourceCache.getResource(url)
    if (cached) return { data: await cached.arrayBuffer() }
    try {
      const fetched = await fetchResource(url, abortController.signal, ledger)
      try {
        await resourceCache.putResource(url, toResponse(fetched))
        ledger?.essentialOk(url)
      } catch {
        ledger?.essentialFailed(url, 'stockage')
      }
      return { data: fetched.data }
    } catch (error) {
      if (abortController.signal.aborted) throw error
      ledger?.essentialFailed(url, failureReason(error))
      throw error
    }
  })
}

/** Routes a MapLibre request through the matching offline protocol. */
export function transformMapRequest(
  url: string,
  resourceType?: string,
): { url: string } | undefined {
  if (!/^https?:\/\//.test(url) || NON_CACHED_HOSTS.test(url)) return undefined
  const swap = (protocol: string) => ({
    url: url.replace(/^https?:\/\//, `${protocol}://`),
  })
  switch (resourceType) {
    case 'Tile':
      return swap(CTR_TILE_PROTOCOL)
    case 'Style':
    case 'Source':
    case 'SpriteJSON':
      return swap(CTR_FRESH_PROTOCOL)
    case 'Glyphs':
    case 'SpriteImage':
      return swap(CTR_STATIC_PROTOCOL)
    default:
      return undefined
  }
}

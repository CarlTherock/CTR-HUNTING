/**
 * MapLibre custom protocols that make the map survive a cold start with no
 * network. Three request families are redirected (see `transformMapRequest`):
 *
 *  - `ctrtile://`   map tiles            → cache-first (tile cache, per area)
 *  - `ctrfresh://`  style, TileJSON,     → network-first, cache as fallback
 *                   sprite JSON            (they change; stale beats nothing)
 *  - `ctrstatic://` glyphs, sprite image → cache-first (immutable assets)
 *
 * Time-varying weather imagery is never cached (unique URL per frame).
 */
import { addProtocol } from 'maplibre-gl'
import type { DownloadAreaProgress } from './MapProvider'
import * as resourceCache from '../../offline/resourceCache'
import * as tileCache from '../../offline/tileCache'

export const CTR_TILE_PROTOCOL = 'ctrtile'
export const CTR_FRESH_PROTOCOL = 'ctrfresh'
export const CTR_STATIC_PROTOCOL = 'ctrstatic'

const NON_CACHED_HOSTS = /^https?:\/\/geo\.weather\.gc\.ca\//

export interface ActiveDownload {
  tileUrls: Set<string>
  bytesDownloaded: number
  onProgress: (progress: DownloadAreaProgress) => void
}
let activeDownload: ActiveDownload | null = null

export function setActiveDownload(download: ActiveDownload | null): void {
  activeDownload = download
}

let registered = false

function realUrl(url: string, protocol: string): string {
  return url.replace(`${protocol}://`, 'https://')
}

async function fetchOk(url: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Requête échouée (${response.status}) : ${url}`)
  return response
}

export function ensureOfflineProtocolsRegistered(): void {
  if (registered) return
  registered = true

  addProtocol(CTR_TILE_PROTOCOL, async (params, abortController) => {
    const url = realUrl(params.url, CTR_TILE_PROTOCOL)

    const cached = await tileCache.getTile(url)
    if (cached) return { data: await cached.arrayBuffer() }

    const response = await fetchOk(url, abortController.signal)
    const blob = await response.clone().blob()
    await tileCache.putTile(url, response)

    // Only tallied while a deliberate "download this area" is in progress.
    if (activeDownload && !activeDownload.tileUrls.has(url)) {
      activeDownload.tileUrls.add(url)
      activeDownload.bytesDownloaded += blob.size
      activeDownload.onProgress({
        tilesDownloaded: activeDownload.tileUrls.size,
        bytesDownloaded: activeDownload.bytesDownloaded,
        tileUrls: [...activeDownload.tileUrls],
      })
    }
    return { data: await blob.arrayBuffer() }
  })

  addProtocol(CTR_FRESH_PROTOCOL, async (params, abortController) => {
    const url = realUrl(params.url, CTR_FRESH_PROTOCOL)
    let response: Response
    try {
      response = await fetchOk(url, abortController.signal)
      await resourceCache.putResource(url, response.clone())
    } catch (error) {
      if (abortController.signal.aborted) throw error
      const cached = await resourceCache.getResource(url)
      if (!cached) throw error
      response = cached
    }
    return params.type === 'json'
      ? { data: await response.json() }
      : { data: await response.arrayBuffer() }
  })

  addProtocol(CTR_STATIC_PROTOCOL, async (params, abortController) => {
    const url = realUrl(params.url, CTR_STATIC_PROTOCOL)
    let response = await resourceCache.getResource(url)
    if (!response) {
      response = await fetchOk(url, abortController.signal)
      await resourceCache.putResource(url, response.clone())
    }
    return { data: await response.arrayBuffer() }
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

import type { Map as MapLibreMap } from 'maplibre-gl'
import { tileCenterLngLat, tileRangeForBounds, tilesForRange } from '@/utils/tiles'
import type { LngLatBounds } from '@/utils/tiles'
import type { DownloadAreaProgress } from './MapProvider'
import { setActiveDownload } from './offlineProtocols'

/** Resolves once the map has finished loading everything it currently
 * needs (`'idle'`) — or after `timeoutMs`, so a download sweep can never
 * hang forever on a tile that silently never settles. Whichever happens
 * first, the other is cleaned up (no leaked timer, no leaked `idle`
 * listener piling up once per tile on a long sweep). */
export function waitForIdle(map: MapLibreMap, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve) => {
    const onIdle = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      map.off('idle', onIdle)
      resolve()
    }, timeoutMs)
    map.once('idle', onIdle)
  })
}

/** Sweeps the camera across every tile position covering `bounds` so the
 * engine issues (and the offline protocol caches) its own real tile
 * requests — see `MapInstance.downloadArea`. The original camera is always
 * restored, including on abort/failure. */
export async function sweepDownloadArea(
  map: MapLibreMap,
  bounds: LngLatBounds,
  minZoom: number,
  maxZoom: number,
  onProgress: (progress: DownloadAreaProgress) => void,
  signal: AbortSignal,
): Promise<DownloadAreaProgress> {
  const savedView = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  }
  const tileUrls = new Set<string>()
  let bytesDownloaded = 0
  setActiveDownload({
    tileUrls,
    bytesDownloaded: 0,
    onProgress: (progress) => {
      bytesDownloaded = progress.bytesDownloaded
      onProgress(progress)
    },
  })

  try {
    for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
      const range = tileRangeForBounds(bounds, zoom)
      for (const tile of tilesForRange(range)) {
        if (signal.aborted) {
          throw new DOMException(
            'Téléchargement de la zone hors ligne annulé',
            'AbortError',
          )
        }
        const center = tileCenterLngLat(tile.x, tile.y, zoom)
        map.jumpTo({ center: [center.lng, center.lat], zoom })
        await waitForIdle(map)
      }
    }
    return { tilesDownloaded: tileUrls.size, bytesDownloaded, tileUrls: [...tileUrls] }
  } finally {
    setActiveDownload(null)
    map.jumpTo(savedView)
  }
}

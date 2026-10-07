import type { Map as MapLibreMap } from 'maplibre-gl'
import { tileCenterLngLat, tileRangeForBounds, tilesForRange } from '@/utils/tiles'
import type { LngLatBounds } from '@/utils/tiles'
import type { DownloadAreaProgress } from './MapProvider'
import { DownloadLedger } from './downloadLedger'
import { setActiveDownload } from './offlineProtocols'

/** Longer than the 15 s per-request timeout, so a tile that hangs is
 * resolved (and recorded as a failure) before the step itself gives up. */
export const STEP_TIMEOUT_MS = 20_000

/** Resolves `true` once the map has finished loading everything it
 * currently needs (`'idle'`), or `false` after `timeoutMs` — never hangs on
 * a tile that silently never settles, and never reports a timeout as a
 * success. Whichever happens first, the other is cleaned up (no leaked timer,
 * no `idle` listener piling up once per tile on a long sweep). */
export function waitForIdle(map: MapLibreMap, timeoutMs = 5000): Promise<boolean> {
  return new Promise((resolve) => {
    const onIdle = () => {
      clearTimeout(timer)
      resolve(true)
    }
    const timer = setTimeout(() => {
      map.off('idle', onIdle)
      resolve(false)
    }, timeoutMs)
    map.once('idle', onIdle)
  })
}

function snapshot(ledger: DownloadLedger): DownloadAreaProgress {
  const summary = ledger.summary()
  return {
    tilesDownloaded: summary.succeeded + summary.reused,
    bytesDownloaded: ledger.bytesDownloaded,
    tileUrls: ledger.fetchedUrls(),
    summary,
  }
}

function abortedError(): DOMException {
  return new DOMException('Téléchargement de la zone hors ligne annulé', 'AbortError')
}

/** Sweeps the camera across every tile position covering `bounds` so the
 * engine issues (and the offline protocol caches) its own real tile
 * requests — see `MapInstance.downloadArea`. Every step, request, retry and
 * failure is recorded in a ledger and reported through `onProgress`; nothing
 * is skipped silently. The original camera is always restored, including on
 * abort/failure, and tiles already cached are never removed. */
export async function sweepDownloadArea(
  map: MapLibreMap,
  bounds: LngLatBounds,
  minZoom: number,
  maxZoom: number,
  onProgress: (progress: DownloadAreaProgress) => void,
  signal: AbortSignal,
  stepTimeoutMs = STEP_TIMEOUT_MS,
): Promise<DownloadAreaProgress> {
  const ledger: DownloadLedger = new DownloadLedger(() => onProgress(snapshot(ledger)))

  const steps: { lng: number; lat: number; zoom: number }[] = []
  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    for (const tile of tilesForRange(tileRangeForBounds(bounds, zoom))) {
      const center = tileCenterLngLat(tile.x, tile.y, zoom)
      steps.push({ lng: center.lng, lat: center.lat, zoom })
    }
  }
  ledger.stepsTotal = steps.length

  // Sweeping an unloaded style would request nothing and look "done".
  if (!map.isStyleLoaded()) await waitForIdle(map, stepTimeoutMs)
  if (!map.isStyleLoaded()) {
    throw new Error('Le style de la carte n’est pas chargé : téléchargement impossible.')
  }

  const savedView = {
    center: map.getCenter(),
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
  }
  setActiveDownload({ ledger })

  try {
    for (const step of steps) {
      if (signal.aborted) throw abortedError()
      map.jumpTo({ center: [step.lng, step.lat], zoom: step.zoom })
      let idle = await waitForIdle(map, stepTimeoutMs)
      if (signal.aborted) throw abortedError()
      if (!idle) {
        // One more go: re-aim the camera, then wait again.
        map.jumpTo({ center: [step.lng, step.lat], zoom: step.zoom })
        idle = await waitForIdle(map, stepTimeoutMs)
        if (signal.aborted) throw abortedError()
      }
      ledger.step(idle ? 'completed' : 'timedOut')
    }
    return snapshot(ledger)
  } finally {
    setActiveDownload(null)
    ledger.close()
    map.jumpTo(savedView)
  }
}

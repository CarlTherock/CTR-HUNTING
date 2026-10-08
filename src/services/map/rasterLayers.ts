import type { Map as MapLibreMap } from 'maplibre-gl'
import type { OverlayStatus, WeatherTileFrame } from '@/types'
import { TRACK_PREVIEW_LAYER_ID } from './pathLayers'
import { classifyLayerError } from './layerErrors'

/** Named external raster overlays (radar, Forêt ouverte's cadastre/
 * coupes/peuplements, …) — re-applied on every style load, since a base
 * layer switch's `setStyle()` discards custom sources/layers. Keyed by the
 * caller's own `id` so any number of these can be active simultaneously
 * without clobbering each other. */
export function createRasterOverlays(
  map: MapLibreMap,
  onStatus?: (id: string, status: OverlayStatus) => void,
) {
  const overlays = new Map<
    string,
    { tileUrlTemplate: string; opacity: number; attribution?: string }
  >()
  const sourceId = (id: string) => `raster-overlay-${id}`
  const layerId = (id: string) => `raster-overlay-${id}-layer`
  // Overlays whose tiles failed since they were (re)added: the error stays
  // visible until the overlay is re-applied, even if other tiles load.
  const failed = new Map<string, string>()

  function overlayIdOf(source: string | undefined): string | null {
    if (!source?.startsWith('raster-overlay-')) return null
    const id = source.slice('raster-overlay-'.length)
    return overlays.has(id) ? id : null
  }

  function apply(id: string) {
    failed.delete(id)
    if (map.getLayer(layerId(id))) {
      map.removeLayer(layerId(id))
      map.removeSource(sourceId(id))
    }
    const overlay = overlays.get(id)
    if (overlay) {
      map.addSource(sourceId(id), {
        type: 'raster',
        tiles: [overlay.tileUrlTemplate],
        tileSize: 256,
        // Shown by MapLibre's attribution control while the layer is on.
        ...(overlay.attribution ? { attribution: overlay.attribution } : {}),
      })
      map.addLayer({
        id: layerId(id),
        type: 'raster',
        source: sourceId(id),
        paint: { 'raster-opacity': overlay.opacity },
      })
      onStatus?.(id, { state: 'loading' })
    }
  }

  // Load state per overlay, from MapLibre's own source/tile events. A tile
  // error is latched (not transient noise) so a dead layer is never shown
  // as "loaded".
  interface SourceEvent {
    sourceId?: string
  }
  map.on('dataloading', (event: object) => {
    const id = overlayIdOf((event as SourceEvent).sourceId)
    if (id && !failed.has(id)) onStatus?.(id, { state: 'loading' })
  })
  map.on('data', (event: object) => {
    const id = overlayIdOf((event as SourceEvent).sourceId)
    if (!id || failed.has(id)) return
    if (map.isSourceLoaded(sourceId(id))) onStatus?.(id, { state: 'ready' })
  })
  map.on('error', (event: object) => {
    const id = overlayIdOf((event as SourceEvent).sourceId)
    if (!id) return
    const raw = (event as { error?: { status?: number; message?: string } }).error
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false
    const { kind, message } = classifyLayerError({
      status: raw?.status,
      rawMessage: raw?.message,
      online,
    })
    failed.set(id, message)
    onStatus?.(id, { state: 'error', message, errorKind: kind })
  })

  return {
    set(
      id: string,
      tileUrlTemplate: string | null,
      opacity: number,
      attribution?: string,
    ) {
      const existing = overlays.get(id)
      if (
        tileUrlTemplate &&
        existing?.tileUrlTemplate === tileUrlTemplate &&
        existing.attribution === attribution &&
        map.getLayer(layerId(id))
      ) {
        // Same source, only the opacity moved (slider): no reload, and a
        // latched error stays visible.
        existing.opacity = opacity
        map.setPaintProperty(layerId(id), 'raster-opacity', opacity)
        return
      }
      if (tileUrlTemplate) overlays.set(id, { tileUrlTemplate, opacity, attribution })
      else {
        failed.delete(id)
        if (overlays.delete(id)) onStatus?.(id, { state: 'idle' })
      }
      try {
        apply(id)
      } catch {
        // Style not ready yet (map just mounted, or mid base-layer
        // switch): MapLibre refuses addSource/addLayer until it has
        // loaded. The requested overlay is already recorded above, and
        // `applyAll` (run from the `style.load` handler) adds it.
      }
    },
    applyAll() {
      for (const id of overlays.keys()) apply(id)
    },
    /** Manual retry: drops the latched error and re-adds the source. */
    retry(id: string) {
      if (!overlays.has(id)) return
      try {
        apply(id)
      } catch {
        // Style mid-switch: `applyAll` re-adds it on `style.load`.
      }
    },
  }
}

const WEATHER_PREFIX = 'wx-frame-'
const WEATHER_WINDOW_BEHIND = 1
const WEATHER_WINDOW_AHEAD = 3

/** Animated weather frames (radar / HRDPS forecast). One raster
 * source+layer per frame, all at opacity 0 except the active one, so
 * swapping frames is a paint-property change (no flicker, no
 * re-request). Only a small window around the active frame is kept on the
 * map — enough to preload what playback shows next without requesting 48
 * hours of imagery at once. */
export function createWeatherFrames(map: MapLibreMap) {
  let frames: WeatherTileFrame[] = []
  let activeIndex = 0
  let opacity = 0.75
  /** Frames currently on the map — cleared on every style load, since
   * setStyle() discards custom sources/layers. */
  const addedKeys = new Set<string>()
  /** Sub-layer count per frame (radar = rain + snow). */
  const partCounts = new Map<string, number>()
  const sourceId = (key: string, part: number) => `${WEATHER_PREFIX}${key}-${part}`
  const layerId = (key: string, part: number) => `${WEATHER_PREFIX}${key}-${part}-layer`

  function wantedKeys(): Set<string> {
    const wanted = new Set<string>()
    const n = frames.length
    if (n === 0) return wanted
    for (let d = -WEATHER_WINDOW_BEHIND; d <= WEATHER_WINDOW_AHEAD; d++) {
      wanted.add(frames[(((activeIndex + d) % n) + n) % n].key)
    }
    return wanted
  }

  function sync() {
    const wanted = wantedKeys()
    const activeKey = frames[activeIndex]?.key
    for (const key of [...addedKeys]) {
      if (wanted.has(key)) continue
      for (let i = 0; i < (partCounts.get(key) ?? 1); i++) {
        if (map.getLayer(layerId(key, i))) map.removeLayer(layerId(key, i))
        if (map.getSource(sourceId(key, i))) map.removeSource(sourceId(key, i))
      }
      addedKeys.delete(key)
      partCounts.delete(key)
    }
    if (wanted.size === 0) return
    // Draw weather under the GPS track / measurement lines.
    const beforeId = map.getLayer(TRACK_PREVIEW_LAYER_ID)
      ? TRACK_PREVIEW_LAYER_ID
      : undefined
    for (const frame of frames) {
      if (!wanted.has(frame.key)) continue
      const frameOpacity = frame.key === activeKey ? opacity : 0
      const parts = frame.tileUrlTemplates.length
      if (addedKeys.has(frame.key)) {
        for (let i = 0; i < parts; i++) {
          map.setPaintProperty(layerId(frame.key, i), 'raster-opacity', frameOpacity)
        }
        continue
      }
      frame.tileUrlTemplates.forEach((template, i) => {
        map.addSource(sourceId(frame.key, i), {
          type: 'raster',
          tiles: [template],
          tileSize: 256,
          attribution: 'Environnement et Changement climatique Canada (MSC GeoMet)',
        })
        map.addLayer(
          {
            id: layerId(frame.key, i),
            type: 'raster',
            source: sourceId(frame.key, i),
            paint: {
              'raster-opacity': frameOpacity,
              'raster-fade-duration': 0,
              'raster-resampling': 'linear',
            },
          },
          beforeId,
        )
      })
      partCounts.set(frame.key, parts)
      addedKeys.add(frame.key)
    }
  }

  return {
    set(
      newFrames: WeatherTileFrame[] | null,
      newActiveIndex: number,
      newOpacity: number,
    ) {
      frames = newFrames ?? []
      activeIndex = Math.max(0, Math.min(frames.length - 1, newActiveIndex))
      opacity = newOpacity
      try {
        sync()
      } catch {
        // Style not ready yet (mount, or mid base-layer switch) — the
        // `style.load` handler re-applies the current frames.
      }
    },
    /** Call on every `style.load`: the style swap dropped every frame. */
    resetForNewStyle() {
      addedKeys.clear()
      partCounts.clear()
      sync()
    },
    isReady(key: string): boolean {
      const parts = partCounts.get(key)
      if (!parts || !addedKeys.has(key)) return false
      for (let i = 0; i < parts; i++) {
        const id = sourceId(key, i)
        if (!map.getSource(id) || !map.isSourceLoaded(id)) return false
      }
      return true
    },
  }
}

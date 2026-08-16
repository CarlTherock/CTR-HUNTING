import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type { Coordinate, MapBaseLayerId, MapOverlayId, MapViewState } from '@/types'
import type { CreateMapOptions, MapInstance, MapProvider } from './MapProvider'

/** Real vector layer IDs inside MapTiler's "Outdoor" style, grouped by
 * overlay. MapTiler doesn't expose trails/hydrography/contours as
 * separate style URLs, so toggling them means hiding/showing layers that
 * already exist in this one style — extracted from the style's own
 * `style.json` (`layers[].id`), not invented. The "Satellite" style has
 * none of these layers; `setOverlayVisible` no-ops there. */
const OVERLAY_LAYER_IDS: Record<MapOverlayId, string[]> = {
  contours: ['contour_index', 'contour', 'contour_label'],
  hydrography: [
    'water',
    'water_intermittent',
    'waterway_tunnel',
    'waterway_river',
    'waterway_river_intermittent',
    'waterway_other',
    'waterway_other_intermittent',
    'water_name_line',
    'water_name_point',
    'water_name_way',
    'outdoor_poi_waterfall',
    'outdoor_poi_drinking_water',
  ],
  trails: [
    'tunnel_road_path',
    'road_path_casing',
    'road_path',
    'road_label_track',
    'trail_longdistance_casing',
    'trail_longdistance',
    ...(
      ['yellow', 'green', 'blue', 'brown', 'black', 'purple', 'orange', 'red'] as const
    ).flatMap((color) => [
      `trail_${color}_casing`,
      `trail_${color}_casing_extra`,
      `trail_${color}`,
      `trail_${color}_extra`,
    ]),
  ],
}

/** Applies one overlay's visibility to whichever of its layers actually
 * exist in the currently-loaded style — silently does nothing for layers
 * that aren't there (e.g. any overlay against the "Satellite" style). */
function applyOverlay(map: MapLibreMap, overlay: MapOverlayId, visible: boolean): void {
  for (const layerId of OVERLAY_LAYER_IDS[overlay]) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none')
    }
  }
}

/** Small blue dot + white ring, the near-universal "you are here" marker
 * convention — distinct from the teardrop pins waypoints use (Phase 2), so
 * the two are never visually confused on the same map. Built as a plain
 * DOM element (not JSX) since MapLibre mounts markers outside React. */
function createUserLocationElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.width = '16px'
  el.style.height = '16px'
  el.style.borderRadius = '50%'
  el.style.background = '#22c55e'
  el.style.border = '2px solid white'
  el.style.boxShadow = '0 0 0 2px rgba(34, 197, 94, 0.35)'
  return el
}

/** MapTiler style path segment for each base layer. "Outdoor" bundles
 * topo/contours/hydrography/trails into one vector style (free tier);
 * "Satellite" is raster imagery only, no labels — both are real MapTiler
 * products, not a fabricated distinction. */
const STYLE_PATH: Record<MapBaseLayerId, string> = {
  outdoor: 'outdoor',
  satellite: 'satellite',
}

/**
 * MapLibre GL JS + MapTiler styles (free tier). This is the only file in
 * the app allowed to import `maplibre-gl` directly — everything else
 * depends on `MapProvider`.
 */
export class MapTilerProvider implements MapProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private styleUrl(layer: MapBaseLayerId): string {
    return `https://api.maptiler.com/maps/${STYLE_PATH[layer]}/style.json?key=${this.apiKey}`
  }

  createMap({
    container,
    initialView,
    initialBaseLayer,
    initialOverlays,
    onViewChange,
  }: CreateMapOptions): MapInstance {
    // MapLibre resolves its worker script at runtime rather than via a
    // static `new URL(..., import.meta.url)` Rollup/Vite can detect and
    // bundle automatically, so it silently 404s unless we point it there
    // ourselves. `vite.config.ts` copies the worker (and the sibling chunk
    // it imports) to `maplibre/` in the output, unhashed, under
    // `BASE_URL` — matching where they're actually served, in dev and in
    // the GitHub Pages build. Called here (not at module scope) so an app
    // with no configured provider never pays for maplibre-gl at all — see
    // `services/map/index.ts`.
    setWorkerUrl(`${import.meta.env.BASE_URL}maplibre/maplibre-gl-worker.mjs`)

    const map = new MapLibreMap({
      container,
      style: this.styleUrl(initialBaseLayer),
      center: [initialView.center.lng, initialView.center.lat],
      zoom: initialView.zoom,
      pitch: initialView.pitch,
      bearing: initialView.bearing,
    })

    map.addControl(new NavigationControl(), 'top-right')

    // Re-applied on every style load — including the first one, and every
    // subsequent setStyle() from setBaseLayer, which discards all prior
    // per-layer visibility since it's a fresh style parse.
    const overlayState: Record<MapOverlayId, boolean> = { ...initialOverlays }
    map.on('style.load', () => {
      for (const overlay of Object.keys(overlayState) as MapOverlayId[]) {
        applyOverlay(map, overlay, overlayState[overlay])
      }
    })

    if (onViewChange) {
      map.on('moveend', () => {
        const center = map.getCenter()
        onViewChange({
          center: { lat: center.lat, lng: center.lng },
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        })
      })
    }

    let userMarker: Marker | null = null

    return {
      setView(view: Partial<MapViewState>) {
        if (view.center) map.setCenter([view.center.lng, view.center.lat])
        if (view.zoom !== undefined) map.setZoom(view.zoom)
        if (view.pitch !== undefined) map.setPitch(view.pitch)
        if (view.bearing !== undefined) map.setBearing(view.bearing)
      },
      setBaseLayer: (layer: MapBaseLayerId) => {
        map.setStyle(this.styleUrl(layer))
      },
      setOverlayVisible(overlay: MapOverlayId, visible: boolean) {
        overlayState[overlay] = visible
        applyOverlay(map, overlay, visible)
      },
      setUserLocationMarker(coordinate: Coordinate | null) {
        if (!coordinate) {
          userMarker?.remove()
          userMarker = null
          return
        }
        if (!userMarker) {
          userMarker = new Marker({ element: createUserLocationElement() })
          userMarker.addTo(map)
        }
        userMarker.setLngLat([coordinate.lng, coordinate.lat])
      },
      destroy() {
        userMarker?.remove()
        map.remove()
      },
    }
  }
}

import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type { Coordinate, MapBaseLayerId, MapOverlayId, MapViewState } from '@/types'
import type { CreateMapOptions, MapInstance, MapProvider } from './MapProvider'

/** Real vector layer IDs inside MapTiler's "Outdoor" style, grouped by
 * overlay. MapTiler doesn't expose trails/hydrography/contours as
 * separate style URLs, so toggling them means hiding/showing layers that
 * already exist in this one style — extracted from the style's own
 * `style.json` (`layers[].id`), not invented. No other base layer
 * (MapTiler "Satellite", either Esri style) has these layers;
 * `setOverlayVisible` no-ops there. */
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
 * that aren't there (e.g. any overlay against a non-"Outdoor" style). */
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

export interface MapLibreProviderApiKeys {
  /** MapTiler ("outdoor", "satellite"). Get one at
   * https://cloud.maptiler.com/account/keys/ */
  mapTiler?: string
  /** Esri (every "esri-*" base layer) — an ArcGIS Location Platform API
   * key scoped to the "Basemaps" privilege only. Get one at
   * https://developers.arcgis.com. */
  esri?: string
}

/** Esri Basemap Styles v2 style name for each "esri-*" base layer —
 * https://developers.arcgis.com/rest/basemap-styles/. Picked for what the
 * roadmap actually needs, not "every style Esri has": topographic/imagery
 * mirror MapTiler as an alternate vendor; terrain + hillshade give relief
 * context ahead of Phase 4's real 3D terrain; light-gray/dark-gray are the
 * standard neutral canvases Phase 8–9's analytics heatmaps get drawn on;
 * navigation is road-focused for finding access routes. */
const ESRI_STYLE_NAME: Record<Exclude<MapBaseLayerId, 'outdoor' | 'satellite'>, string> = {
  'esri-topographic': 'topographic',
  'esri-imagery': 'imagery',
  'esri-imagery-standard': 'imagery/standard',
  'esri-terrain': 'terrain',
  'esri-hillshade': 'hillshade/light',
  'esri-light-gray': 'light-gray',
  'esri-dark-gray': 'dark-gray',
  'esri-navigation': 'navigation',
}

/**
 * MapLibre GL JS, configured with whichever base-layer vendor(s) have a
 * key. Both MapTiler and Esri's Basemap Styles v2 service serve
 * MapLibre-compatible style JSON, so one engine instance covers both —
 * `setBaseLayer` is always just a style-URL swap regardless of vendor.
 * This is the only file in the app allowed to import `maplibre-gl`
 * directly — everything else depends on `MapProvider`.
 */
export class MapLibreProvider implements MapProvider {
  private readonly apiKeys: MapLibreProviderApiKeys

  constructor(apiKeys: MapLibreProviderApiKeys) {
    this.apiKeys = apiKeys
  }

  private styleUrl(layer: MapBaseLayerId): string {
    switch (layer) {
      case 'outdoor':
        return `https://api.maptiler.com/maps/outdoor/style.json?key=${this.apiKeys.mapTiler}`
      case 'satellite':
        return `https://api.maptiler.com/maps/satellite/style.json?key=${this.apiKeys.mapTiler}`
      default:
        return `https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/${ESRI_STYLE_NAME[layer]}?token=${this.apiKeys.esri}`
    }
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
          // Marker.addTo() immediately positions itself from `_lngLat`, so
          // it must be set *before* adding — adding first crashes reading
          // `.lng` off the not-yet-set position (only masked in dev/test
          // because there, no fix ever arrives and this branch never ran).
          userMarker = new Marker({ element: createUserLocationElement() }).setLngLat([
            coordinate.lng,
            coordinate.lat,
          ])
          userMarker.addTo(map)
        } else {
          userMarker.setLngLat([coordinate.lng, coordinate.lat])
        }
      },
      destroy() {
        userMarker?.remove()
        map.remove()
      },
    }
  }
}

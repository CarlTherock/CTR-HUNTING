import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type { MapBaseLayerId, MapViewState } from '@/types'
import type { CreateMapOptions, MapInstance, MapProvider } from './MapProvider'

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
      destroy() {
        map.remove()
      },
    }
  }
}

import { Map as MapLibreMap, NavigationControl } from 'maplibre-gl'
import type { MapViewState } from '@/types'
import type { CreateMapOptions, MapInstance, MapProvider } from './MapProvider'

/**
 * MapLibre GL JS + MapTiler "Outdoor" style (satellite/topo/contours in one
 * style, free tier). This is the only file in the app allowed to import
 * `maplibre-gl` directly — everything else depends on `MapProvider`.
 */
export class MapTilerProvider implements MapProvider {
  private readonly apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  private get styleUrl(): string {
    return `https://api.maptiler.com/maps/outdoor/style.json?key=${this.apiKey}`
  }

  createMap({ container, initialView, onViewChange }: CreateMapOptions): MapInstance {
    const map = new MapLibreMap({
      container,
      style: this.styleUrl,
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
      destroy() {
        map.remove()
      },
    }
  }
}

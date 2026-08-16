import type { MapBaseLayerId, MapViewState } from '@/types'

/** Handle to a mounted map instance. Returned by `MapProvider.createMap`;
 * callers only ever see this interface, never the underlying engine (e.g.
 * MapLibre's `Map` class), so the engine stays swappable. */
export interface MapInstance {
  /** Programmatically move the camera (e.g. "recenter on GPS"). */
  setView(view: Partial<MapViewState>): void
  /** Swap the active base style (e.g. Outdoor → Satellite). */
  setBaseLayer(layer: MapBaseLayerId): void
  /** Tear down the underlying engine instance and its DOM/WebGL resources. */
  destroy(): void
}

export interface CreateMapOptions {
  /** DOM element the map renders into. Must already be attached and sized. */
  container: HTMLElement
  initialView: MapViewState
  initialBaseLayer: MapBaseLayerId
  /** Called on every user-driven camera change (pan/zoom/rotate/tilt), so
   * the caller can mirror it into shared state (see `mapStore`). */
  onViewChange?: (view: MapViewState) => void
}

/**
 * Adapter contract for the map engine. Nothing outside `src/services/map/`
 * may import the underlying mapping library directly — this is what keeps
 * the map provider replaceable per the project's hard rules.
 */
export interface MapProvider {
  createMap(options: CreateMapOptions): MapInstance
}

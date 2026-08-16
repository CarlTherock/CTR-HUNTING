import type { Coordinate, MapBaseLayerId, MapOverlayId, MapViewState, Waypoint } from '@/types'

/** Handle to a mounted map instance. Returned by `MapProvider.createMap`;
 * callers only ever see this interface, never the underlying engine (e.g.
 * MapLibre's `Map` class), so the engine stays swappable. */
export interface MapInstance {
  /** Programmatically move the camera (e.g. "recenter on GPS"). */
  setView(view: Partial<MapViewState>): void
  /** Swap the active base style (e.g. Outdoor → Satellite). */
  setBaseLayer(layer: MapBaseLayerId): void
  /** Show or hide an overlay. A no-op if the current base layer has no
   * matching layers (e.g. overlays have no effect on "Satellite"). */
  setOverlayVisible(overlay: MapOverlayId, visible: boolean): void
  /** Show/update the device's current GPS position on the map. Pass
   * `null` to remove it (no fix, permission denied, signal lost). */
  setUserLocationMarker(coordinate: Coordinate | null): void
  /** Replace the set of waypoint markers shown on the map (diffed
   * internally by id — does not recreate markers that haven't moved). */
  setWaypoints(waypoints: Waypoint[]): void
  /** Tear down the underlying engine instance and its DOM/WebGL resources. */
  destroy(): void
}

export interface CreateMapOptions {
  /** DOM element the map renders into. Must already be attached and sized. */
  container: HTMLElement
  initialView: MapViewState
  initialBaseLayer: MapBaseLayerId
  initialOverlays: Record<MapOverlayId, boolean>
  /** Called on every user-driven camera change (pan/zoom/rotate/tilt), so
   * the caller can mirror it into shared state (see `mapStore`). */
  onViewChange?: (view: MapViewState) => void
  /** Called when the user taps/clicks the base map itself (not a marker
   * or control) — e.g. to place a new waypoint there. */
  onMapClick?: (coordinate: Coordinate) => void
  /** Called when the user taps/clicks an existing waypoint marker. */
  onWaypointClick?: (waypointId: string) => void
}

/**
 * Adapter contract for the map engine. Nothing outside `src/services/map/`
 * may import the underlying mapping library directly — this is what keeps
 * the map provider replaceable per the project's hard rules.
 */
export interface MapProvider {
  createMap(options: CreateMapOptions): MapInstance
}

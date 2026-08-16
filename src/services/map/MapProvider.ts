import type { Coordinate, MapBaseLayerId, MapOverlayId, MapViewState, Waypoint } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export interface DownloadAreaProgress {
  tilesDownloaded: number
  bytesDownloaded: number
  tileUrls: string[]
}

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
  /** Draws (or updates) the in-progress GPS track as a line while
   * recording. Pass `null` (or fewer than 2 points) to clear it. */
  setTrackPreview(points: Coordinate[] | null): void
  /** The geographic bounds currently visible — the real basis for "make
   * this area available offline" (Phase 3), not a guessed/typed-in box. */
  getBounds(): LngLatBounds
  /**
   * Downloads every map tile covering `bounds` across `minZoom`–`maxZoom`
   * for the currently active base layer, and caches them for offline use.
   * Implemented by sweeping the camera across the area (so the map engine
   * issues its own real tile requests — this never has to know or guess a
   * vendor's tile URL template) while a request interceptor captures and
   * caches whatever tiles that triggers. `onProgress` fires after each
   * newly-cached tile with the running totals; `signal` cancels the sweep
   * (already-cached tiles are kept, not rolled back).
   */
  downloadArea(
    bounds: LngLatBounds,
    minZoom: number,
    maxZoom: number,
    onProgress: (progress: DownloadAreaProgress) => void,
    signal: AbortSignal,
  ): Promise<DownloadAreaProgress>
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
  /** Called when the user finishes dragging a waypoint marker to a new
   * position (drag-to-move) — the caller is responsible for persisting
   * it; the marker's on-screen position already reflects the drop point. */
  onWaypointDragEnd?: (waypointId: string, coordinate: Coordinate) => void
}

/**
 * Adapter contract for the map engine. Nothing outside `src/services/map/`
 * may import the underlying mapping library directly — this is what keeps
 * the map provider replaceable per the project's hard rules.
 */
export interface MapProvider {
  createMap(options: CreateMapOptions): MapInstance
}

import type {
  AnalysisHeatmapCell,
  Coordinate,
  DownloadSummary,
  MapBaseLayerId,
  MapOverlayId,
  MapViewState,
  OverlayStatus,
  WeatherMapLayer,
  WeatherTileFrame,
  Waypoint,
  WindField,
} from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export interface DownloadAreaProgress {
  /** Tiles available for the area after this run: fetched now + already
   * cached (`summary.succeeded + summary.reused`). */
  tilesDownloaded: number
  /** Bytes fetched from the network during this run (reused tiles: 0). */
  bytesDownloaded: number
  /** Tiles this run fetched itself — the ones the area owns for deletion. */
  tileUrls: string[]
  /** Honest ledger of the run: requests, retries, failures, sweep steps. */
  summary: DownloadSummary
}

/** Handle to a mounted map instance. Returned by `MapProvider.createMap`;
 * callers only ever see this interface, never the underlying engine (e.g.
 * MapLibre's `Map` class), so the engine stays swappable. */
/** What the distance/area measure tool wants drawn. `closed` = polygon
 * (fill + outline back to the first point) rather than an open line. */
export interface MeasureShape {
  points: Coordinate[]
  closed: boolean
}

/** A GPS trace as drawn on the map. */
export interface MapTrace {
  id: string
  kind: 'normal' | 'blood'
  /** Hex colour. */
  color: string
  points: readonly Coordinate[]
  /** Indexes in `points` that start a new, unconnected segment. */
  breaks?: readonly number[]
}

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
  /** Shows (or moves/removes, with `null`) the draggable marker of the
   * waypoint being created. Not part of `setWaypoints` on purpose: saved
   * markers are fixed, only this one can be adjusted before Save. */
  setDraftWaypoint(coordinate: Coordinate | null): void
  /** Highlights the saved waypoint with this id (larger, double ring) so the
   * open waypoint sheet and the map visibly refer to the same marker. `null`
   * clears it. Presentation only: never moves a marker or blocks the others. */
  setSelectedWaypoint(id: string | null): void
  /** Shows (or removes, with `null`) the PREVIEW of a point received through
   * a shared link: a distinct, non-draggable marker that is not a saved
   * waypoint. `name` is plain text. */
  setSharedPoint(coordinate: Coordinate | null, name: string): void
  /** Draws (or updates) the in-progress GPS track as a line while
   * recording. Pass `null` (or fewer than 2 points) to clear it. */
  setTrackPreview(points: Coordinate[] | null): void
  /** Draws the given GPS traces, each with its own colour and continuous
   * segments (no line across a pause or an interruption). Replaces the whole
   * set; pass `[]` to clear. Presentation only. */
  setTraces(traces: readonly MapTrace[]): void
  /** Draws dashed links between consecutive clues (`null`/`[]` clears). A
   * visual aid between observed points: never the animal's path. */
  setClueLinks(links: readonly (readonly Coordinate[])[] | null): void
  /** Draws (or clears, with `null`) the dashed straight line of "Aller à"
   * between the device position and the destination. Its own source and
   * layers, a colour distinct from the track preview and the measure path,
   * re-added after a base-layer switch. It is a drawing only: never a track,
   * never persisted. */
  setGuidanceLine(line: readonly [Coordinate, Coordinate] | null): void
  /** Sets the direction the phone points, in degrees clockwise from TRUE north,
   * on the device-position marker (a cone, aligned with the MAP so a rotated
   * map stays correct). `null` hides the cone: pass it unless the heading is
   * reliable. Never pass a GPS travel course here. */
  setUserHeading(trueHeadingDegrees: number | null): void
  /** Tells the engine its container changed size (immersive/fullscreen,
   * rotation, keyboard) so the canvas matches it again. */
  resize(): void
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
   * change of the ledger (tile fetched / reused / failed / absent / retried,
   * sweep step done or timed out) with the running totals; `signal` cancels
   * the sweep (already-cached tiles are kept, not rolled back).
   * The result's `summary` is what decides whether the download was complete:
   * a step that never reaches `idle` or a request that fails is recorded,
   * never skipped silently. Rejects if the map style is not loaded.
   */
  downloadArea(
    bounds: LngLatBounds,
    minZoom: number,
    maxZoom: number,
    onProgress: (progress: DownloadAreaProgress) => void,
    signal: AbortSignal,
  ): Promise<DownloadAreaProgress>
  /** Enables or disables real 3D terrain relief (Phase 4) — a DEM source
   * draped under the existing 2D style, not a separate mode. `exaggeration`
   * (1 = true scale) only matters while `enabled`. */
  setTerrainEnabled(enabled: boolean, exaggeration: number): void
  /** Real elevation (meters) from the loaded terrain DEM at a point, or
   * `null` if terrain is off or that tile hasn't loaded yet — never
   * guessed/interpolated when unavailable. */
  queryElevation(coordinate: Coordinate): number | null
  /** Draws each point of an in-progress elevation-profile measurement as
   * a dot (so the user can see exactly where they tapped), plus a
   * connecting line once there are 2 or more — works for any number of
   * points. Pass `null` (or an empty array) to clear. Its own dedicated
   * source/layers, independent of `setTrackPreview`, so drawing a
   * measurement never interferes with an in-progress GPS track. */
  setMeasurePath(points: Coordinate[] | null): void
  /** Draws the distance/area measure tool: a dot per point, a line through
   * them and, when `closed` with 3+ points, a translucent polygon fill. Own
   * source/layers (teal), independent of `setMeasurePath` (elevation profile,
   * amber) and of the track preview. `null` clears. The drawing is purely
   * visual and ephemeral — never persisted. */
  setMeasureShape(shape: MeasureShape | null): void
  /**
   * Renders (Phase 6) or clears (`null`) the Windy-style weather map
   * layer: `'wind'` draws an animated particle flow field (each particle
   * sampled from the *nearest* real grid point in `field`, never
   * interpolated/fabricated between samples, colored by local speed);
   * `'temperature' | 'precipitation' | 'clouds'` instead draw a smooth
   * color-graded overlay across the same real grid (`utils/
   * weatherMapColors.ts`'s calibrated per-layer color scale — the colors
   * are a stylistic choice, the underlying values are always real
   * Open-Meteo readings). `hourOffset` selects which hourly sample to use
   * (0 = soonest), for the interactive timeline; switching `layer` alone
   * never needs a re-fetch since every layer rides the same batched grid
   * response. The wind particle animation's time scale is deliberately
   * exaggerated for visual legibility — see `utils/windField.ts`'s
   * `advancePosition` — but direction and relative speed are always real
   * data.
   */
  setWindField(field: WindField | null, hourOffset: number, layer: WeatherMapLayer): void
  /**
   * Pauses (`true`) or resumes (`false`) the wind particle animation.
   * While paused the layer renders a single static frame (no
   * `requestAnimationFrame` loop) — used for `prefers-reduced-motion`
   * and for the visible Pause/Lecture button. Optional so adapters
   * without an animated layer need not implement it.
   */
  setWindAnimationPaused?(paused: boolean): void
  /**
   * Renders (Phase 9) or clears (`null`) the analysis heatmap: a soft
   * color-graded overlay, one blob per real `AnalysisHeatmapCell`,
   * colored by that cell's combined analyzer score
   * (`utils/analysisHeatmapColors.ts` — red/unfavorable through
   * green/favorable). Its own canvas, independent of the wind/weather
   * layer, so both can be shown without interfering with each other.
   */
  setAnalysisHeatmap(cells: AnalysisHeatmapCell[] | null): void
  /**
   * Renders or clears (`null` tileUrlTemplate) a named external raster
   * tile overlay — a genuine MapLibre raster layer (not a canvas overlay
   * like `setWindField`'s), sourced from a real external tile/WMS/ArcGIS
   * service, e.g. a real Québec government layer (`services/map/forestLayerTiles.ts`
   * — cadastre, coupes forestières, peuplements écoforestiers). `id`
   * namespaces the underlying source/layer so any number of these can be
   * shown simultaneously without clobbering each other; passing the same
   * `id` again with a different `tileUrlTemplate` replaces that one
   * overlay (a raster source's tile URLs can't be mutated in place).
   */
  setRasterOverlay(
    id: string,
    tileUrlTemplate: string | null,
    opacity: number,
    attribution?: string,
  ): void
  /** Manual « Réessayer » for one raster overlay: clears its latched error
   * and requests its tiles again. No-op when the overlay is not shown. */
  retryRasterOverlay?(id: string): void
  /**
   * Weather-app-style animated raster (radar loop / hourly forecast):
   * `frames` are real GeoMet WMS tile templates, `activeIndex` the one
   * shown. Frames near the active one are preloaded invisibly so playback
   * swaps instantly without flicker. `null` clears everything.
   */
  setWeatherFrames(
    frames: WeatherTileFrame[] | null,
    activeIndex: number,
    opacity: number,
  ): void
  /** Whether a frame's tiles for the current view have finished loading —
   * playback waits on this so it never flashes an empty frame. */
  isWeatherFrameReady(key: string): boolean
  /** Tear down the underlying engine instance and its DOM/WebGL resources. */
  destroy(): void
}

export interface CreateMapOptions {
  /** Load state of each named raster overlay (`setRasterOverlay`): loading,
   * ready, or error (tile/service failure). Lets the UI show a failed
   * government layer instead of an empty map. */
  onRasterOverlayStatus?: (id: string, status: OverlayStatus) => void
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
  /** Called when the user finishes dragging the *draft* marker (a waypoint
   * not saved yet) to a new position. Saved waypoint markers are never
   * draggable: a saved waypoint's location is locked. */
  onDraftMove?: (coordinate: Coordinate) => void
  /** Called when the USER moves the camera by gesture (drag, pinch/wheel/
   * double-tap zoom, rotate, tilt, or the zoom/compass buttons) — never for
   * a move made by the app itself (`setView`). Used to pause "follow my
   * position" so the app never fights the user's hand. */
  onUserInteraction?: () => void
  /** Called once per base-layer load attempt when the style itself (not an
   * individual tile) could not be loaded: provider unreachable, invalid key,
   * nothing cached offline. The caller decides the fallback. */
  onBaseLayerError?: (layer: MapBaseLayerId, message: string) => void
}

/**
 * Adapter contract for the map engine. Nothing outside `src/services/map/`
 * may import the underlying mapping library directly — this is what keeps
 * the map provider replaceable per the project's hard rules.
 */
export interface MapProvider {
  createMap(options: CreateMapOptions): MapInstance
}

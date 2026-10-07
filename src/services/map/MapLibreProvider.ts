import { Map as MapLibreMap, NavigationControl, setWorkerUrl } from 'maplibre-gl'
import type {
  AnalysisHeatmapCell,
  Coordinate,
  MapBaseLayerId,
  MapOverlayId,
  MapViewState,
  WeatherMapLayer,
  WeatherTileFrame,
  Waypoint,
  WindField,
} from '@/types'
import type { LngLatBounds } from '@/utils/tiles'
import { createAnalysisHeatmapLayer } from './analysisHeatmapLayer'
import { isValidCoordinate } from './coordinates'
import { sweepDownloadArea } from './downloadArea'
import { createMarkerController } from './markerController'
import type {
  CreateMapOptions,
  DownloadAreaProgress,
  MapInstance,
  MapProvider,
  MeasureShape,
} from './MapProvider'
import { ensureOfflineProtocolsRegistered, transformMapRequest } from './offlineProtocols'
import { createPathLayers } from './pathLayers'
import { createRasterOverlays, createWeatherFrames } from './rasterLayers'
import { buildStyleUrl } from './styleUrls'
import type { MapLibreProviderApiKeys } from './styleUrls'
import { applyTerrain, setTerrainExaggeration } from './terrain'
import { applyOverlay } from './vectorOverlays'
import { createWindLayer } from './windLayer'

export type { MapLibreProviderApiKeys } from './styleUrls'

/**
 * MapLibre GL JS, configured with whichever base-layer vendor(s) have a
 * key. Both MapTiler and Esri's Basemap Styles v2 service serve
 * MapLibre-compatible style JSON, so one engine instance covers both —
 * `setBaseLayer` is always just a style-URL swap regardless of vendor.
 * This file and its siblings under `services/map/` are the only code
 * allowed to import `maplibre-gl` directly — everything else depends on
 * `MapProvider`. This class only orchestrates; marker rendering, the
 * canvas layers, raster/weather layers and the download sweep each live in
 * their own module.
 */
export class MapLibreProvider implements MapProvider {
  private readonly apiKeys: MapLibreProviderApiKeys

  constructor(apiKeys: MapLibreProviderApiKeys) {
    this.apiKeys = apiKeys
  }

  private styleUrl(layer: MapBaseLayerId): string {
    return buildStyleUrl(this.apiKeys, layer)
  }

  createMap({
    container,
    initialView,
    initialBaseLayer,
    initialOverlays,
    onViewChange,
    onMapClick,
    onWaypointClick,
    onDraftMove,
    onUserInteraction,
    onBaseLayerError,
    onRasterOverlayStatus,
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
    ensureOfflineProtocolsRegistered()

    const map = new MapLibreMap({
      container,
      style: this.styleUrl(initialBaseLayer),
      center: [initialView.center.lng, initialView.center.lat],
      zoom: initialView.zoom,
      pitch: initialView.pitch,
      bearing: initialView.bearing,
      transformRequest: transformMapRequest,
      // MapLibre's own default maxPitch is 60° — a moderate tilt, not
      // close enough to the horizon to feel like standing at eye level
      // looking at terrain ahead. 85° is the ceiling MapLibre's own docs
      // describe for the initial `pitch` option (0–85); going further
      // toward 90 is what their docs flag as "experimental" and prone to
      // rendering issues, so 85 is the real, supported maximum, not an
      // arbitrary guess.
      maxPitch: 85,
    })

    map.addControl(new NavigationControl(), 'top-right')
    const windLayer = createWindLayer(map, container)
    const analysisHeatmapLayer = createAnalysisHeatmapLayer(map, container)
    const markers = createMarkerController(map, { onWaypointClick, onDraftMove })
    const pathLayers = createPathLayers(map)
    const rasterOverlays = createRasterOverlays(map, onRasterOverlayStatus)
    const weatherFrames = createWeatherFrames(map)

    // Re-applied on every style load — including the first one, and every
    // subsequent setStyle() from setBaseLayer, which discards all prior
    // per-layer visibility since it's a fresh style parse.
    const overlayState: Record<MapOverlayId, boolean> = { ...initialOverlays }
    // Terrain is always kept set on the map (see `terrain.ts`); "2D" just
    // holds exaggeration at 1 (true scale).
    let terrainExaggeration = 1

    // Style-level failure detection: an `error` event raised before the
    // current base style finished loading and not tied to a source or tile
    // is the style JSON itself failing (tile errors are transient and carry
    // a `sourceId`). Reported once per load attempt.
    let currentBaseLayer = initialBaseLayer
    let styleReady = false
    let failureReported = false
    map.on(
      'error',
      (event: { error?: { message?: string }; sourceId?: string; tile?: unknown }) => {
        if (styleReady || failureReported || event.sourceId || event.tile) return
        failureReported = true
        onBaseLayerError?.(currentBaseLayer, event.error?.message ?? 'style indisponible')
      },
    )

    map.on('style.load', () => {
      styleReady = true
      for (const overlay of Object.keys(overlayState) as MapOverlayId[]) {
        applyOverlay(map, overlay, overlayState[overlay])
      }
      // setStyle() discards custom sources/layers — re-add all of them
      // every time, seeded with the last known state.
      pathLayers.addToStyle()
      applyTerrain(map, terrainExaggeration)
      rasterOverlays.applyAll()
      weatherFrames.resetForNewStyle()
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

    if (onUserInteraction) {
      // `originalEvent` is only set when the camera move comes from the
      // user's input (pointer, touch, wheel, keyboard, nav buttons), not from
      // a programmatic `setCenter`/`jumpTo` of ours.
      for (const gesture of ['dragstart', 'zoomstart', 'rotatestart', 'pitchstart']) {
        map.on(gesture as 'dragstart', (event: { originalEvent?: unknown }) => {
          if (event.originalEvent) onUserInteraction()
        })
      }
    }

    if (onMapClick) {
      map.on('click', (e) => {
        onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng })
      })
    }

    return {
      setView(view: Partial<MapViewState>) {
        if (view.center && isValidCoordinate(view.center)) {
          map.setCenter([view.center.lng, view.center.lat])
        }
        if (view.zoom !== undefined) map.setZoom(view.zoom)
        if (view.pitch !== undefined) map.setPitch(view.pitch)
        if (view.bearing !== undefined) map.setBearing(view.bearing)
      },
      setBaseLayer: (layer: MapBaseLayerId) => {
        currentBaseLayer = layer
        styleReady = false
        failureReported = false
        map.setStyle(this.styleUrl(layer))
      },
      setOverlayVisible(overlay: MapOverlayId, visible: boolean) {
        overlayState[overlay] = visible
        applyOverlay(map, overlay, visible)
      },
      setUserLocationMarker(coordinate: Coordinate | null) {
        markers.setUserLocation(coordinate)
      },
      setWaypoints(waypoints: Waypoint[]) {
        markers.setWaypoints(waypoints)
      },
      setDraftWaypoint(coordinate: Coordinate | null) {
        markers.setDraft(coordinate)
      },
      setSelectedWaypoint(id: string | null) {
        markers.setSelectedWaypoint(id)
      },
      setSharedPoint(coordinate: Coordinate | null, name: string) {
        markers.setSharedPoint(coordinate, name)
      },
      setTrackPreview(points: Coordinate[] | null) {
        pathLayers.setTrackPreview(points)
      },
      setMeasurePath(points: Coordinate[] | null) {
        pathLayers.setMeasurePath(points)
      },
      setMeasureShape(shape: MeasureShape | null) {
        pathLayers.setMeasureShape(shape)
      },
      setGuidanceLine(line: readonly [Coordinate, Coordinate] | null) {
        pathLayers.setGuidanceLine(line)
      },
      setUserHeading(trueHeadingDegrees: number | null) {
        markers.setUserHeading(trueHeadingDegrees)
      },
      setWindField(field: WindField | null, hourOffset: number, layer: WeatherMapLayer) {
        windLayer.setField(field, hourOffset, layer)
      },
      setWindAnimationPaused(paused: boolean) {
        windLayer.setPaused(paused)
      },
      setAnalysisHeatmap(cells: AnalysisHeatmapCell[] | null) {
        analysisHeatmapLayer.setCells(cells)
      },
      setWeatherFrames(
        frames: WeatherTileFrame[] | null,
        activeIndex: number,
        opacity: number,
      ) {
        weatherFrames.set(frames, activeIndex, opacity)
      },
      isWeatherFrameReady(key: string): boolean {
        return weatherFrames.isReady(key)
      },
      setRasterOverlay(
        id: string,
        tileUrlTemplate: string | null,
        opacity: number,
        attribution?: string,
      ) {
        rasterOverlays.set(id, tileUrlTemplate, opacity, attribution)
      },
      setTerrainEnabled(enabled: boolean, exaggeration: number) {
        // Terrain itself stays set either way — "2D" means "real scale,
        // not visually exaggerated," not "no terrain at all."
        terrainExaggeration = enabled ? exaggeration : 1
        setTerrainExaggeration(map, terrainExaggeration)
      },
      queryElevation(coordinate: Coordinate): number | null {
        // MapLibre throws on an invalid LngLat; "unavailable" is the
        // honest answer for a coordinate that isn't one.
        if (!isValidCoordinate(coordinate)) return null
        const raw = map.queryTerrainElevation([coordinate.lng, coordinate.lat])
        if (raw === null) return null
        // MapLibre's own docs: "If terrain is enabled with some
        // exaggeration value, the value returned here will be
        // reflective of (multiplied by) that exaggeration value" — undo
        // that scaling so callers always get the real elevation,
        // regardless of the visual exaggeration currently active.
        return raw / terrainExaggeration
      },
      resize() {
        map.resize()
      },
      getBounds(): LngLatBounds {
        const bounds = map.getBounds()
        return {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        }
      },
      downloadArea(
        bounds: LngLatBounds,
        minZoom: number,
        maxZoom: number,
        onProgress: (progress: DownloadAreaProgress) => void,
        signal: AbortSignal,
      ): Promise<DownloadAreaProgress> {
        return sweepDownloadArea(map, bounds, minZoom, maxZoom, onProgress, signal)
      },
      destroy() {
        markers.destroy()
        windLayer.destroy()
        analysisHeatmapLayer.destroy()
        map.remove()
      },
    }
  }
}

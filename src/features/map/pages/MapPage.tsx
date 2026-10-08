import type { Coordinate, ForestLayerId, MapBaseLayerId } from '@/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Expand, Maximize, MapPinOff, Minimize, Shrink, Wrench } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { availableBaseLayers, mapProvider } from '@/services/map'
import type { MapInstance } from '@/services/map'
import {
  MapToolRail,
  MapToolsProvider,
  ToolTrigger,
  ToolsSheet,
} from '@/components/map-tools'
import { Badge, EmptyState, PageHeader } from '@/components/ui'
import { cn } from '@/utils/cn'
import { AnalysisControl } from '@/features/analytics/components/AnalysisControl'
import { HeatmapControl } from '@/features/analytics/components/HeatmapControl'
import { useAnalysisStore } from '@/features/analytics/state/analysisStore'
import { projectHeatmapCells } from '@/features/analytics/heatmapProjection'
import { useHeatmapStore } from '@/features/analytics/state/heatmapStore'
import { CompassDisplay } from '@/features/field-mode/components/CompassDisplay'
import { useFieldModeStore } from '@/features/field-mode/state/fieldModeStore'
import { LayerManagerPanel } from '@/features/layers/components/LayerManagerPanel'
import {
  baseLayerFailureNotice,
  nextFallbackLayer,
  resolveInitialBaseLayer,
  startupFallbackNotice,
} from '@/features/layers/startupBaseLayer'
import { baseLayerLabel } from '@/features/layers/baseLayerOptions'
import { useLayersStore } from '@/features/layers/state/layersStore'
import { GpsControl } from '@/features/gps/components/GpsControl'
import { GpsStatusBadge } from '@/features/gps/components/GpsStatusBadge'
import { MyPositionControl } from '@/features/gps/components/MyPositionControl'
import { GuidancePanel } from '@/features/guidance/components/GuidancePanel'
import { SharedPointCard } from '@/features/share/components/SharedPointCard'
import { useSharedPointStore } from '@/features/share/sharedPointStore'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { HiddenByFilterNotice } from '@/features/territories/components/HiddenByFilterNotice'
import { TerritoryMapControl } from '@/features/territories/components/TerritoryMapControl'
import { filterItems } from '@/features/territories/filter'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useEnsureTerritories } from '@/features/territories/useEnsureTerritories'
import { OfflineAreaControl } from '@/features/offline/components/OfflineAreaControl'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { canRetryArea } from '@/features/offline/areaStatus'
import { ForestLayersControl } from '@/features/forest-layers/components/ForestLayersControl'
import {
  effectiveOpacity,
  useForestLayersStore,
} from '@/features/forest-layers/state/forestLayersStore'
import { FOREST_LAYER_OPTIONS, forestLayerTileUrl } from '@/services/map/forestLayerTiles'
import { MeasurePanel } from '@/features/measure/components/MeasurePanel'
import { MeasureTools } from '@/features/measure/components/MeasureTools'
import { useMeasureStore } from '@/features/measure/state/measureStore'
import { useMeasureExclusivity } from '@/features/measure/useMeasureExclusivity'
import { WeatherMapControl } from '@/features/weather-map/components/WeatherMapControl'
import { useWeatherMapStore } from '@/features/weather-map/state/weatherMapStore'
import { frameKey } from '@/features/weather-map/useWeatherMapEffects'
import { geoMetTileUrls, layerDef } from '@/services/weather-map'
import { useWindStore } from '@/features/wind/state/windStore'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { TrackRecorderControl } from '@/features/waypoints/components/TrackRecorderControl'
import { TraceFilterControl } from '@/features/waypoints/components/TraceFilterControl'
import { BloodPanel } from '@/features/blood/components/BloodPanel'
import { BloodCameraHost } from '@/features/blood/components/BloodCameraHost'
import { BloodStartControl } from '@/features/blood/components/BloodStartControl'
import { useBloodStore } from '@/features/blood/state/bloodStore'
import { clueLinkPaths, overviewView, sessionClues } from '@/features/blood/sessionLogic'
import { WaypointControl } from '@/features/waypoints/components/WaypointControl'
import { WaypointEditPanel } from '@/features/waypoints/components/WaypointEditPanel'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useTraceDisplayStore } from '@/features/waypoints/state/traceDisplayStore'
import { buildMapTraces } from '@/features/waypoints/mapTraces'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useMapStore } from '../state/mapStore'
import { useFollowStore } from '../state/followStore'
import { useFollowPosition } from '../useFollowPosition'
import { FollowControl, ResumeFollowButton } from '../components/FollowControl'
import { useTerrainToolsStore } from '../state/terrainToolsStore'
import { useImmersiveMode } from '../useImmersiveMode'
import { sampleSlopeAspect } from '../terrainQuery'
import { ElevationProfileControl } from '../components/ElevationProfileControl'
import { TerrainInfoControl } from '../components/TerrainInfoControl'
import { ViewModeToggle } from '../components/ViewModeToggle'
import { ZoomTool } from '../components/ZoomTool'

/** Field/street scale — close enough to make out individual trails and
 * terrain features after tapping "recenter on me", per user feedback
 * that the previous recenter (pan only, no zoom change) left the view
 * too far out to actually be useful. */
const GPS_LOCATE_ZOOM = 16
/** Smallest width the bottom dock leaves on the right (7 rem). */
const DOCK_MIN_RESERVE_PX = 112
/** Zoom used to bring a shared point into view. */
const SHARED_POINT_ZOOM = 15

export function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<MapInstance | null>(null)
  const view = useMapStore((state) => state.view)
  const setView = useMapStore((state) => state.setView)
  const terrainExaggeration = useMapStore((state) => state.terrainExaggeration)
  const setTerrainExaggeration = useMapStore((state) => state.setTerrainExaggeration)
  const baseLayer = useLayersStore((state) => state.baseLayer)
  const appliedBaseLayerRef = useRef(baseLayer)
  const overlays = useLayersStore((state) => state.overlays)
  const appliedOverlaysRef = useRef(overlays)
  const [railHost, setRailHost] = useState<HTMLDivElement | null>(null)
  const [sheetHost, setSheetHost] = useState<HTMLDivElement | null>(null)
  // Width the bottom dock leaves free for the tool rail, measured from the
  // rail itself (it wraps into more columns on short screens). `null` until
  // measured: the CSS default of the dock applies meanwhile.
  const [dockReserve, setDockReserve] = useState<number | null>(null)
  const [toolsOpen, setToolsOpen] = useState(false)
  const closeTools = useCallback(() => setToolsOpen(false), [])
  const toolsContext = useMemo(
    () => ({ railHost, sheetHost, closeSheet: closeTools }),
    [railHost, sheetHost, closeTools],
  )
  const { immersive, nativeSupported, nativeActive, toggleImmersive, toggleNative } =
    useImmersiveMode()
  const gpsReading = useGeolocation()
  const getMapInstance = useCallback(() => instanceRef.current, [])
  const isOnline = useOnlineStatus()
  const waypoints = useWaypointsStore((state) => state.waypoints)
  useEnsureTerritories()
  const territories = useTerritoriesStore((state) => state.territories)
  const territoryFilter = useTerritoriesStore((state) => state.filter)
  // The map shows only the waypoints the territory filter lets through. Saved
  // tracks are not drawn on the map (only the recording in progress, which is
  // never filtered), so only waypoints can be hidden here.
  const visibleWaypoints = useMemo(
    () => filterItems(waypoints, territoryFilter, territories),
    [waypoints, territoryFilter, territories],
  )
  const hiddenWaypointCount = waypoints.length - visibleWaypoints.length
  const draftCoordinate = useWaypointsStore((state) => state.draft?.coordinate ?? null)
  const editingWaypointId = useWaypointsStore((state) => state.editingId)
  const sharedPoint = useSharedPointStore((state) => state.point)
  const trackStatus = useTracksStore((state) => state.status)
  const trackPoints = useTracksStore((state) => state.points)
  const trackBreaks = useTracksStore((state) => state.breaks)
  const recordingId = useTracksStore((state) => state.recordingId)
  const storedTracks = useTracksStore((state) => state.tracks)
  const traceFilter = useTraceDisplayStore((state) => state.filter)
  const profilePoints = useTerrainToolsStore((state) => state.profilePoints)
  const measureKind = useMeasureStore((state) => state.kind)
  const measurePoints = useMeasureStore((state) => state.points)
  const windEnabled = useWindStore((state) => state.enabled)
  const windField = useWindStore((state) => state.field)
  const windHourOffset = useWindStore((state) => state.selectedHourOffset)
  const windPaused = useWindStore((state) => state.animationPaused)
  const heatmapEnabled = useHeatmapStore((state) => state.enabled)
  const heatmapCells = useHeatmapStore((state) => state.cells)
  const heatmapSelectedView = useHeatmapStore((state) => state.selectedView)
  const heatmapSelectedCell = useHeatmapStore((state) => state.selectedCellIndex)
  const fieldModeEnabled = useFieldModeStore((state) => state.enabled)
  const weatherMapEnabled = useWeatherMapStore((state) => state.enabled)
  const weatherMapLayer = useWeatherMapStore((state) => state.activeLayer)
  const weatherMapFrames = useWeatherMapStore((state) => state.frames)
  const weatherMapFrameIndex = useWeatherMapStore((state) => state.frameIndex)
  const weatherMapOpacity = useWeatherMapStore((state) => state.opacity)
  const forestLayersEnabled = useForestLayersStore((state) => state.enabled)
  const forestLayersOpacity = useForestLayersStore((state) => state.opacity)
  const forestLayerOpacities = useForestLayersStore((state) => state.layerOpacity)

  useMeasureExclusivity(fieldModeEnabled)

  // Field Mode's "low power draw" requirement: turning it on also turns
  // off the two continuously-animated canvas layers (wind flow field,
  // analysis heatmap), which stop their requestAnimationFrame loops —
  // a real battery saving, not just a visual simplification. Re-enabling
  // either one manually while Field Mode stays on is still possible; this
  // only forces them off at the moment Field Mode is switched on.
  useEffect(() => {
    if (!fieldModeEnabled) return
    if (useWindStore.getState().enabled) useWindStore.setState({ enabled: false })
    if (useHeatmapStore.getState().enabled) useHeatmapStore.setState({ enabled: false })
    if (useWeatherMapStore.getState().enabled)
      useWeatherMapStore.setState({ enabled: false, playing: false })
  }, [fieldModeEnabled])

  useEffect(() => {
    if (!mapProvider || !containerRef.current) return

    // Open on the hybrid satellite view (see `startupBaseLayer.ts`) unless the
    // user already picked a layer this session; never request a style whose
    // vendor key is missing.
    const layers = useLayersStore.getState()
    const initialBaseLayer = resolveInitialBaseLayer(
      availableBaseLayers,
      layers.baseLayer,
      layers.baseLayerChosenByUser,
    )
    if (initialBaseLayer !== layers.baseLayer) {
      layers.setInitialBaseLayer(initialBaseLayer)
    }
    // Say it explicitly when the hybrid view cannot be used (provider not
    // configured) instead of silently opening on another layer.
    layers.setBaseLayerNotice(
      layers.baseLayerChosenByUser
        ? null
        : startupFallbackNotice(availableBaseLayers, initialBaseLayer),
    )
    const failedBaseLayers: MapBaseLayerId[] = []
    // The engine is created with this layer: not a change to apply afterwards.
    appliedBaseLayerRef.current = initialBaseLayer

    const instance = mapProvider.createMap({
      container: containerRef.current,
      initialView: view,
      initialBaseLayer,
      initialOverlays: useLayersStore.getState().overlays,
      onViewChange: setView,
      onMapClick: (coordinate) => {
        // Manual placement of a blood clue (no usable GPS): the tap chooses
        // the position, saved only after the user confirms in the panel.
        if (useBloodStore.getState().manual) {
          useBloodStore.getState().setManualCoordinate(coordinate)
          return
        }
        const waypoints = useWaypointsStore.getState()
        if (waypoints.isPlacing) {
          waypoints.placeWaypointAt(coordinate)
          return
        }
        // A tap while a new waypoint is being created adjusts that draft.
        // It never moves a saved waypoint: those are locked once saved.
        if (waypoints.draft) {
          waypoints.moveDraft(coordinate)
          return
        }
        const terrainMode = useTerrainToolsStore.getState().mode
        if (terrainMode === 'querying') {
          const map = instanceRef.current
          if (!map) return
          useTerrainToolsStore.getState().setQueryResult({
            coordinate,
            elevationMeters: map.queryElevation(coordinate),
            slopeAspect: sampleSlopeAspect((c) => map.queryElevation(c), coordinate),
          })
        } else if (terrainMode === 'profiling') {
          useTerrainToolsStore.getState().addProfilePoint(coordinate)
        } else if (useMeasureStore.getState().active) {
          useMeasureStore.getState().addPoint(coordinate)
        } else if (useAnalysisStore.getState().mode === 'analyzing') {
          const map = instanceRef.current
          if (!map) return
          // Même heure que la carte de potentiel quand elle est affichée.
          const heat = useHeatmapStore.getState()
          void useAnalysisStore
            .getState()
            .analyze(
              coordinate,
              (c) => map.queryElevation(c),
              undefined,
              heat.enabled ? heat.selectedHourKey : null,
            )
        } else if (useHeatmapStore.getState().enabled) {
          // Un toucher sur une cellule de la carte de potentiel ouvre sa
          // fiche (hors de la zone analysée : ferme la fiche).
          useHeatmapStore.getState().selectCellAt(coordinate)
        }
      },
      // A drag / zoom / rotate by the user pauses "follow my position".
      onUserInteraction: () => useFollowStore.getState().pauseForUserGesture(),
      onWaypointClick: (id) => useWaypointsStore.getState().selectWaypoint(id),
      onDraftMove: (coordinate) => useWaypointsStore.getState().moveDraft(coordinate),
      // Government overlays: surface "loading / loaded / error" in the panel.
      onRasterOverlayStatus: (overlayId, status) => {
        if (!overlayId.startsWith('forest-')) return
        useForestLayersStore
          .getState()
          .setStatus(overlayId.slice('forest-'.length) as ForestLayerId, status)
      },
      onBaseLayerError: (failed) => {
        const state = useLayersStore.getState()
        failedBaseLayers.push(failed)
        // Never override a layer the user picked: tell them instead.
        if (state.baseLayerChosenByUser || state.baseLayer !== failed) {
          state.setBaseLayerNotice(baseLayerFailureNotice(failed, null))
          return
        }
        const fallback = nextFallbackLayer(availableBaseLayers, failedBaseLayers)
        state.setBaseLayerNotice(baseLayerFailureNotice(failed, fallback))
        if (fallback) {
          state.setInitialBaseLayer(fallback)
        }
      },
    })
    instanceRef.current = instance
    void useWaypointsStore.getState().load()
    void useTracksStore.getState().load()
    void useBloodStore.getState().load()
    void useOfflineStore.getState().load()
    void useFieldModeStore.getState().load()

    return () => {
      instanceRef.current = null
      useFollowStore.getState().stop()
      // The measurement is ephemeral and dies with the map it was drawn on.
      instance.setMeasureShape(null)
      useMeasureStore.getState().close()
      instance.destroy()
    }
    // Mount once: the map manages its own camera after creation, and further
    // `view` writes come *from* this effect (via setView), not into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Skip the run that fires on mount with the same value the map was
    // already created with — only react to an actual layer change.
    // Read the live store value, not the render-time closure: the mount
    // effect above may have replaced the placeholder layer in this same commit.
    const current = useLayersStore.getState().baseLayer
    if (appliedBaseLayerRef.current === current) return
    appliedBaseLayerRef.current = current
    instanceRef.current?.setBaseLayer(current)
  }, [baseLayer])

  // "Réessayer" requested from Réglages: run the existing `retryArea` once the
  // map exists and the areas are loaded. Only on the area's own base layer
  // (the sweep caches the layer on screen) — otherwise say so, never guess.
  const pendingRetryAreaId = useOfflineStore((state) => state.pendingRetryAreaId)
  const offlineLoaded = useOfflineStore((state) => state.loaded)
  const offlineAreas = useOfflineStore((state) => state.areas)
  useEffect(() => {
    const map = instanceRef.current
    if (!pendingRetryAreaId || !offlineLoaded || !map) return
    const offline = useOfflineStore.getState()
    offline.clearPendingRetry()
    const area = offlineAreas.find((a) => a.id === pendingRetryAreaId)
    if (!area || !canRetryArea(area)) return
    if (area.baseLayer !== baseLayer) {
      useLayersStore
        .getState()
        .setBaseLayerNotice(
          `Pour réessayer « ${area.name} », choisissez d’abord le fond « ${baseLayerLabel(area.baseLayer)} », puis touchez « Réessayer le téléchargement ».`,
        )
      return
    }
    void offline.retryArea(map, area).catch(() => undefined)
  }, [pendingRetryAreaId, offlineLoaded, offlineAreas, baseLayer])

  useEffect(() => {
    if (appliedOverlaysRef.current === overlays) return
    const previous = appliedOverlaysRef.current
    appliedOverlaysRef.current = overlays
    for (const id of Object.keys(overlays) as (keyof typeof overlays)[]) {
      if (overlays[id] !== previous[id]) {
        instanceRef.current?.setOverlayVisible(id, overlays[id])
      }
    }
  }, [overlays])

  useEffect(() => {
    const parent = railHost?.offsetParent
    if (!railHost || !(parent instanceof HTMLElement)) return
    if (typeof ResizeObserver === 'undefined') return
    const measure = () => {
      // The rail wraps into extra columns (or a row) that can overflow its own
      // box on short screens, so measure the buttons themselves.
      let left = Number.POSITIVE_INFINITY
      for (const element of [railHost, ...Array.from(railHost.children)]) {
        const rect = element.getBoundingClientRect()
        if (rect.width > 0) left = Math.min(left, rect.left)
      }
      if (!Number.isFinite(left)) return
      // + the rail's own right margin (0.5 rem) and the gap to the dock
      // (0.5 rem), and never less than 7 rem: the MapLibre attribution pill
      // sits under the rail and is about 100 px wide.
      const reserve = parent.getBoundingClientRect().right - left + 8
      setDockReserve(Math.max(DOCK_MIN_RESERVE_PX, Math.ceil(reserve)))
    }
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(railHost)
    resizeObserver.observe(parent)
    const mutationObserver = new MutationObserver(measure)
    mutationObserver.observe(railHost, { childList: true })
    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
    }
  }, [railHost])

  // The map container changes size when immersive mode toggles, the device
  // rotates or the on-screen keyboard opens. MapLibre only watches the
  // window, so tell the engine through the adapter whenever that happens.
  useEffect(() => {
    const frame = requestAnimationFrame(() => instanceRef.current?.resize())
    return () => cancelAnimationFrame(frame)
  }, [immersive])

  useEffect(() => {
    const resize = () => instanceRef.current?.resize()
    window.addEventListener('orientationchange', resize)
    window.visualViewport?.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('orientationchange', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    instanceRef.current?.setUserLocationMarker(
      gpsReading.status === 'available' ? gpsReading.value : null,
    )
    // `trackStatus` is a dependency (not just `gpsReading`) so the very
    // first point is captured the moment recording starts, rather than
    // waiting for the next GPS update — which, if the device hasn't
    // physically moved, might not come for a while.
    if (gpsReading.status === 'available' && trackStatus === 'recording') {
      useTracksStore.getState().addPoint(gpsReading.value)
    }
  }, [gpsReading, trackStatus])

  useFollowPosition(instanceRef, gpsReading)

  useEffect(() => {
    instanceRef.current?.setWaypoints(visibleWaypoints)
  }, [visibleWaypoints])

  // A blood clue being placed by hand shows like a draft until confirmed.
  const manualCoordinate = useBloodStore((state) => state.manual?.coordinate ?? null)
  useEffect(() => {
    instanceRef.current?.setDraftWaypoint(draftCoordinate ?? manualCoordinate)
  }, [draftCoordinate, manualCoordinate])

  // Optional dashed links between the clues of the open blood search.
  const bloodSessions = useBloodStore((state) => state.sessions)
  const showClueLinks = useBloodStore((state) => state.showLinks)
  useEffect(() => {
    const open = bloodSessions.find((session) => session.status !== 'finished')
    instanceRef.current?.setClueLinks(
      showClueLinks && open ? clueLinkPaths(sessionClues(waypoints, open.id)) : null,
    )
  }, [bloodSessions, showClueLinks, waypoints])

  // The waypoint whose sheet is open is highlighted on the map.
  useEffect(() => {
    instanceRef.current?.setSelectedWaypoint(editingWaypointId)
  }, [editingWaypointId])

  // Preview of a point received through a shared link (never a saved
  // waypoint). A newly received point is brought into view once.
  useEffect(() => {
    instanceRef.current?.setSharedPoint(
      sharedPoint?.coordinate ?? null,
      sharedPoint?.name ?? '',
    )
    if (sharedPoint) {
      const zoom = Math.max(useMapStore.getState().view.zoom, SHARED_POINT_ZOOM)
      const nextView = { center: sharedPoint.coordinate, zoom }
      useMapStore.getState().setView(nextView)
      instanceRef.current?.setView(nextView)
    }
  }, [sharedPoint])

  useEffect(() => {
    const live =
      recordingId && trackStatus !== 'idle'
        ? { id: recordingId, points: trackPoints, breaks: trackBreaks }
        : null
    // The territory filter applies to stored traces like to waypoints; the
    // recording in progress is never hidden by it.
    const visible = filterItems(storedTracks, territoryFilter, territories).concat(
      recordingId ? storedTracks.filter((t) => t.id === recordingId) : [],
    )
    const unique = visible.filter((t, i) => visible.findIndex((o) => o.id === t.id) === i)
    instanceRef.current?.setTraces(buildMapTraces(unique, traceFilter, live))
  }, [
    storedTracks,
    traceFilter,
    recordingId,
    trackPoints,
    trackBreaks,
    trackStatus,
    territoryFilter,
    territories,
  ])

  useEffect(() => {
    // Shows each tapped point immediately (a dot) and, once there are 2+,
    // the connecting line — kept visible after "Done" too (until the
    // profile panel is closed/discarded, which clears `profilePoints`),
    // so the chart's numbers stay visually tied to the path they describe.
    instanceRef.current?.setMeasurePath(profilePoints.length > 0 ? profilePoints : null)
  }, [profilePoints])

  useEffect(() => {
    instanceRef.current?.setMeasureShape(
      measureKind && measurePoints.length > 0
        ? { points: measurePoints, closed: measureKind === 'area' }
        : null,
    )
  }, [measureKind, measurePoints])

  useEffect(() => {
    instanceRef.current?.setWindAnimationPaused?.(windPaused)
  }, [windPaused, windEnabled, windField])

  useEffect(() => {
    // Particles only — the colored weather surfaces are now real GeoMet
    // rasters (see the weather-map effect below).
    instanceRef.current?.setWindField(
      windEnabled ? windField : null,
      windHourOffset,
      'wind',
    )
  }, [windEnabled, windField, windHourOffset])

  useEffect(() => {
    if (!weatherMapEnabled || weatherMapFrames.length === 0) {
      instanceRef.current?.setWeatherFrames(null, 0, weatherMapOpacity)
      return
    }
    const def = layerDef(weatherMapLayer)
    instanceRef.current?.setWeatherFrames(
      weatherMapFrames.map((frame) => ({
        key: frameKey(weatherMapLayer, frame.time),
        tileUrlTemplates: geoMetTileUrls(def, frame.time),
      })),
      weatherMapFrameIndex,
      weatherMapOpacity,
    )
  }, [
    weatherMapEnabled,
    weatherMapLayer,
    weatherMapFrames,
    weatherMapFrameIndex,
    weatherMapOpacity,
  ])

  useEffect(() => {
    for (const option of FOREST_LAYER_OPTIONS) {
      instanceRef.current?.setRasterOverlay(
        `forest-${option.id}`,
        forestLayersEnabled[option.id] ? forestLayerTileUrl(option.id) : null,
        effectiveOpacity(
          { opacity: forestLayersOpacity, layerOpacity: forestLayerOpacities },
          option.id,
        ),
        option.attribution,
      )
    }
  }, [forestLayersEnabled, forestLayersOpacity, forestLayerOpacities])

  useEffect(() => {
    if (!heatmapEnabled) {
      instanceRef.current?.setAnalysisHeatmap(null)
      return
    }
    // Re-projecting to a family / single analyzer is a pure client-side
    // transform of the already-computed cells — never a re-fetch, same
    // "instant, no re-fetch" principle as the Phase 6 layer switcher.
    const projected = projectHeatmapCells(
      heatmapCells,
      heatmapSelectedView,
      heatmapSelectedCell,
    )
    instanceRef.current?.setAnalysisHeatmap(projected)
  }, [heatmapEnabled, heatmapCells, heatmapSelectedView, heatmapSelectedCell])

  function locate() {
    if (gpsReading.status !== 'available') return
    const coordinate = gpsReading.value
    // Recentering should actually bring the user's position into view at
    // a useful field scale — only zoom *in* to it (never out, in case
    // they'd already zoomed in further than this on purpose).
    const zoom = Math.max(view.zoom, GPS_LOCATE_ZOOM)
    const nextView = { center: { lat: coordinate.lat, lng: coordinate.lng }, zoom }
    setView(nextView)
    instanceRef.current?.setView(nextView)
  }

  function centerOnPosition(coordinate: Coordinate) {
    const nextView = {
      center: { lat: coordinate.lat, lng: coordinate.lng },
      zoom: Math.max(view.zoom, GPS_LOCATE_ZOOM),
    }
    setView(nextView)
    instanceRef.current?.setView(nextView)
  }

  function showOverview(coordinates: Coordinate[]) {
    const fitted = overviewView(coordinates)
    if (!fitted) return
    setView(fitted)
    instanceRef.current?.setView(fitted)
  }

  function centerOnSharedPoint() {
    const point = useSharedPointStore.getState().point
    if (!point) return
    const zoom = Math.max(view.zoom, SHARED_POINT_ZOOM)
    const nextView = { center: point.coordinate, zoom }
    setView(nextView)
    instanceRef.current?.setView(nextView)
  }

  function changeZoom(delta: number) {
    const zoom = Math.min(22, Math.max(0, Math.round(view.zoom) + delta))
    setView({ zoom })
    instanceRef.current?.setView({ zoom })
  }

  function setViewMode(pitch: number, bearing: number) {
    setView({ pitch, bearing })
    instanceRef.current?.setView({ pitch, bearing })
    instanceRef.current?.setTerrainEnabled(pitch > 0, terrainExaggeration)
  }

  function changeTerrainExaggeration(exaggeration: number) {
    setTerrainExaggeration(exaggeration)
    if (view.pitch > 0) {
      // Read back the clamped value rather than trusting the raw input —
      // the engine must always match what the UI is about to display.
      instanceRef.current?.setTerrainEnabled(
        true,
        useMapStore.getState().terrainExaggeration,
      )
    }
  }

  const baseLayerNotice = useLayersStore((state) => state.baseLayerNotice)

  const statusBadges = (
    <>
      {!isOnline && <Badge variant="warning">Hors ligne — cartes en cache</Badge>}
      <GpsStatusBadge reading={gpsReading} />
      <HiddenByFilterNotice hiddenCount={hiddenWaypointCount} />
    </>
  )

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', !immersive && 'md:gap-3 md:p-6')}>
      {/* Hidden on short screens (phone in landscape): the map needs the height. */}
      {!immersive && (
        <div className="hidden md:[@media(min-height:640px)]:block">
          <PageHeader title="Carte" />
        </div>
      )}
      {mapProvider ? (
        <div className="relative min-h-0 flex-1">
          {/* MapLibre's own stylesheet forces `position: relative` on the
              element it mounts into, which would cancel `absolute inset-0`
              there and collapse it to zero height — hence the wrapper. */}
          <div
            className={cn(
              'absolute inset-0 overflow-hidden',
              !immersive && 'md:rounded-card md:border-surface-600 md:border',
            )}
          >
            <div
              ref={containerRef}
              className="h-full w-full"
              data-testid="map-container"
            />
          </div>
          <MapToolsProvider value={toolsContext}>
            <div className="pointer-events-none absolute top-2 left-2 z-10 flex flex-wrap gap-1">
              {statusBadges}
            </div>
            {baseLayerNotice && (
              <p
                role="status"
                className="border-status-warning/50 bg-surface-900/95 text-ink-100 pointer-events-none absolute top-12 left-2 z-10 max-w-[calc(100%-5rem)] rounded-md border px-3 py-2 text-xs shadow-lg"
              >
                {baseLayerNotice}
              </p>
            )}
            {fieldModeEnabled ? (
              <div className="absolute top-12 left-3 z-10">
                <CompassDisplay />
              </div>
            ) : (
              <LayerManagerPanel />
            )}
            <ZoomTool zoom={view.zoom} onZoom={changeZoom} />
            {!fieldModeEnabled && (
              <ViewModeToggle
                pitch={view.pitch}
                onChange={setViewMode}
                terrainExaggeration={terrainExaggeration}
                onTerrainExaggerationChange={changeTerrainExaggeration}
              />
            )}
            <MapToolRail setHost={setRailHost} />
            <GpsControl reading={gpsReading} onLocate={locate} large={fieldModeEnabled} />
            <FollowControl
              gpsReading={gpsReading}
              onStart={locate}
              large={fieldModeEnabled}
            />
            <MyPositionControl reading={gpsReading} />
            <WaypointControl large={fieldModeEnabled} />
            <ToolTrigger
              placement="rail"
              label="Outils"
              title="Outils de la carte"
              icon={<Wrench size={20} aria-hidden="true" />}
              onClick={() => setToolsOpen((open) => !open)}
              pressed={toolsOpen}
              active={toolsOpen}
              large={fieldModeEnabled}
              order={50}
            />
            <ToolTrigger
              placement="rail"
              label={immersive ? 'Quitter le mode immersif' : 'Mode immersif'}
              icon={
                immersive ? (
                  <Shrink size={20} aria-hidden="true" />
                ) : (
                  <Expand size={20} aria-hidden="true" />
                )
              }
              onClick={toggleImmersive}
              pressed={immersive}
              active={immersive}
              large={fieldModeEnabled}
              order={60}
            />
            {nativeSupported && (
              <ToolTrigger
                label={
                  nativeActive
                    ? 'Quitter le plein écran du navigateur'
                    : 'Plein écran du navigateur'
                }
                icon={
                  nativeActive ? (
                    <Minimize size={18} aria-hidden="true" />
                  ) : (
                    <Maximize size={18} aria-hidden="true" />
                  )
                }
                onClick={() => void toggleNative()}
                active={nativeActive}
                order={1}
              />
            )}
            <ToolsSheet open={toolsOpen} onClose={closeTools} setHost={setSheetHost} />
            {/* Bottom-left dock: leaves the right-hand tool rail uncovered
                (its measured width, at least 7 rem; 7 rem before it is measured). */}
            <div
              data-testid="map-bottom-dock"
              style={
                dockReserve === null
                  ? undefined
                  : ({ '--dock-reserve': `${dockReserve}px` } as CSSProperties)
              }
              className="pointer-events-none absolute bottom-2 left-2 z-20 flex max-h-[75%] w-[calc(100%-0.5rem-var(--dock-reserve))] max-w-md flex-col items-start gap-2 [--dock-reserve:7rem]"
            >
              <ResumeFollowButton />
              <BloodPanel
                gpsReading={gpsReading}
                onCenter={centerOnPosition}
                onOverview={showOverview}
              />
              <GuidancePanel gpsReading={gpsReading} getMapInstance={getMapInstance} />
              {!fieldModeEnabled && (
                <MeasurePanel
                  queryElevation={(coordinate) =>
                    instanceRef.current?.queryElevation(coordinate) ?? null
                  }
                />
              )}
            </div>
            <WaypointEditPanel gpsReading={gpsReading} />
            <SharedPointCard onCenter={centerOnSharedPoint} />
            <TrackRecorderControl />
            <BloodStartControl gpsReading={gpsReading} />
            <BloodCameraHost gpsReading={gpsReading} />
            <TraceFilterControl />
            {!fieldModeEnabled && (
              <>
                <OfflineAreaControl
                  getMapInstance={() => instanceRef.current}
                  baseLayer={baseLayer}
                  currentZoom={view.zoom}
                />
                <TerrainInfoControl />
                <ElevationProfileControl
                  queryElevation={(coordinate) =>
                    instanceRef.current?.queryElevation(coordinate) ?? null
                  }
                />
                <MeasureTools />
                <WeatherMapControl
                  getBounds={() => instanceRef.current?.getBounds() ?? null}
                  isFrameReady={(key) =>
                    instanceRef.current?.isWeatherFrameReady(key) ?? false
                  }
                  viewCenter={view.center}
                />
                <ForestLayersControl
                  currentZoom={view.zoom}
                  onRetry={(id) =>
                    instanceRef.current?.retryRasterOverlay?.(`forest-${id}`)
                  }
                />
                <TerritoryMapControl />
                <AnalysisControl />
                <HeatmapControl
                  getBounds={() => instanceRef.current?.getBounds() ?? null}
                  queryElevation={(coordinate) =>
                    instanceRef.current?.queryElevation(coordinate) ?? null
                  }
                  viewCenter={view.center}
                />
              </>
            )}
          </MapToolsProvider>
        </div>
      ) : (
        <EmptyState
          icon={<MapPinOff size={28} aria-hidden="true" />}
          title="Carte indisponible"
          description="Aucune clé d'API cartographique n'est configurée (VITE_MAP_TILES_API_KEY ou VITE_ESRI_API_KEY). Voir .env.example."
        />
      )}
    </div>
  )
}

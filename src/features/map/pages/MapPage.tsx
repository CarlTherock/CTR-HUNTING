import { useEffect, useRef } from 'react'
import { MapPinOff } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { availableBaseLayers, mapProvider } from '@/services/map'
import type { MapInstance } from '@/services/map'
import { Badge, EmptyState, PageHeader } from '@/components/ui'
import { AnalysisControl } from '@/features/analytics/components/AnalysisControl'
import { useAnalysisStore } from '@/features/analytics/state/analysisStore'
import { LayerManagerPanel } from '@/features/layers/components/LayerManagerPanel'
import { useLayersStore } from '@/features/layers/state/layersStore'
import { GpsControl } from '@/features/gps/components/GpsControl'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { OfflineAreaControl } from '@/features/offline/components/OfflineAreaControl'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { WindLayerControl } from '@/features/wind/components/WindLayerControl'
import { useWindStore } from '@/features/wind/state/windStore'
import { useOnlineStatus } from '@/offline/useOnlineStatus'
import { TrackRecorderControl } from '@/features/waypoints/components/TrackRecorderControl'
import { WaypointControl } from '@/features/waypoints/components/WaypointControl'
import { WaypointEditPanel } from '@/features/waypoints/components/WaypointEditPanel'
import { useTracksStore } from '@/features/waypoints/state/tracksStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useMapStore } from '../state/mapStore'
import { useTerrainToolsStore } from '../state/terrainToolsStore'
import { sampleSlopeAspect } from '../terrainQuery'
import { ElevationProfileControl } from '../components/ElevationProfileControl'
import { TerrainInfoControl } from '../components/TerrainInfoControl'
import { ViewModeToggle } from '../components/ViewModeToggle'

/** Field/street scale — close enough to make out individual trails and
 * terrain features after tapping "recenter on me", per user feedback
 * that the previous recenter (pan only, no zoom change) left the view
 * too far out to actually be useful. */
const GPS_LOCATE_ZOOM = 16

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
  const gpsReading = useGeolocation()
  const isOnline = useOnlineStatus()
  const waypoints = useWaypointsStore((state) => state.waypoints)
  const trackStatus = useTracksStore((state) => state.status)
  const trackPoints = useTracksStore((state) => state.points)
  const profilePoints = useTerrainToolsStore((state) => state.profilePoints)
  const windEnabled = useWindStore((state) => state.enabled)
  const windField = useWindStore((state) => state.field)
  const windHourOffset = useWindStore((state) => state.selectedHourOffset)
  const windActiveLayer = useWindStore((state) => state.activeLayer)

  useEffect(() => {
    if (!mapProvider || !containerRef.current) return

    // The stored baseLayer (default "outdoor") may belong to a vendor
    // with no key configured, e.g. only Esri is set up — fall back to
    // whatever's actually available rather than requesting a style with
    // an undefined API key.
    const storedBaseLayer = useLayersStore.getState().baseLayer
    const initialBaseLayer = availableBaseLayers.includes(storedBaseLayer)
      ? storedBaseLayer
      : (availableBaseLayers[0] ?? storedBaseLayer)
    if (initialBaseLayer !== storedBaseLayer) {
      useLayersStore.getState().setBaseLayer(initialBaseLayer)
    }

    const instance = mapProvider.createMap({
      container: containerRef.current,
      initialView: view,
      initialBaseLayer,
      initialOverlays: useLayersStore.getState().overlays,
      onViewChange: setView,
      onMapClick: (coordinate) => {
        if (useWaypointsStore.getState().isPlacing) {
          void useWaypointsStore.getState().placeWaypointAt(coordinate)
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
        } else if (useAnalysisStore.getState().mode === 'analyzing') {
          const map = instanceRef.current
          if (!map) return
          void useAnalysisStore.getState().analyze(coordinate, (c) => map.queryElevation(c))
        }
      },
      onWaypointClick: (id) => useWaypointsStore.getState().selectWaypoint(id),
      onWaypointDragEnd: (id, coordinate) => {
        void useWaypointsStore.getState().updateWaypoint(id, { coordinate })
      },
    })
    instanceRef.current = instance
    void useWaypointsStore.getState().load()
    void useTracksStore.getState().load()
    void useOfflineStore.getState().load()

    return () => {
      instanceRef.current = null
      instance.destroy()
    }
    // Mount once: the map manages its own camera after creation, and further
    // `view` writes come *from* this effect (via setView), not into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // Skip the run that fires on mount with the same value the map was
    // already created with — only react to an actual layer change.
    if (appliedBaseLayerRef.current === baseLayer) return
    appliedBaseLayerRef.current = baseLayer
    instanceRef.current?.setBaseLayer(baseLayer)
  }, [baseLayer])

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

  useEffect(() => {
    instanceRef.current?.setWaypoints(waypoints)
  }, [waypoints])

  useEffect(() => {
    instanceRef.current?.setTrackPreview(trackStatus === 'idle' ? null : trackPoints)
  }, [trackPoints, trackStatus])

  useEffect(() => {
    // Shows each tapped point immediately (a dot) and, once there are 2+,
    // the connecting line — kept visible after "Done" too (until the
    // profile panel is closed/discarded, which clears `profilePoints`),
    // so the chart's numbers stay visually tied to the path they describe.
    instanceRef.current?.setMeasurePath(profilePoints.length > 0 ? profilePoints : null)
  }, [profilePoints])

  useEffect(() => {
    instanceRef.current?.setWindField(windEnabled ? windField : null, windHourOffset, windActiveLayer)
  }, [windEnabled, windField, windHourOffset, windActiveLayer])

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
      instanceRef.current?.setTerrainEnabled(true, useMapStore.getState().terrainExaggeration)
    }
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <PageHeader
        title="Map"
        actions={
          <>
            {!isOnline && (
              <Badge variant="warning">Offline — showing cached maps</Badge>
            )}
            <Badge variant={gpsReading.status === 'available' ? 'success' : 'warning'}>
              {gpsReading.status === 'available'
                ? `GPS ±${Math.round(gpsReading.value.accuracyMeters ?? 0)} m`
                : 'GPS unavailable'}
            </Badge>
          </>
        }
      />
      {mapProvider ? (
        <div className="relative min-h-[60vh] flex-1">
          <div
            ref={containerRef}
            className="rounded-card border-surface-600 h-full overflow-hidden border"
            data-testid="map-container"
          />
          <LayerManagerPanel />
          <ViewModeToggle
            pitch={view.pitch}
            onChange={setViewMode}
            terrainExaggeration={terrainExaggeration}
            onTerrainExaggerationChange={changeTerrainExaggeration}
          />
          <GpsControl reading={gpsReading} onLocate={locate} />
          <WaypointControl />
          <WaypointEditPanel />
          <TrackRecorderControl />
          <OfflineAreaControl
            getMapInstance={() => instanceRef.current}
            baseLayer={baseLayer}
            currentZoom={view.zoom}
          />
          <TerrainInfoControl />
          <ElevationProfileControl
            queryElevation={(coordinate) => instanceRef.current?.queryElevation(coordinate) ?? null}
          />
          <WindLayerControl
            getBounds={() => instanceRef.current?.getBounds() ?? null}
            referenceCoordinate={view.center}
          />
          <AnalysisControl />
        </div>
      ) : (
        <EmptyState
          icon={<MapPinOff size={28} aria-hidden="true" />}
          title="Map unavailable"
          description="No map API key is configured (VITE_MAP_TILES_API_KEY or VITE_ESRI_API_KEY). Set one in .env — see .env.example."
        />
      )}
    </div>
  )
}

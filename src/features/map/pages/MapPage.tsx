import { useEffect, useRef } from 'react'
import { MapPinOff } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { availableBaseLayers, mapProvider } from '@/services/map'
import type { MapInstance } from '@/services/map'
import { Badge, EmptyState, PageHeader } from '@/components/ui'
import { LayerManagerPanel } from '@/features/layers/components/LayerManagerPanel'
import { useLayersStore } from '@/features/layers/state/layersStore'
import { GpsControl } from '@/features/gps/components/GpsControl'
import { useGeolocation } from '@/features/gps/useGeolocation'
import { useMapStore } from '../state/mapStore'
import { ViewModeToggle } from '../components/ViewModeToggle'

export function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<MapInstance | null>(null)
  const view = useMapStore((state) => state.view)
  const setView = useMapStore((state) => state.setView)
  const baseLayer = useLayersStore((state) => state.baseLayer)
  const appliedBaseLayerRef = useRef(baseLayer)
  const overlays = useLayersStore((state) => state.overlays)
  const appliedOverlaysRef = useRef(overlays)
  const gpsReading = useGeolocation()

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
    })
    instanceRef.current = instance

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
  }, [gpsReading])

  function locate() {
    if (gpsReading.status !== 'available') return
    const coordinate = gpsReading.value
    setView({ center: { lat: coordinate.lat, lng: coordinate.lng } })
    instanceRef.current?.setView({ center: { lat: coordinate.lat, lng: coordinate.lng } })
  }

  function setViewMode(pitch: number, bearing: number) {
    setView({ pitch, bearing })
    instanceRef.current?.setView({ pitch, bearing })
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="Map"
        description="Interactive terrain map — MapTiler and Esri base layers, switchable below."
        actions={
          <Badge variant={gpsReading.status === 'available' ? 'success' : 'warning'}>
            {gpsReading.status === 'available'
              ? `GPS ±${Math.round(gpsReading.value.accuracyMeters ?? 0)} m`
              : 'GPS unavailable'}
          </Badge>
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
          <ViewModeToggle pitch={view.pitch} onChange={setViewMode} />
          <GpsControl reading={gpsReading} onLocate={locate} />
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

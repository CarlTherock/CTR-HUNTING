import { useEffect, useRef } from 'react'
import { MapPinOff } from 'lucide-react'
import 'maplibre-gl/dist/maplibre-gl.css'
import { mapProvider } from '@/services/map'
import { EmptyState, PageHeader } from '@/components/ui'
import { useMapStore } from '../state/mapStore'

export function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const view = useMapStore((state) => state.view)
  const setView = useMapStore((state) => state.setView)

  useEffect(() => {
    if (!mapProvider || !containerRef.current) return

    const instance = mapProvider.createMap({
      container: containerRef.current,
      initialView: view,
      onViewChange: setView,
    })

    return () => instance.destroy()
    // Mount once: the map manages its own camera after creation, and further
    // `view` writes come *from* this effect (via setView), not into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex h-full flex-col gap-6">
      <PageHeader
        title="Map"
        description="Interactive terrain map — MapTiler Outdoor (satellite, topo, contours)."
      />
      {mapProvider ? (
        <div
          ref={containerRef}
          className="rounded-card border-surface-600 min-h-[60vh] flex-1 overflow-hidden border"
          data-testid="map-container"
        />
      ) : (
        <EmptyState
          icon={<MapPinOff size={28} aria-hidden="true" />}
          title="Map unavailable"
          description="No VITE_MAP_TILES_API_KEY is configured. Set it in .env to load the map — see .env.example."
        />
      )}
    </div>
  )
}

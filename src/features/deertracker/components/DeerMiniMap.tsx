import { useEffect, useMemo, useRef, useState } from 'react'
import { availableBaseLayers, mapProvider } from '@/services/map'
import type { MapInstance } from '@/services/map'
import { overviewView } from '@/features/blood/sessionLogic'
import { resolveInitialBaseLayer } from '@/features/layers/startupBaseLayer'
import { useLayersStore } from '@/features/layers/state/layersStore'
import type { Observation } from '@/types'
import { toDisplayMarkers } from '../deerMarkers'

/** Small map of the entries shown by the filters. One instance, markers
 * updated in place; with no provider configured it says so and the list stays
 * the way to read the entries. */
export function DeerMiniMap({
  entries,
  onSelect,
}: {
  entries: readonly Observation[]
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceRef = useRef<MapInstance | null>(null)
  const onSelectRef = useRef(onSelect)
  const [ready, setReady] = useState(false)
  const markers = useMemo(() => toDisplayMarkers(entries), [entries])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  useEffect(() => {
    if (!mapProvider || !containerRef.current) return
    const layers = useLayersStore.getState()
    const base = resolveInitialBaseLayer(
      availableBaseLayers,
      layers.baseLayer,
      layers.baseLayerChosenByUser,
    )
    const instance = mapProvider.createMap({
      container: containerRef.current,
      initialView: { center: { lat: 46.8, lng: -71.2 }, zoom: 9, pitch: 0, bearing: 0 },
      initialBaseLayer: base,
      initialOverlays: { trails: false, hydrography: false, contours: false },
      onWaypointClick: (id) => onSelectRef.current(id),
    })
    instanceRef.current = instance
    setReady(true)
    return () => {
      instanceRef.current = null
      setReady(false)
      instance.destroy()
    }
  }, [])

  useEffect(() => {
    const instance = instanceRef.current
    if (!instance || !ready) return
    instance.setWaypoints(markers)
    const fit = overviewView(markers.map((m) => m.coordinate))
    if (fit) instance.setView(fit)
  }, [markers, ready])

  if (!mapProvider) {
    return (
      <p className="border-surface-700 bg-surface-900 text-ink-300 rounded-lg border p-3 text-sm">
        Carte indisponible : aucun fournisseur de carte n’est configuré. La liste reste
        complète.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <div
        ref={containerRef}
        role="region"
        aria-label="Carte des observations"
        className="border-surface-700 h-72 w-full overflow-hidden rounded-lg border"
      />
      <p className="text-ink-500 text-xs">
        Chaque repère est une de vos observations, à l’endroit où vous l’avez saisie. Ce
        n’est pas la position de l’animal ni un trajet.
      </p>
    </div>
  )
}

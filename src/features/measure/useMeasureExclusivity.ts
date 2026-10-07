import { useEffect } from 'react'
import { useAnalysisStore } from '@/features/analytics/state/analysisStore'
import { useTerrainToolsStore } from '@/features/map/state/terrainToolsStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useMeasureStore } from './state/measureStore'

/**
 * One tap-driven map mode at a time. The measure tool yields (pauses, keeping
 * its drawing) as soon as waypoint placement, an open waypoint draft, the
 * altitude query, the elevation profile or the spot analysis takes over — so
 * a tap can never be both "add a measure point" and "place a waypoint". It is
 * closed outright when Field Mode hides the tool.
 */
export function useMeasureExclusivity(fieldModeEnabled: boolean) {
  const active = useMeasureStore((state) => state.active)
  const isPlacing = useWaypointsStore((state) => state.isPlacing)
  const hasDraft = useWaypointsStore((state) => state.draft !== null)
  const terrainMode = useTerrainToolsStore((state) => state.mode)
  const analysisMode = useAnalysisStore((state) => state.mode)

  const conflict =
    isPlacing || hasDraft || terrainMode !== 'idle' || analysisMode !== 'idle'

  useEffect(() => {
    if (active && conflict) useMeasureStore.getState().pause()
  }, [active, conflict])

  useEffect(() => {
    if (fieldModeEnabled) useMeasureStore.getState().close()
  }, [fieldModeEnabled])
}

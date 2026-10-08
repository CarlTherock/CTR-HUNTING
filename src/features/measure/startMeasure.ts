import { useAnalysisStore } from '@/features/analytics/state/analysisStore'
import { useTerrainToolsStore } from '@/features/map/state/terrainToolsStore'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { useMeasureStore, type MeasureKind } from './state/measureStore'

/** Arms a measurement. Only one map mode at a time: the other tap-driven
 * tools (waypoint placement, altitude query, elevation profile, spot
 * analysis) are cancelled first. An open waypoint draft is left alone — it is
 * the user's unsaved work — and instead keeps the measure paused
 * (`useMeasureExclusivity`). */
export function startMeasure(kind: MeasureKind) {
  const waypoints = useWaypointsStore.getState()
  if (waypoints.isPlacing) waypoints.cancelPlacing()
  const terrain = useTerrainToolsStore.getState()
  if (terrain.mode !== 'idle') terrain.cancel()
  const analysis = useAnalysisStore.getState()
  if (analysis.mode !== 'idle') analysis.cancel()
  useMeasureStore.getState().start(kind)
}

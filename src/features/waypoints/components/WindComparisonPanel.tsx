import { Wind } from 'lucide-react'
import { Card } from '@/components/ui'
import { useWindStore } from '@/features/wind/state/windStore'
import { cn } from '@/utils/cn'
import { compassLabel } from '@/utils/terrain'
import { isOptimalWind } from '@/utils/windField'
import { useWaypointsStore } from '../state/waypointsStore'

/**
 * Side-by-side wind check across every waypoint with a saved "optimal
 * wind" preference — modeled on onX Hunt's own "Wind Comparisons Tool"
 * (verified via research: "compare wind forecasts at multiple different
 * Waypoints in a central location with a quick side-by-side view to
 * easily review all your options at a glance",
 * onxmaps.com/hunt/tutorials/optimal-wind). Reuses whatever field
 * `windStore` already has loaded (fetched from the Map page's layer
 * toggle) — no separate fetch here, since it's the same shared grid.
 */
export function WindComparisonPanel() {
  const waypoints = useWaypointsStore((state) => state.waypoints)
  const field = useWindStore((state) => state.field)
  const selectedHourOffset = useWindStore((state) => state.selectedHourOffset)
  const windAt = useWindStore((state) => state.windAt)

  const candidates = waypoints.filter((w) => (w.optimalWindDirections?.length ?? 0) > 0)
  if (candidates.length === 0) return null

  return (
    <div>
      <h2 className="text-ink-300 mb-3 flex items-center gap-2 text-sm font-semibold">
        <Wind size={16} aria-hidden="true" />
        Wind check
        {field && (
          <span className="text-ink-500 text-xs font-normal">
            ({selectedHourOffset === 0 ? 'now' : `+${selectedHourOffset}h`})
          </span>
        )}
      </h2>

      {!field ? (
        <Card className="p-3">
          <p className="text-ink-500 text-xs">
            Turn on the wind layer from the Map page to compare live wind against these
            waypoints&apos; saved optimal directions.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {candidates.map((waypoint) => {
            const reading = windAt(waypoint.coordinate)
            const matches = reading ? isOptimalWind(reading.directionDegrees, waypoint.optimalWindDirections) : null
            return (
              <Card key={waypoint.id} className="flex flex-col gap-1 p-3">
                <span className="text-ink-100 truncate text-xs font-medium">{waypoint.name}</span>
                {reading ? (
                  <>
                    <span
                      className={cn(
                        'flex items-center gap-1 text-sm font-semibold',
                        matches ? 'text-status-success' : 'text-status-danger',
                      )}
                    >
                      <Wind
                        size={13}
                        style={{ transform: `rotate(${reading.directionDegrees}deg)` }}
                        aria-hidden="true"
                      />
                      {compassLabel(reading.directionDegrees)}
                    </span>
                    <span className="text-ink-500 text-[10px]">
                      {Math.round(reading.speedKmh)} km/h ·{' '}
                      {matches ? 'matches optimal' : 'not optimal'}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-500 text-xs">No data</span>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

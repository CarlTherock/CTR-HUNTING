import { Mountain, X } from 'lucide-react'
import { compassLabel } from '@/utils/terrain'
import { useTerrainToolsStore } from '../state/terrainToolsStore'

function formatElevation(meters: number | null): string {
  return meters === null ? 'unavailable' : `${Math.round(meters)} m`
}

/** Floating "tap for elevation/slope/aspect at this point" tool (Phase 4).
 * One tap, one answer — same arm-then-tap-the-map pattern as placing a
 * waypoint (`WaypointControl`), not a persistent mode. The actual
 * `queryElevation` calls happen in `MapPage` (only it holds a live
 * `MapInstance`); this component just renders whatever
 * `terrainToolsStore.queryResult` ends up with. */
export function TerrainInfoControl() {
  const mode = useTerrainToolsStore((state) => state.mode)
  const queryResult = useTerrainToolsStore((state) => state.queryResult)
  const startQuerying = useTerrainToolsStore((state) => state.startQuerying)
  const cancel = useTerrainToolsStore((state) => state.cancel)
  const closeQuery = useTerrainToolsStore((state) => state.closeQuery)

  if (mode === 'querying') {
    return (
      <div className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg">
        Tap the map for elevation, slope, aspect
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel terrain info"
          className="text-ink-500 hover:text-ink-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={startQuerying}
        title="Get elevation, slope and aspect at a point"
        aria-label="Get elevation, slope and aspect at a point"
        className="border-surface-600 bg-surface-900/90 text-brand-400 hover:bg-surface-800 absolute top-[25rem] right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors"
      >
        <Mountain size={18} aria-hidden="true" />
      </button>

      {queryResult && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="border-surface-600 bg-surface-900 w-full max-w-sm rounded-lg border p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Terrain info</h2>
              <button
                type="button"
                onClick={closeQuery}
                aria-label="Close"
                className="text-ink-500 hover:text-ink-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <p className="text-ink-300 text-sm">
              Elevation:{' '}
              <span className="text-ink-100 font-medium">
                {formatElevation(queryResult.elevationMeters)}
              </span>
            </p>
            <p className="text-ink-300 text-sm">
              {queryResult.slopeAspect ? (
                <>
                  Slope:{' '}
                  <span className="text-ink-100 font-medium">
                    {Math.round(queryResult.slopeAspect.slopeDegrees)}°
                  </span>{' '}
                  · Faces:{' '}
                  <span className="text-ink-100 font-medium">
                    {compassLabel(queryResult.slopeAspect.aspectDegrees)}
                  </span>
                </>
              ) : (
                'Slope/aspect unavailable at this point'
              )}
            </p>
            <p className="text-ink-500 mt-2 text-xs">
              Estimated from downloaded terrain data — a rough field reading, not a
              survey-grade measurement.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

import { Activity, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { formatDistanceMeters } from '@/utils/format'
import { sampleElevationProfile } from '../terrainQuery'
import { useTerrainToolsStore } from '../state/terrainToolsStore'
import type { Coordinate } from '@/types'
import type { ElevationProfilePoint } from '../terrainQuery'

const CHART_WIDTH = 300
const CHART_HEIGHT = 90

function buildChartPath(points: ElevationProfilePoint[]): {
  path: string
  min: number
  max: number
} | null {
  const valid = points.filter((p): p is { distanceMeters: number; elevationMeters: number } => p.elevationMeters !== null)
  if (valid.length < 2) return null

  const totalDistance = points.at(-1)?.distanceMeters || 1
  const min = Math.min(...valid.map((p) => p.elevationMeters))
  const max = Math.max(...valid.map((p) => p.elevationMeters))
  const range = max - min || 1

  const path = valid
    .map((p, i) => {
      const x = (p.distanceMeters / totalDistance) * CHART_WIDTH
      const y = CHART_HEIGHT - ((p.elevationMeters - min) / range) * CHART_HEIGHT
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return { path, min, max }
}

/** Elevation gain/loss summed from consecutive valid samples — real
 * differences between real queried points, not a formula guess. */
function gainLoss(points: ElevationProfilePoint[]): { gain: number; loss: number } {
  let gain = 0
  let loss = 0
  let previous: number | null = null
  for (const point of points) {
    if (point.elevationMeters === null) continue
    if (previous !== null) {
      const diff = point.elevationMeters - previous
      if (diff > 0) gain += diff
      else loss += -diff
    }
    previous = point.elevationMeters
  }
  return { gain, loss }
}

export interface ElevationProfileControlProps {
  queryElevation: (coordinate: Coordinate) => number | null
}

/** Floating "draw a line, see its elevation profile" tool (Phase 4). Taps
 * add points (like a simplified track); "Done" samples elevation along
 * the whole path (`terrainQuery.sampleElevationProfile`) and shows a
 * hand-rolled inline SVG chart — no charting library added just for
 * this; a real dependency choice belongs to Phase 10 (Advanced Charts),
 * not this slice. */
export function ElevationProfileControl({ queryElevation }: ElevationProfileControlProps) {
  const mode = useTerrainToolsStore((state) => state.mode)
  const profilePoints = useTerrainToolsStore((state) => state.profilePoints)
  const profileData = useTerrainToolsStore((state) => state.profileData)
  const startProfiling = useTerrainToolsStore((state) => state.startProfiling)
  const cancel = useTerrainToolsStore((state) => state.cancel)
  const removeLastProfilePoint = useTerrainToolsStore((state) => state.removeLastProfilePoint)
  const finishProfile = useTerrainToolsStore((state) => state.finishProfile)
  const closeProfile = useTerrainToolsStore((state) => state.closeProfile)

  if (mode === 'profiling') {
    return (
      <div className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg">
        Tap points along a path ({profilePoints.length})
        <button
          type="button"
          onClick={removeLastProfilePoint}
          disabled={profilePoints.length === 0}
          aria-label="Undo last point"
          className="text-ink-500 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Undo2 size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={profilePoints.length < 2}
          onClick={() => finishProfile(sampleElevationProfile(queryElevation, profilePoints))}
          className="text-brand-400 disabled:text-ink-700 text-xs font-medium disabled:cursor-not-allowed"
        >
          Done
        </button>
        <button
          type="button"
          onClick={cancel}
          aria-label="Cancel elevation profile"
          className="text-ink-500 hover:text-ink-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  const chart = profileData ? buildChartPath(profileData) : null

  return (
    <>
      <button
        type="button"
        onClick={startProfiling}
        title="Draw a path to see its elevation profile"
        aria-label="Draw a path to see its elevation profile"
        className="border-surface-600 bg-surface-900/90 text-brand-400 hover:bg-surface-800 absolute top-[29rem] right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors"
      >
        <Activity size={18} aria-hidden="true" />
      </button>

      {profileData && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="border-surface-600 bg-surface-900 w-full max-w-sm rounded-lg border p-4 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Elevation profile</h2>
              <button
                type="button"
                onClick={closeProfile}
                aria-label="Close"
                className="text-ink-500 hover:text-ink-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {chart ? (
              <>
                <svg
                  viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
                  className="text-brand-400 w-full"
                  role="img"
                  aria-label="Elevation profile chart"
                >
                  <path d={chart.path} fill="none" stroke="currentColor" strokeWidth={2} />
                </svg>
                <div className="text-ink-300 mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span>
                    Distance:{' '}
                    <span className="text-ink-100 font-medium">
                      {formatDistanceMeters(profileData.at(-1)?.distanceMeters ?? 0)}
                    </span>
                  </span>
                  <span>
                    Range:{' '}
                    <span className="text-ink-100 font-medium">
                      {Math.round(chart.min)}–{Math.round(chart.max)} m
                    </span>
                  </span>
                  {(() => {
                    const { gain, loss } = gainLoss(profileData)
                    return (
                      <>
                        <span>
                          Gain: <span className="text-ink-100 font-medium">{Math.round(gain)} m</span>
                        </span>
                        <span>
                          Loss: <span className="text-ink-100 font-medium">{Math.round(loss)} m</span>
                        </span>
                      </>
                    )
                  })()}
                </div>
              </>
            ) : (
              <p className="text-ink-500 text-sm">
                Elevation data unavailable along this path — try an area with terrain already
                downloaded or visited while online.
              </p>
            )}

            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={closeProfile}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

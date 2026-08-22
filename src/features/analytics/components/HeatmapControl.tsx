import { LayoutGrid, X } from 'lucide-react'
import { analysisHeatmapColor } from '@/utils/analysisHeatmapColors'
import { cn } from '@/utils/cn'
import { useHeatmapStore } from '../state/heatmapStore'
import type { HeatmapView } from '../state/heatmapStore'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export interface HeatmapControlProps {
  getBounds: () => LngLatBounds | null
  queryElevation: (coordinate: Coordinate) => number | null
}

const VIEW_OPTIONS: { value: HeatmapView; label: string }[] = [
  { value: 'combined', label: 'Combined (all 6)' },
  { value: 'terrain', label: 'Terrain' },
  { value: 'vegetation', label: 'Vegetation' },
  { value: 'weather', label: 'Weather' },
  { value: 'wind', label: 'Wind' },
  { value: 'time', label: 'Time' },
  { value: 'history', label: 'History' },
]

/** A 5-stop preview of `analysisHeatmapColor`'s red→green scale, for a
 * legend bar — not a separate hand-picked palette. */
function legendGradient(): string {
  const stops = [0, 25, 50, 75, 100].map(
    (v, i) => `${analysisHeatmapColor(v, 1)} ${(i / 4) * 100}%`,
  )
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/**
 * Phase 9 — Analysis Map. Toggles a color-graded heatmap across the
 * visible map area, one real `AnalysisHeatmapCell` per grid point (same
 * 6 analyzers as the Map page's "Analyze this spot" tool, Phase 8) —
 * red/unfavorable through green/favorable, explicitly labeled a
 * probabilistic read, not a certainty.
 */
export function HeatmapControl({ getBounds, queryElevation }: HeatmapControlProps) {
  const enabled = useHeatmapStore((state) => state.enabled)
  const status = useHeatmapStore((state) => state.status)
  const errorReason = useHeatmapStore((state) => state.errorReason)
  const selectedView = useHeatmapStore((state) => state.selectedView)
  const setSelectedView = useHeatmapStore((state) => state.setSelectedView)
  const toggle = useHeatmapStore((state) => state.toggle)
  const compute = useHeatmapStore((state) => state.compute)

  function handleToggle() {
    const bounds = getBounds()
    if (bounds) toggle(bounds, queryElevation)
  }

  function refresh() {
    const bounds = getBounds()
    if (bounds) void compute(bounds, queryElevation)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        aria-pressed={enabled}
        title="Analysis heatmap"
        aria-label="Toggle analysis heatmap"
        className={cn(
          'border-surface-600 bg-surface-900/90 hover:bg-surface-800 absolute top-[44rem] right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors',
          enabled ? 'bg-brand-500/15 text-brand-400' : 'text-ink-300',
        )}
      >
        <LayoutGrid size={18} aria-hidden="true" />
      </button>

      {enabled && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="border-surface-600 bg-surface-900/95 w-full max-w-sm rounded-lg border p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Analysis heatmap</h2>
              <button
                type="button"
                onClick={handleToggle}
                aria-label="Hide analysis heatmap"
                className="text-ink-500 hover:text-ink-100"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {status === 'loading' && <p className="text-ink-500 text-sm">Analyzing this area…</p>}
            {status === 'error' && (
              <p className="text-status-danger text-sm">
                Heatmap unavailable — {errorReason}.{' '}
                <button type="button" onClick={refresh} className="underline">
                  Retry
                </button>
              </p>
            )}
            {status === 'ready' && (
              <>
                <label className="mb-2 flex flex-col gap-1">
                  <span className="text-ink-500 text-xs font-medium">Score shown</span>
                  <select
                    value={selectedView}
                    onChange={(e) => setSelectedView(e.target.value as HeatmapView)}
                    aria-label="Score shown"
                    className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:outline-2"
                  >
                    {VIEW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="h-2 w-full rounded-full" style={{ background: legendGradient() }} aria-hidden="true" />
                <div className="text-ink-500 mt-0.5 flex justify-between text-[10px]">
                  <span>Unfavorable</span>
                  <span>Neutral</span>
                  <span>Favorable</span>
                </div>
                <p className="text-ink-500 mt-2 text-xs">
                  A probabilistic read from the same 6 analyzers as "Analyze this spot," not a
                  guarantee.
                </p>
                <button
                  type="button"
                  onClick={refresh}
                  className="text-ink-500 hover:text-ink-100 mt-2 text-xs underline"
                >
                  Refresh for this area
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

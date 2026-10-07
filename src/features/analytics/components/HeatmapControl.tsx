import { LayoutGrid, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { analysisHeatmapColor } from '@/utils/analysisHeatmapColors'
import { useHeatmapStore } from '../state/heatmapStore'
import type { HeatmapView } from '../state/heatmapStore'
import type { Coordinate } from '@/types'
import type { LngLatBounds } from '@/utils/tiles'

export interface HeatmapControlProps {
  getBounds: () => LngLatBounds | null
  queryElevation: (coordinate: Coordinate) => number | null
  /** Current map center — to detect that the user panned away from the
   * analyzed area and offer a recompute. */
  viewCenter?: Coordinate
}

const VIEW_OPTIONS: { value: HeatmapView; label: string }[] = [
  { value: 'combined', label: 'Combiné (les 6)' },
  { value: 'terrain', label: 'Terrain' },
  { value: 'vegetation', label: 'Végétation' },
  { value: 'weather', label: 'Météo' },
  { value: 'wind', label: 'Vent' },
  { value: 'time', label: 'Moment' },
  { value: 'history', label: 'Historique' },
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
export function HeatmapControl({
  getBounds,
  queryElevation,
  viewCenter,
}: HeatmapControlProps) {
  const enabled = useHeatmapStore((state) => state.enabled)
  const status = useHeatmapStore((state) => state.status)
  const errorReason = useHeatmapStore((state) => state.errorReason)
  const selectedView = useHeatmapStore((state) => state.selectedView)
  const setSelectedView = useHeatmapStore((state) => state.setSelectedView)
  const toggle = useHeatmapStore((state) => state.toggle)
  const compute = useHeatmapStore((state) => state.compute)
  const computedBounds = useHeatmapStore((state) => state.computedBounds)
  const unavailableSources = useHeatmapStore((state) => state.unavailableSources)
  const areaChanged =
    status === 'ready' &&
    !!computedBounds &&
    !!viewCenter &&
    (viewCenter.lat > computedBounds.north ||
      viewCenter.lat < computedBounds.south ||
      viewCenter.lng > computedBounds.east ||
      viewCenter.lng < computedBounds.west)

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
      <ToolTrigger
        label="Carte de potentiel"
        icon={<LayoutGrid size={18} aria-hidden="true" />}
        onClick={handleToggle}
        pressed={enabled}
        active={enabled}
        order={41}
      />

      {enabled && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="border-surface-600 bg-surface-900/95 w-full max-w-sm rounded-lg border p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Carte de potentiel</h2>
              <button
                type="button"
                onClick={handleToggle}
                aria-label="Masquer la carte de potentiel"
                className="text-ink-500 hover:text-ink-100 flex items-center justify-center pointer-coarse:size-11"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {status === 'loading' && (
              <p className="text-ink-500 text-sm">Analyse de la zone…</p>
            )}
            {status === 'error' && (
              <p className="text-status-danger text-sm">
                Carte indisponible — {errorReason}.{' '}
                <button
                  type="button"
                  onClick={refresh}
                  className="underline pointer-coarse:min-h-11"
                >
                  Réessayer
                </button>
              </p>
            )}
            {status === 'ready' && (
              <>
                <label className="mb-2 flex flex-col gap-1">
                  <span className="text-ink-500 text-xs font-medium">Score affiché</span>
                  <select
                    value={selectedView}
                    onChange={(e) => setSelectedView(e.target.value as HeatmapView)}
                    aria-label="Score affiché"
                    className="border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 rounded-md border px-2 py-1.5 text-sm outline-none focus-visible:outline-2 pointer-coarse:min-h-11"
                  >
                    {VIEW_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                {areaChanged && (
                  <div className="bg-status-warning/15 text-status-warning mb-2 flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs">
                    <span>La carte a bougé hors de la zone analysée.</span>
                    <button
                      type="button"
                      onClick={refresh}
                      className="font-semibold underline pointer-coarse:min-h-11"
                    >
                      Recalculer
                    </button>
                  </div>
                )}
                {unavailableSources.length > 0 && (
                  <p className="text-ink-500 mb-2 text-xs">
                    Indisponible pour l'instant : {unavailableSources.join(', ')} — ces
                    analyseurs sont exclus du score.
                  </p>
                )}
                <div
                  className="h-2 w-full rounded-full"
                  style={{ background: legendGradient() }}
                  aria-hidden="true"
                />
                <div className="text-ink-500 mt-0.5 flex justify-between text-[10px]">
                  <span>Défavorable</span>
                  <span>Neutre</span>
                  <span>Favorable</span>
                </div>
                <p className="text-ink-500 mt-2 text-xs">
                  Lecture probabiliste des 6 mêmes analyseurs que « Analyser ce point »,
                  pas une garantie.
                </p>
                <button
                  type="button"
                  onClick={refresh}
                  className="text-ink-500 hover:text-ink-100 mt-2 text-xs underline pointer-coarse:min-h-11"
                >
                  Recalculer pour la zone visible
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

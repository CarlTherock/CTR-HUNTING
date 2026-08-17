import { Box, Minus, Plus, Square } from 'lucide-react'
import { cn } from '@/utils/cn'

/** Camera preset for the "3D" mode — tilts/rotates the flat map, and (as
 * of Phase 4) also drapes real elevation relief under it via
 * `MapInstance.setTerrainEnabled()`, wired in `MapPage.setViewMode`. */
export const THREE_D_PITCH = 60
export const THREE_D_BEARING = -20

const MAX_EXAGGERATION = 10

export interface ViewModeToggleProps {
  /** Current camera pitch — the toggle derives its active state from this
   * rather than owning separate "mode" state, so it can never drift out
   * of sync with a pitch the user set some other way (e.g. drag-rotate). */
  pitch: number
  onChange: (pitch: number, bearing: number) => void
  /** Terrain relief exaggeration, 1 (true scale) to 10 — only shown/usable
   * in 3D mode, since it has no visible effect in 2D. */
  terrainExaggeration: number
  onTerrainExaggerationChange: (exaggeration: number) => void
}

export function ViewModeToggle({
  pitch,
  onChange,
  terrainExaggeration,
  onTerrainExaggerationChange,
}: ViewModeToggleProps) {
  const is3D = pitch > 0

  return (
    // A single row, not a stack: the exaggeration control sits *beside*
    // the 2D/3D toggle (only appearing in 3D), never below it — stacking
    // it below previously grew this control downward into
    // `WaypointControl`'s button at top-44, making it untappable.
    <div className="absolute top-32 right-3 z-10 flex items-center gap-1.5">
      {is3D && (
        <div
          role="group"
          aria-label="Terrain exaggeration"
          className="border-surface-600 bg-surface-900/90 flex items-center gap-1.5 rounded-lg border px-1.5 py-1 shadow-lg backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={() => onTerrainExaggerationChange(terrainExaggeration - 1)}
            disabled={terrainExaggeration <= 1}
            aria-label="Less terrain exaggeration"
            className="text-ink-300 hover:bg-surface-800 rounded-md p-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Minus size={12} aria-hidden="true" />
          </button>
          <span className="text-ink-100 w-6 text-center text-xs tabular-nums">
            {terrainExaggeration.toFixed(0)}×
          </span>
          <button
            type="button"
            onClick={() => onTerrainExaggerationChange(terrainExaggeration + 1)}
            disabled={terrainExaggeration >= MAX_EXAGGERATION}
            aria-label="More terrain exaggeration"
            className="text-ink-300 hover:bg-surface-800 rounded-md p-1 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={12} aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        role="group"
        aria-label="View mode"
        className="border-surface-600 bg-surface-900/90 flex overflow-hidden rounded-lg border shadow-lg backdrop-blur-sm"
      >
        <button
          type="button"
          aria-pressed={!is3D}
          title="2D"
          onClick={() => onChange(0, 0)}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium transition-colors',
            !is3D ? 'bg-brand-500/15 text-brand-400' : 'text-ink-300 hover:bg-surface-800',
          )}
        >
          <Square size={14} aria-hidden="true" />
          2D
        </button>
        <button
          type="button"
          aria-pressed={is3D}
          title="3D"
          onClick={() => onChange(THREE_D_PITCH, THREE_D_BEARING)}
          className={cn(
            'border-surface-600 flex items-center gap-1.5 border-l px-2.5 py-2 text-xs font-medium transition-colors',
            is3D ? 'bg-brand-500/15 text-brand-400' : 'text-ink-300 hover:bg-surface-800',
          )}
        >
          <Box size={14} aria-hidden="true" />
          3D
        </button>
      </div>
    </div>
  )
}

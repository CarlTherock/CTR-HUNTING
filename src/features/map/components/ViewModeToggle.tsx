import { Box, Square } from 'lucide-react'
import { cn } from '@/utils/cn'

/** Camera preset for the "3D" mode. Only tilts/rotates the flat map —
 * there is no elevation exaggeration yet (real terrain data + MapLibre's
 * `setTerrain` is Phase 4, "same layers/data as 2D" per the spec). This
 * is the scaffold that phase builds on, per the `MapViewState` comment
 * from slice 1.1: pitch/bearing were modeled in from the start so this
 * transition needs no shape change. */
export const THREE_D_PITCH = 60
export const THREE_D_BEARING = -20

export interface ViewModeToggleProps {
  /** Current camera pitch — the toggle derives its active state from this
   * rather than owning separate "mode" state, so it can never drift out
   * of sync with a pitch the user set some other way (e.g. drag-rotate). */
  pitch: number
  onChange: (pitch: number, bearing: number) => void
}

export function ViewModeToggle({ pitch, onChange }: ViewModeToggleProps) {
  const is3D = pitch > 0

  return (
    <div
      role="group"
      aria-label="View mode"
      className="border-surface-600 bg-surface-900/90 absolute top-32 right-3 z-10 flex overflow-hidden rounded-lg border shadow-lg backdrop-blur-sm"
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
  )
}

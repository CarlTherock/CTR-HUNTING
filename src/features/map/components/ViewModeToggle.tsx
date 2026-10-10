import { Minus, Plus } from 'lucide-react'
import { ToolSlot } from '@/components/map-tools'
import { cn } from '@/utils/cn'

/** Camera preset for the "3D" mode — tilts/rotates the flat map, and (as
 * of Phase 4) also drapes real elevation relief under it via
 * `MapInstance.setTerrainEnabled()`, wired in `MapPage.setViewMode`. 80°
 * (not MapLibre's old 60° default cap — see `MapLibreProvider.ts`'s
 * `maxPitch: 85`) reads as standing at eye level looking at the terrain
 * ahead, rather than a moderate bird's-eye tilt, per user feedback. The
 * user can still drag-tilt further, up to the 85° the map now allows. */
export const THREE_D_PITCH = 80
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

export const RELIEF_EXPLANATION =
  'Le relief exagère la hauteur du terrain en 3D (de 1× à 10×). Ce n’est pas un zoom : la carte ne se rapproche pas.'

const STEP_BUTTON =
  'text-ink-300 hover:bg-surface-800 flex h-11 w-11 items-center justify-center disabled:cursor-not-allowed disabled:opacity-40'

export function ViewModeToggle({
  pitch,
  onChange,
  terrainExaggeration,
  onTerrainExaggerationChange,
}: ViewModeToggleProps) {
  const is3D = pitch > 0

  return (
    // Always-visible controls on the right rail (replacing the zoom +/−):
    // a vertical 2D/3D switch, and — in 3D only — the relief stepper under it.
    <ToolSlot order={5} placement="rail" secondary>
      <div className="flex flex-col items-end gap-2">
        <div
          role="group"
          aria-label="Mode d'affichage"
          className="border-surface-600 bg-surface-900/90 flex flex-col overflow-hidden rounded-lg border shadow-lg backdrop-blur-sm [@media(max-height:480px)]:flex-row"
        >
          <button
            type="button"
            aria-pressed={!is3D}
            title="Carte à plat (2D)"
            onClick={() => onChange(0, 0)}
            className={cn(
              'flex h-11 w-11 items-center justify-center text-sm font-semibold transition-colors',
              !is3D
                ? 'bg-brand-500/15 text-brand-400'
                : 'text-ink-300 hover:bg-surface-800',
            )}
          >
            2D
          </button>
          <button
            type="button"
            aria-pressed={is3D}
            title="Carte inclinée avec relief (3D)"
            onClick={() => onChange(THREE_D_PITCH, THREE_D_BEARING)}
            className={cn(
              'border-surface-600 flex h-11 w-11 items-center justify-center border-t text-sm font-semibold transition-colors [@media(max-height:480px)]:border-t-0 [@media(max-height:480px)]:border-l',
              is3D
                ? 'bg-brand-500/15 text-brand-400'
                : 'text-ink-300 hover:bg-surface-800',
            )}
          >
            3D
          </button>
        </div>

        {is3D && (
          <div
            role="group"
            aria-label="Exagération du relief"
            title={RELIEF_EXPLANATION}
            className="border-surface-600 bg-surface-900/90 flex flex-col items-center overflow-hidden rounded-lg border shadow-lg backdrop-blur-sm [@media(max-height:480px)]:flex-row"
          >
            <span className="text-ink-500 pt-1 text-[10px] leading-none font-medium uppercase [@media(max-height:480px)]:pt-0 [@media(max-height:480px)]:pl-2">
              Relief
            </span>
            <button
              type="button"
              onClick={() => onTerrainExaggerationChange(terrainExaggeration + 1)}
              disabled={terrainExaggeration >= MAX_EXAGGERATION}
              aria-label="Augmenter l'exagération du relief"
              className={STEP_BUTTON}
            >
              <Plus size={16} aria-hidden="true" />
            </button>
            <span
              className="text-ink-100 text-xs tabular-nums"
              data-testid="relief-value"
            >
              {terrainExaggeration.toFixed(0)}×
            </span>
            <button
              type="button"
              onClick={() => onTerrainExaggerationChange(terrainExaggeration - 1)}
              disabled={terrainExaggeration <= 1}
              aria-label="Réduire l'exagération du relief"
              className={STEP_BUTTON}
            >
              <Minus size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </ToolSlot>
  )
}

import { Minus, Plus } from 'lucide-react'
import { ToolSlot } from '@/components/map-tools'
import { RELIEF_EXPLANATION } from './ViewModeToggle'

/** Zoom +/− moved off the map (the buttons used to sit permanently over it)
 * into the « Outils » sheet. Pinch / double-tap / keyboard +/− still work. */
export function ZoomTool({
  zoom,
  onZoom,
  min = 0,
  max = 22,
}: {
  zoom: number
  onZoom: (delta: number) => void
  min?: number
  max?: number
}) {
  return (
    <ToolSlot order={4}>
      <div
        role="group"
        aria-label="Zoom de la carte"
        className="border-surface-600 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
      >
        <div className="min-w-0">
          <p className="text-ink-100 text-sm font-medium">Zoom</p>
          <p className="text-ink-500 text-xs">
            Pincez la carte ou touchez deux fois. {RELIEF_EXPLANATION}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onZoom(-1)}
            disabled={zoom <= min}
            aria-label="Zoom arrière"
            className="border-surface-600 text-ink-100 hover:bg-surface-800 flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-40"
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onZoom(1)}
            disabled={zoom >= max}
            aria-label="Zoom avant"
            className="border-surface-600 text-ink-100 hover:bg-surface-800 flex h-11 w-11 items-center justify-center rounded-lg border disabled:opacity-40"
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </ToolSlot>
  )
}

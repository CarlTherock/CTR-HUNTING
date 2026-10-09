import { X } from 'lucide-react'
import { useWaypointsStore } from '../state/waypointsStore'

/** Banner shown while a waypoint is armed for placing: the next tap on the map
 * creates a real waypoint there (see `waypointsStore.placeWaypointAt`) and
 * opens it for editing. The permanent « + Repère » button that arms it lives in
 * `addpoint/AddPointControl`; this banner keeps the pending « tap the map »
 * state from ever being invisible. */
export function WaypointControl() {
  const isPlacing = useWaypointsStore((state) => state.isPlacing)
  const cancelPlacing = useWaypointsStore((state) => state.cancelPlacing)

  if (!isPlacing) return null
  return (
    <div className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg">
      Touchez la carte pour placer un point de repère
      <button
        type="button"
        onClick={cancelPlacing}
        aria-label="Annuler l'ajout du point de repère"
        className="text-ink-500 hover:text-ink-100 flex min-h-11 min-w-11 items-center justify-center"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

import { MapPinPlus, X } from 'lucide-react'
import { useWaypointsStore } from '../state/waypointsStore'

/** Floating "add waypoint" button. Tapping it arms placing mode — the
 * next tap on the map creates a real waypoint there (see
 * `waypointsStore.placeWaypointAt`) and opens it for editing. While
 * armed, the button turns into a banner + cancel, so the pending
 * "tap the map" state is never invisible. */
export function WaypointControl() {
  const isPlacing = useWaypointsStore((state) => state.isPlacing)
  const startPlacing = useWaypointsStore((state) => state.startPlacing)
  const cancelPlacing = useWaypointsStore((state) => state.cancelPlacing)

  if (isPlacing) {
    return (
      <div className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg">
        Tap the map to place a waypoint
        <button
          type="button"
          onClick={cancelPlacing}
          aria-label="Cancel placing a waypoint"
          className="text-ink-500 hover:text-ink-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={startPlacing}
      title="Add waypoint"
      aria-label="Add waypoint"
      className="border-surface-600 bg-surface-900/90 text-brand-400 hover:bg-surface-800 absolute top-44 right-3 z-10 rounded-lg border p-2.5 shadow-lg backdrop-blur-sm transition-colors"
    >
      <MapPinPlus size={18} aria-hidden="true" />
    </button>
  )
}

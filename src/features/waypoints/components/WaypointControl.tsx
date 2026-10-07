import { MapPinPlus, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { useWaypointsStore } from '../state/waypointsStore'

export interface WaypointControlProps {
  /** Field Mode (Phase 11): a larger touch target for one-handed/gloved
   * outdoor use. */
  large?: boolean
}

/** Floating "add waypoint" button. Tapping it arms placing mode — the
 * next tap on the map creates a real waypoint there (see
 * `waypointsStore.placeWaypointAt`) and opens it for editing. While
 * armed, the button turns into a banner + cancel, so the pending
 * "tap the map" state is never invisible. */
export function WaypointControl({ large }: WaypointControlProps = {}) {
  const isPlacing = useWaypointsStore((state) => state.isPlacing)
  const startPlacing = useWaypointsStore((state) => state.startPlacing)
  const cancelPlacing = useWaypointsStore((state) => state.cancelPlacing)

  if (isPlacing) {
    return (
      <div className="border-brand-500/40 bg-surface-900/95 text-ink-100 absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg">
        Touchez la carte pour placer un point de repère
        <button
          type="button"
          onClick={cancelPlacing}
          aria-label="Annuler l'ajout du point de repère"
          className="text-ink-500 hover:text-ink-100"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <ToolTrigger
      placement="rail"
      label="Ajouter un point de repère"
      icon={<MapPinPlus size={large ? 32 : 20} aria-hidden="true" />}
      onClick={startPlacing}
      active
      large={large}
      order={20}
    />
  )
}

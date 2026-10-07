import { useState } from 'react'
import { Crosshair, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import type { GeolocationReading } from '../useGeolocation'
import { MyPositionBlock } from './MyPositionBlock'

/** Tool-sheet entry "Ma position" + a compact card with the GPS state and
 * the (explicit, snapshot) share action. While a waypoint sheet is open the
 * card steps aside: that sheet carries its own "Ma position" block. */
export function MyPositionControl({ reading }: { reading: GeolocationReading }) {
  const [open, setOpen] = useState(false)
  const waypointSheetOpen = useWaypointsStore(
    (state) => state.draft !== null || state.editingId !== null,
  )

  return (
    <>
      <ToolTrigger
        label="Ma position"
        title="État du GPS et partage de ma position"
        icon={<Crosshair size={18} aria-hidden="true" />}
        onClick={() => setOpen(true)}
        order={5}
      />
      {open && !waypointSheetOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div
            role="dialog"
            aria-label="Ma position"
            className="border-surface-600 bg-surface-900 pointer-events-auto max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-lg border p-3 shadow-2xl"
          >
            <div className="mb-2 flex justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer Ma position"
                className="text-ink-500 hover:text-ink-100 flex h-11 w-11 items-center justify-center"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <MyPositionBlock reading={reading} />
          </div>
        </div>
      )}
    </>
  )
}

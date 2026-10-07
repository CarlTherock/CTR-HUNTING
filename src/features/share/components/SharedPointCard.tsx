import { Button } from '@/components/ui'
import { useWaypointsStore } from '@/features/waypoints/state/waypointsStore'
import { formatLatitude, formatLongitude } from '@/utils/coordinateFormat'
import { useSharedPointStore } from '../sharedPointStore'

/**
 * Compact card for the point received through a link. Everything is plain
 * React text (the name is never HTML). Saving is an explicit tap that opens
 * the usual new-waypoint form for a NEW waypoint; "Ignorer" just forgets the
 * preview. The card steps aside while a waypoint sheet is open.
 */
export function SharedPointCard({ onCenter }: { onCenter: () => void }) {
  const point = useSharedPointStore((state) => state.point)
  const dismiss = useSharedPointStore((state) => state.dismiss)
  const startDraftAt = useWaypointsStore((state) => state.startDraftAt)
  const waypointSheetOpen = useWaypointsStore(
    (state) => state.draft !== null || state.editingId !== null,
  )

  if (!point || waypointSheetOpen) return null

  function save() {
    if (!point) return
    startDraftAt(point.coordinate, point.name)
    dismiss()
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <section
        aria-label="Point partagé"
        data-testid="shared-point-card"
        className="border-surface-600 bg-surface-900 pointer-events-auto max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-lg border p-3 shadow-2xl"
      >
        <p className="text-ink-100 text-base font-semibold break-words">
          Point partagé : {point.name}
        </p>
        <p className="text-ink-100 mt-1 text-lg font-medium tabular-nums select-text">
          {formatLatitude(point.coordinate.lat)} · {formatLongitude(point.coordinate.lng)}
        </p>
        <p className="text-ink-500 mt-1 text-xs">
          Aperçu seulement : rien n’est enregistré sans votre accord.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="md" onClick={onCenter}>
            Centrer
          </Button>
          <Button variant="primary" size="md" onClick={save}>
            Enregistrer comme point de repère
          </Button>
          <Button variant="ghost" size="md" onClick={dismiss}>
            Ignorer
          </Button>
        </div>
      </section>
    </div>
  )
}

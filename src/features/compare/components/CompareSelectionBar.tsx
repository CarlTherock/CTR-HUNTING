import { Scale } from 'lucide-react'
import { Button } from '@/components/ui'
import { MAX_WAYPOINTS, MIN_WAYPOINTS } from '../criteria'
import { useCompareStore } from '../state/compareStore'

/** Barre « Comparer (N) » de la liste des points de repère : activée pour
 * 2 à 4 points cochés. */
export function CompareSelectionBar() {
  const count = useCompareStore((s) => s.selectedIds.length)
  const openPanel = useCompareStore((s) => s.openPanel)
  const clearSelection = useCompareStore((s) => s.clearSelection)
  const enabled = count >= MIN_WAYPOINTS && count <= MAX_WAYPOINTS

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          size="md"
          className="h-11"
          disabled={!enabled}
          aria-disabled={!enabled}
          onClick={openPanel}
        >
          <Scale size={16} aria-hidden="true" />
          Comparer ({count})
        </Button>
        {count > 0 && (
          <button
            type="button"
            onClick={clearSelection}
            className="text-ink-300 hover:text-ink-100 min-h-11 px-2 text-sm"
          >
            Tout décocher
          </button>
        )}
      </div>
      <p className="text-ink-500 text-xs">
        {count < MIN_WAYPOINTS
          ? `Cochez de ${MIN_WAYPOINTS} à ${MAX_WAYPOINTS} points de repère pour les comparer.`
          : `Maximum ${MAX_WAYPOINTS} points.`}
      </p>
    </div>
  )
}

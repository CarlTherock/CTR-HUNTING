import { hiddenByFilterMessage, ALL_TERRITORIES } from '../filter'
import { useTerritoriesStore } from '../state/territoriesStore'

/** Visible on the map whenever the territory filter hides items, so a
 * missing waypoint is never a mystery. One tap shows everything again. */
export function HiddenByFilterNotice({ hiddenCount }: { hiddenCount: number }) {
  const setFilter = useTerritoriesStore((state) => state.setFilter)
  if (hiddenCount <= 0) return null
  return (
    <button
      type="button"
      onClick={() => setFilter(ALL_TERRITORIES)}
      title="Afficher tous les territoires"
      className="border-status-warning/50 bg-surface-900/95 text-ink-100 pointer-events-auto flex min-h-11 items-center gap-2 rounded-md border px-3 text-xs shadow-lg"
    >
      <span>{hiddenByFilterMessage(hiddenCount)}</span>
      <span className="text-brand-400 font-medium">Tout afficher</span>
    </button>
  )
}

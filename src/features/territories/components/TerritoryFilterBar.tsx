import { useId } from 'react'
import { cn } from '@/utils/cn'
import {
  UNCLASSIFIED_LABEL,
  filterFromValue,
  filterToValue,
  sortTerritories,
} from '../filter'
import { useTerritoriesStore } from '../state/territoriesStore'
import { useEnsureTerritories } from '../useEnsureTerritories'

const SELECT =
  'border-surface-600 bg-surface-800 text-ink-100 focus-visible:outline-brand-400 min-h-11 w-full min-w-0 rounded-md border px-3 text-base outline-none focus-visible:outline-2'

/** The « Territoire » filter shared by the Waypoints, Traces and Journal
 * lists and by the map: Tous / each active territory / Non classé /
 * Archivés. */
export function TerritoryFilterBar({ className }: { className?: string }) {
  useEnsureTerritories()
  const territories = useTerritoriesStore((state) => state.territories)
  const filter = useTerritoriesStore((state) => state.filter)
  const setFilter = useTerritoriesStore((state) => state.setFilter)
  const id = useId()

  const active = sortTerritories(territories.filter((t) => !t.archivedAt))
  const hasArchived = territories.some((t) => t.archivedAt)

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-ink-500 text-xs font-medium">
        Territoire
      </label>
      <select
        id={id}
        value={filterToValue(filter)}
        onChange={(event) => setFilter(filterFromValue(event.target.value))}
        className={SELECT}
      >
        <option value="all">Tous</option>
        {active.map((territory) => (
          <option key={territory.id} value={`territory:${territory.id}`}>
            {territory.name}
          </option>
        ))}
        <option value="unclassified">{UNCLASSIFIED_LABEL}</option>
        {/* Also offered while selected, so the control never shows a value
            it cannot display. */}
        {(hasArchived || filter.kind === 'archived') && (
          <option value="archived">Territoires archivés</option>
        )}
      </select>
    </div>
  )
}

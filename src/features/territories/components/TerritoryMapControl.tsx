import { useState } from 'react'
import { FolderTree, X } from 'lucide-react'
import { ToolTrigger } from '@/components/map-tools'
import { useTerritoriesStore } from '../state/territoriesStore'
import { TerritoryFilterBar } from './TerritoryFilterBar'

/** « Territoire » tool of the map: the same filter as the lists, applied to
 * the waypoints drawn on the map. */
export function TerritoryMapControl() {
  const filtering = useTerritoriesStore((state) => state.filter.kind !== 'all')
  const [open, setOpen] = useState(false)

  return (
    <>
      <ToolTrigger
        label="Territoire"
        title="Filtrer la carte par territoire"
        icon={<FolderTree size={18} aria-hidden="true" />}
        onClick={() => setOpen((value) => !value)}
        pressed={open}
        active={filtering}
        order={55}
      />
      {open && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div
            role="dialog"
            aria-label="Filtre par territoire"
            className="border-surface-600 bg-surface-900/95 w-full max-w-sm rounded-lg border p-3 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-ink-100 text-sm font-semibold">Territoire</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="text-ink-500 hover:text-ink-100 flex size-11 items-center justify-center"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <TerritoryFilterBar />
            <p className="text-ink-500 mt-2 text-xs">
              Les points de repère de la carte suivent ce filtre. Les territoires se
              gèrent depuis la page Points de repère.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

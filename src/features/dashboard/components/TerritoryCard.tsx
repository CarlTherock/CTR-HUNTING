import { Link } from 'react-router-dom'
import { FolderTree } from 'lucide-react'
import { Badge } from '@/components/ui'
import { filterLabel } from '@/features/territories/filter'
import { useTerritoriesStore } from '@/features/territories/state/territoriesStore'
import { useEnsureTerritories } from '@/features/territories/useEnsureTerritories'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

/** The territory filter currently applied to the lists and the map. */
export function TerritoryCard() {
  useEnsureTerritories()
  const territories = useTerritoriesStore((s) => s.territories)
  const filter = useTerritoriesStore((s) => s.filter)
  const loaded = useTerritoriesStore((s) => s.loaded)

  const active = territories.filter((t) => !t.archivedAt)
  const filtered = filter.kind !== 'all'

  return (
    <DashboardCard icon={FolderTree} title="Territoire sélectionné">
      {!loaded ? (
        <p className="text-ink-500 text-sm">Chargement…</p>
      ) : (
        <>
          <p className="text-ink-100 flex flex-wrap items-center gap-2 text-sm">
            {filterLabel(filter, territories)}
            {filtered && <Badge variant="warning">Filtre actif</Badge>}
          </p>
          {territories.length === 0 ? (
            <Hint>
              Aucun territoire créé. Un territoire est un simple dossier pour classer vos
              points, traces et entrées.
            </Hint>
          ) : (
            <Hint>
              {active.length} territoire(s) actif(s)
              {filtered
                ? ' · le filtre masque les autres éléments sur la carte et dans les listes.'
                : '.'}
            </Hint>
          )}
        </>
      )}
      <div className="mt-auto">
        <Link to="/waypoints" className={LINK_BUTTON_CLASS}>
          {territories.length === 0 ? 'Créer un territoire' : 'Gérer les territoires'}
        </Link>
      </div>
    </DashboardCard>
  )
}

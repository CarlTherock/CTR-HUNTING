import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Badge } from '@/components/ui'
import {
  AREA_STATUS_LABEL,
  type EffectiveAreaStatus,
} from '@/features/offline/areaStatus'
import { useOfflineStore } from '@/features/offline/state/offlineStore'
import { offlineCounts } from '../summary'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

const ORDER: EffectiveAreaStatus[] = [
  'complete',
  'complete-unverified',
  'downloading',
  'incomplete',
  'interrupted',
  'error',
]

const VARIANT: Record<EffectiveAreaStatus, 'success' | 'warning' | 'danger' | 'neutral'> =
  {
    complete: 'success',
    'complete-unverified': 'neutral',
    downloading: 'neutral',
    incomplete: 'warning',
    interrupted: 'warning',
    error: 'danger',
  }

/** Downloaded map areas, counted by status. « Réessayer » stays in Réglages. */
export function OfflineCard() {
  const areas = useOfflineStore((s) => s.areas)
  const loaded = useOfflineStore((s) => s.loaded)
  const { total, byStatus } = offlineCounts(areas)
  const needsAttention = byStatus.incomplete + byStatus.interrupted + byStatus.error

  return (
    <DashboardCard icon={Download} title="Cartes téléchargées">
      {!loaded ? (
        <p className="text-ink-500 text-sm">Chargement…</p>
      ) : total === 0 ? (
        <p className="text-ink-300 text-sm">
          Aucune zone téléchargée. Sans zone, la carte demande le réseau.
        </p>
      ) : (
        <>
          <p className="text-ink-100 text-sm">{total} zone(s) enregistrée(s)</p>
          <ul className="flex flex-wrap gap-1.5" aria-label="Zones par statut">
            {ORDER.filter((status) => byStatus[status] > 0).map((status) => (
              <li key={status}>
                <Badge variant={VARIANT[status]}>
                  {byStatus[status]} · {AREA_STATUS_LABEL[status]}
                </Badge>
              </li>
            ))}
          </ul>
          {needsAttention > 0 && (
            <Hint>
              {needsAttention} zone(s) à reprendre : « Réessayer » est dans Réglages.
            </Hint>
          )}
        </>
      )}
      <div className="mt-auto">
        <Link to="/settings" className={LINK_BUTTON_CLASS}>
          Réglages des cartes
        </Link>
      </div>
    </DashboardCard>
  )
}

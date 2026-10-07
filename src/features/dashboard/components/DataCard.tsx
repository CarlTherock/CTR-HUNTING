import { Link } from 'react-router-dom'
import { DatabaseBackup } from 'lucide-react'
import { Badge } from '@/components/ui'
import { BackupReminder } from '@/features/backup/components/BackupReminder'
import { formatDateFr } from '@/features/backup/restoreLabels'
import { useBackupStore } from '@/features/backup/state/backupStore'
import { DashboardCard, Hint, LINK_BUTTON_CLASS } from './DashboardCard'

const PERSISTENCE: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  granted: { label: 'Stockage protégé : accordé', variant: 'success' },
  denied: { label: 'Stockage protégé : non accordé', variant: 'warning' },
  unavailable: { label: 'Stockage protégé : indisponible', variant: 'neutral' },
  unknown: { label: 'Stockage protégé : vérification…', variant: 'neutral' },
}

/** Backup and state of the data: reminder, last backup, item count and
 * whether the browser agreed to keep the storage. Reuses the backup store. */
export function DataCard() {
  const statusLoaded = useBackupStore((s) => s.statusLoaded)
  const lastBackupAt = useBackupStore((s) => s.lastBackupAt)
  const counts = useBackupStore((s) => s.counts)
  const persistence = useBackupStore((s) => s.persistence)
  const total = counts.waypoints + counts.tracks + counts.observations
  const persistenceView = PERSISTENCE[persistence] ?? PERSISTENCE.unknown

  return (
    <DashboardCard icon={DatabaseBackup} title="Sauvegarde et données">
      <BackupReminder />
      {statusLoaded ? (
        <>
          <p className="text-ink-100 text-sm">
            Dernière sauvegarde :{' '}
            <strong>{lastBackupAt ? formatDateFr(lastBackupAt) : 'jamais'}</strong>
          </p>
          <p className="text-ink-300 text-sm">
            {total} élément(s) sur cet appareil : {counts.waypoints} point(s) de repère,{' '}
            {counts.tracks} trace(s), {counts.observations} entrée(s) de journal.
          </p>
          <div>
            <Badge variant={persistenceView.variant}>{persistenceView.label}</Badge>
          </div>
          <Hint>
            Vos données ne sont que sur cet appareil : seule une sauvegarde en fichier les
            protège d’une perte.
          </Hint>
        </>
      ) : (
        <p className="text-ink-500 text-sm">Chargement…</p>
      )}
      <div className="mt-auto">
        <Link to="/settings#donnees-et-sauvegarde" className={LINK_BUTTON_CLASS}>
          Sauvegarde et restauration
        </Link>
      </div>
    </DashboardCard>
  )
}

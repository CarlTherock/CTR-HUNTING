import { formatBytes } from '@/utils/format'
import type { BackupTableName } from './engine/format'
import type { ConflictMode } from './engine/restoreApply'
import type { RestorePlan } from './engine/restorePlan'

export const TABLE_LABEL: Record<BackupTableName, string> = {
  territories: 'Territoires',
  waypoints: 'Points de repère',
  tracks: 'Traces',
  observations: 'Journal',
  photos: 'Photos',
  offlineAreas: 'Zones hors ligne (métadonnées)',
  settings: 'Réglages',
}

export const TABLE_ORDER: BackupTableName[] = [
  'territories',
  'waypoints',
  'tracks',
  'observations',
  'photos',
  'offlineAreas',
  'settings',
]

export function formatDateFr(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return 'date inconnue'
  return new Date(t).toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' })
}

/** What a restore would add with the current choice. */
export function wouldAdd(plan: RestorePlan, mode: ConflictMode): number {
  const copies =
    mode === 'keep-both'
      ? plan.items.filter((i) => i.status === 'conflict' && i.table !== 'settings').length
      : 0
  return plan.totals.new + copies
}

export function describeBackupResult(bytes: number, photoCount: number): string {
  return `${formatBytes(bytes)} · ${photoCount} photo(s)`
}

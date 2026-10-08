/**
 * When to gently remind the user to save an external backup. Pure: the
 * caller supplies « now », the last backup date and what is stored, so the
 * rule is trivial to test and has no hidden clock.
 *
 * Rules (documented in docs/BACKUP_FORMAT.md):
 *  - the reminder only concerns data the user entered: waypoints + tracks +
 *    journal entries (photos belong to those);
 *  - never backed up: remind from 10 items on;
 *  - backed up: remind when the last backup is more than 14 days old and
 *    there is at least one item;
 *  - a future or unreadable `lastBackupAt` is treated as « never ».
 */
export const REMINDER_MIN_ITEMS_WITHOUT_BACKUP = 10
export const REMINDER_MAX_AGE_DAYS = 14

export interface BackupCounts {
  waypoints: number
  tracks: number
  observations: number
}

export type BackupReminderState =
  | { show: false; reason: null; daysSince: number | null; totalItems: number }
  | {
      show: true
      reason: 'never' | 'stale'
      daysSince: number | null
      totalItems: number
    }

const DAY_MS = 24 * 60 * 60 * 1000

export function backupReminderState(
  now: Date,
  lastBackupAt: string | null | undefined,
  counts: BackupCounts,
): BackupReminderState {
  const totalItems = counts.waypoints + counts.tracks + counts.observations
  const last = lastBackupAt ? Date.parse(lastBackupAt) : Number.NaN
  const valid = !Number.isNaN(last) && last <= now.getTime()

  if (!valid) {
    return totalItems >= REMINDER_MIN_ITEMS_WITHOUT_BACKUP
      ? { show: true, reason: 'never', daysSince: null, totalItems }
      : { show: false, reason: null, daysSince: null, totalItems }
  }
  const daysSince = Math.floor((now.getTime() - last) / DAY_MS)
  const ageDays = (now.getTime() - last) / DAY_MS
  if (totalItems > 0 && ageDays > REMINDER_MAX_AGE_DAYS) {
    return { show: true, reason: 'stale', daysSince, totalItems }
  }
  return { show: false, reason: null, daysSince, totalItems }
}

export function backupReminderMessage(
  state: Extract<BackupReminderState, { show: true }>,
): string {
  if (state.reason === 'never') {
    return `Vous avez ${state.totalItems} éléments enregistrés sur cet appareil et aucune sauvegarde en dehors de l’application.`
  }
  return `Votre dernière sauvegarde remonte à ${state.daysSince} jours.`
}

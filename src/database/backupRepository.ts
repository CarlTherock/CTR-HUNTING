import { db } from './db'
import { getSetting, setSetting } from './settingsRepository'

/**
 * Small persistence helpers for the backup feature: when the last external
 * backup was made, whether its reminder was dismissed, and how much data
 * there is to protect. The backup engine itself lives in `features/backup`.
 *
 * These two settings are device-specific on purpose: they are NOT part of an
 * archive (see `isBackupSettingKey`).
 */
export const LAST_BACKUP_KEY = 'lastBackupAt'
export const REMINDER_DISMISSED_KEY = 'backupReminderDismissedUntil'

export async function getLastBackupAt(): Promise<string | null> {
  return getSetting<string | null>(LAST_BACKUP_KEY, null)
}

export async function setLastBackupAt(iso: string): Promise<void> {
  await setSetting(LAST_BACKUP_KEY, iso)
}

export async function getReminderDismissedUntil(): Promise<string | null> {
  return getSetting<string | null>(REMINDER_DISMISSED_KEY, null)
}

export async function setReminderDismissedUntil(iso: string): Promise<void> {
  await setSetting(REMINDER_DISMISSED_KEY, iso)
}

export interface UserDataCounts {
  waypoints: number
  tracks: number
  observations: number
  photos: number
}

export async function countUserData(): Promise<UserDataCounts> {
  const [waypoints, tracks, observations, photos] = await Promise.all([
    db.waypoints.count(),
    db.tracks.count(),
    db.observations.count(),
    db.photos.count(),
  ])
  return { waypoints, tracks, observations, photos }
}

import { useEffect } from 'react'
import { backupReminderState, type BackupReminderState } from './backupReminder'
import { useBackupStore } from './state/backupStore'

/** Reminder state for the current data, honouring a dismissal. */
export function useBackupReminder(now: Date = new Date()): {
  state: BackupReminderState
  dismiss: () => void
} {
  const statusLoaded = useBackupStore((s) => s.statusLoaded)
  const loadStatus = useBackupStore((s) => s.loadStatus)
  const lastBackupAt = useBackupStore((s) => s.lastBackupAt)
  const counts = useBackupStore((s) => s.counts)
  const dismissedUntil = useBackupStore((s) => s.dismissedUntil)
  const dismissReminder = useBackupStore((s) => s.dismissReminder)

  useEffect(() => {
    if (!statusLoaded) void loadStatus()
  }, [statusLoaded, loadStatus])

  const base = backupReminderState(now, lastBackupAt, counts)
  const dismissed = dismissedUntil !== null && Date.parse(dismissedUntil) > now.getTime()
  const state: BackupReminderState =
    statusLoaded && !dismissed
      ? base
      : {
          show: false,
          reason: null,
          daysSince: base.daysSince,
          totalItems: base.totalItems,
        }
  return { state, dismiss: () => void dismissReminder() }
}

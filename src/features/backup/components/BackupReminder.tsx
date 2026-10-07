import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { backupReminderMessage } from '../backupReminder'
import { useBackupReminder } from '../useBackupReminder'

/**
 * Discreet, dismissible, never blocking. Reusable anywhere (the dashboard
 * mounts it); it needs a Router context for its link.
 */
export function BackupReminder({ now }: { now?: Date }) {
  const { state, dismiss } = useBackupReminder(now)
  if (!state.show) return null
  return (
    <div
      role="status"
      className="border-surface-700 bg-surface-900 text-ink-300 flex items-start gap-3 rounded-lg border p-3 text-sm"
    >
      <p className="min-w-0 flex-1">
        {backupReminderMessage(state)}{' '}
        <Link
          to="/settings#donnees-et-sauvegarde"
          className="text-brand-400 font-medium underline"
        >
          Sauvegarder maintenant
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Fermer le rappel de sauvegarde"
        className="text-ink-500 hover:text-ink-100 flex size-8 shrink-0 items-center justify-center pointer-coarse:size-11"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { getSetting, setSetting } from '@/database/settingsRepository'

export type LocalStorageProbe =
  | { status: 'checking' }
  | { status: 'ready'; openedBefore: boolean }
  | { status: 'error' }

/** Round-trips a flag through IndexedDB (read, then write) so the app
 * ships with at least one real offline read/write check, not a stub.
 * Reports `error` when the local database can't be read — never a guessed
 * "first opening" answer. */
export function useLocalStorageProbe(): LocalStorageProbe {
  const [probe, setProbe] = useState<LocalStorageProbe>({ status: 'checking' })

  useEffect(() => {
    let cancelled = false
    getSetting('hasOpenedSettings', false).then(
      (openedBefore) => {
        if (cancelled) return
        setProbe({ status: 'ready', openedBefore })
        // Best effort: failing to record the visit must not surface as an
        // unhandled rejection or change the (already correct) answer.
        void setSetting('hasOpenedSettings', true).catch(() => undefined)
      },
      () => {
        if (!cancelled) setProbe({ status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return probe
}

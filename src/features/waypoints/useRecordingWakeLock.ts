import { useEffect, useState } from 'react'
import { isWakeLockSupported, requestScreenWakeLock } from '@/services/wakeLock'
import type { WakeLockHandle } from '@/services/wakeLock'

export type WakeLockStatus = 'inactive' | 'held' | 'unavailable'

/**
 * Holds a screen wake lock while `active`, and takes it again when the page
 * becomes visible (the system drops it whenever the page is hidden).
 * `unavailable` means the screen may lock and cut the recording — the UI
 * says so instead of pretending otherwise.
 */
export function useRecordingWakeLock(active: boolean): WakeLockStatus {
  const [held, setHeld] = useState(false)
  const [refused, setRefused] = useState(false)

  useEffect(() => {
    if (!active) return
    let handle: WakeLockHandle | null = null
    let cancelled = false

    async function acquire() {
      if (handle || document.visibilityState !== 'visible') return
      const next = await requestScreenWakeLock(() => {
        handle = null
        if (!cancelled) setHeld(false)
      })
      if (cancelled) {
        void next?.release()
        return
      }
      handle = next
      setHeld(next !== null)
      setRefused(next === null)
    }

    void acquire()
    function onVisibility() {
      if (document.visibilityState === 'visible') void acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      void handle?.release()
      handle = null
      setHeld(false)
    }
  }, [active])

  if (!active) return 'inactive'
  if (held) return 'held'
  return !isWakeLockSupported() || refused ? 'unavailable' : 'inactive'
}

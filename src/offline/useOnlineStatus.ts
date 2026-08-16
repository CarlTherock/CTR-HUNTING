import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot(): boolean {
  return navigator.onLine
}

function getServerSnapshot(): boolean {
  // No network concept during SSR/build; assume online.
  return true
}

/**
 * Reactive `navigator.onLine` wrapper. This only reflects browser-reported
 * connectivity (link state), not actual reachability of any given API — a
 * device can report "online" while a specific provider is unreachable.
 * Feature-level services are responsible for their own request failure
 * handling on top of this signal.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

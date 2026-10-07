import { useEffect } from 'react'
import type { RefObject } from 'react'
import { gpsFreshness } from '@/features/gps/gpsFreshness'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type { MapInstance } from '@/services/map'
import { useFollowStore } from './state/followStore'

/** True when a GPS reading may recentre the map while following: an available
 * fix that is RECENT. An old or stale fix, or no fix, never moves the map. */
export function canRecenterOn(reading: GeolocationReading, nowMs: number): boolean {
  return (
    reading.status === 'available' &&
    gpsFreshness(nowMs, reading.value.timestampMs) === 'recent'
  )
}

/**
 * While the follow mode is `following`, recentres the map on each new recent
 * GPS fix (keeping the user's zoom, pitch and rotation). The move is made
 * through the adapter's `setView`, which is not a user gesture, so it never
 * pauses the follow by itself. No timer: it only reacts to new fixes.
 */
export function useFollowPosition(
  instanceRef: RefObject<MapInstance | null>,
  gpsReading: GeolocationReading,
): void {
  const mode = useFollowStore((state) => state.mode)
  useEffect(() => {
    if (mode !== 'following' || gpsReading.status !== 'available') return
    if (!canRecenterOn(gpsReading, Date.now())) return
    instanceRef.current?.setView({
      center: { lat: gpsReading.value.lat, lng: gpsReading.value.lng },
    })
  }, [mode, gpsReading, instanceRef])
}

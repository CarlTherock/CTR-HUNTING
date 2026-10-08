import { gpsFreshness } from '@/features/gps/gpsFreshness'
import type { GeolocationReading } from '@/features/gps/useGeolocation'
import type { Coordinate } from '@/types'

/** Above this horizontal accuracy radius (metres) a fix is flagged as
 * imprecise. Only the accuracy reported by the receiver counts — it is never
 * guessed from the number of decimals of the coordinates. */
export const LOW_ACCURACY_METERS = 25

export type MarkerPosition =
  /** A usable fix: the phone's real, recent position. */
  | {
      kind: 'ready'
      coordinate: Coordinate
      lowAccuracy: boolean
      /** `old`: the fix is 15 s to 2 min old — usable but flagged. */
      freshness: 'recent' | 'old'
    }
  /** No fix, or one that is too old to be « my position ». The caller waits
   * for a fix or lets the user place the point by hand — never the map centre. */
  | { kind: 'unavailable'; reason: 'no-fix' | 'stale' }

/** Decides which position a « + Sang » press may use. */
export function resolveMarkerPosition(
  reading: GeolocationReading,
  nowMs: number,
): MarkerPosition {
  if (reading.status !== 'available') return { kind: 'unavailable', reason: 'no-fix' }
  const { value } = reading
  const freshness = gpsFreshness(nowMs, value.timestampMs)
  if (freshness === 'stale') return { kind: 'unavailable', reason: 'stale' }
  const coordinate: Coordinate = { lat: value.lat, lng: value.lng }
  if (value.altitude !== undefined) coordinate.altitude = value.altitude
  if (value.accuracyMeters !== undefined) coordinate.accuracyMeters = value.accuracyMeters
  const lowAccuracy =
    value.accuracyMeters === undefined || value.accuracyMeters > LOW_ACCURACY_METERS
  return { kind: 'ready', coordinate, lowAccuracy, freshness }
}

/** A fix good enough to START recording a session. */
export function isUsableForStart(reading: GeolocationReading, nowMs: number): boolean {
  return resolveMarkerPosition(reading, nowMs).kind === 'ready'
}

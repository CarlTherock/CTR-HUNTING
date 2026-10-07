import { useEffect, useState } from 'react'
import type { Coordinate } from '@/types'

/** A real GPS fix. `courseDegrees`/`speedMps` are the direction and speed of
 * TRAVEL reported by the receiver (only when finite): they are NOT the
 * direction the phone is pointing and must never be used as a compass. */
export interface GpsFix extends Coordinate {
  /** `GeolocationPosition.timestamp` — when the fix was taken (epoch ms). */
  timestampMs: number
  courseDegrees?: number
  speedMps?: number
}

/** Why there is no position right now. */
export type GpsUnavailableKind =
  'searching' | 'denied' | 'unsupported' | 'unavailable' | 'timeout'

/** Structurally compatible with `DataPoint<Coordinate>`: consumers that only
 * test `.status === 'available'` and read `.value` / `.reason` keep working. */
export type GeolocationReading =
  | {
      status: 'available'
      value: GpsFix
      confidence: 'measured'
      source: 'browser-geolocation'
    }
  | { status: 'unavailable'; reason: string; kind: GpsUnavailableKind }

function geolocationSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/** French message and kind by standard error code; anything unexpected keeps
 * the browser's own message (never hides a real diagnostic). */
function describeGeolocationError(error: GeolocationPositionError): {
  kind: GpsUnavailableKind
  reason: string
} {
  if (error.code === 1) {
    return { kind: 'denied', reason: 'Autorisation de localisation refusée.' }
  }
  if (error.code === 2) {
    return { kind: 'unavailable', reason: 'Position indisponible pour le moment.' }
  }
  if (error.code === 3) {
    return { kind: 'timeout', reason: 'Délai dépassé en attendant le signal GPS.' }
  }
  return { kind: 'unavailable', reason: error.message }
}

function finiteOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Continuously watches the device's GPS position via the browser
 * Geolocation API. A missing fix (no permission yet, denied, unsupported,
 * signal lost) is always `unavailable` with a `kind` and a reason — per the
 * project's data-quality rule, never guessed or defaulted to a prior/fake
 * position (and never the map centre).
 *
 * The returned object only changes when a new fix or error arrives, so it is
 * safe as an effect dependency. Components that show the *age* of a fix read
 * the clock separately with `useGpsClock`.
 */
export function useGeolocation(): GeolocationReading {
  const [reading, setReading] = useState<GeolocationReading>(() =>
    geolocationSupported()
      ? {
          status: 'unavailable',
          kind: 'searching',
          reason: 'En attente d’un signal GPS.',
        }
      : {
          status: 'unavailable',
          kind: 'unsupported',
          reason: 'La géolocalisation n’est pas prise en charge par ce navigateur.',
        },
  )

  useEffect(() => {
    if (!geolocationSupported()) return

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { coords } = position
        setReading({
          status: 'available',
          value: {
            lat: coords.latitude,
            lng: coords.longitude,
            altitude: coords.altitude ?? undefined,
            accuracyMeters: coords.accuracy,
            // The fix's own time. Only if the browser gives none do we use
            // the moment we received it (never an invented earlier time).
            timestampMs: Number.isFinite(position.timestamp)
              ? position.timestamp
              : Date.now(),
            courseDegrees: finiteOrUndefined(coords.heading),
            speedMps: finiteOrUndefined(coords.speed),
          },
          confidence: 'measured',
          source: 'browser-geolocation',
        })
      },
      (error) => {
        setReading({ status: 'unavailable', ...describeGeolocationError(error) })
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return reading
}

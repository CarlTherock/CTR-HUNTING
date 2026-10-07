import { useEffect, useState } from 'react'
import type { Coordinate, DataPoint } from '@/types'

export type GeolocationReading = DataPoint<Coordinate>

/** French message by standard error code; falls back to the browser's own
 * message for anything unexpected (never hides a real diagnostic). */
function describeGeolocationError(error: GeolocationPositionError): string {
  if (error.code === 1) return 'Autorisation de localisation refusée.'
  if (error.code === 2) return 'Position indisponible pour le moment.'
  if (error.code === 3) return 'Délai dépassé en attendant le signal GPS.'
  return error.message
}

/**
 * Continuously watches the device's GPS position via the browser
 * Geolocation API. A missing fix (no permission yet, denied, unsupported,
 * signal lost) is always `unavailable` with a reason — per the project's
 * data-quality rule, never guessed or defaulted to a prior/fake position.
 */
export function useGeolocation(): GeolocationReading {
  const [reading, setReading] = useState<GeolocationReading>(() =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator
      ? { status: 'unavailable', reason: 'En attente d’un signal GPS.' }
      : {
          status: 'unavailable',
          reason: 'La géolocalisation n’est pas prise en charge par ce navigateur.',
        },
  )

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setReading({
          status: 'available',
          value: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            altitude: position.coords.altitude ?? undefined,
            accuracyMeters: position.coords.accuracy,
          },
          confidence: 'measured',
          source: 'browser-geolocation',
        })
      },
      (error) => {
        setReading({ status: 'unavailable', reason: describeGeolocationError(error) })
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return reading
}

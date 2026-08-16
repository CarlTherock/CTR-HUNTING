import { useEffect, useState } from 'react'
import type { Coordinate, DataPoint } from '@/types'

export type GeolocationReading = DataPoint<Coordinate>

/**
 * Continuously watches the device's GPS position via the browser
 * Geolocation API. A missing fix (no permission yet, denied, unsupported,
 * signal lost) is always `unavailable` with a reason — per the project's
 * data-quality rule, never guessed or defaulted to a prior/fake position.
 */
export function useGeolocation(): GeolocationReading {
  const [reading, setReading] = useState<GeolocationReading>(() =>
    typeof navigator !== 'undefined' && 'geolocation' in navigator
      ? { status: 'unavailable', reason: 'Waiting for a GPS fix.' }
      : { status: 'unavailable', reason: 'Geolocation is not supported by this browser.' },
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
        setReading({ status: 'unavailable', reason: error.message })
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return reading
}

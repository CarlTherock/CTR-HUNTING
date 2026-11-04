import { useEffect } from 'react'
import { useCompassHeading } from '@/features/field-mode/useCompassHeading'
import { useGuidanceDestination } from '@/features/guidance/state/guidanceStore'
import type { MapInstance } from '@/services/map'
import type { GeolocationReading } from '../useGeolocation'
import { useHeadingConeStore } from '../state/headingConeStore'

interface HeadingConeProps {
  gpsReading: GeolocationReading
  getMapInstance: () => MapInstance | null
}

/**
 * Direction cone on the blue « you are here » dot (like Google Maps): it shows
 * where the TOP of the phone points. Real device compass only — never the GPS
 * travel direction, and no cone at all when the heading is missing or doubtful.
 * While « Aller à » is active the guidance panel drives the cone itself.
 */
export function HeadingCone({ gpsReading, getMapInstance }: HeadingConeProps) {
  const guiding = useGuidanceDestination() !== null
  const position = gpsReading.status === 'available' ? gpsReading.value : null
  const compass = useCompassHeading({ position, enabled: !guiding })
  const setRequester = useHeadingConeStore((state) => state.setRequester)
  const { needsPermission, requestPermission } = compass

  // Only expose the request while the compass still waits for a gesture.
  useEffect(() => {
    setRequester(needsPermission ? requestPermission : null)
    return () => setRequester(null)
  }, [needsPermission, requestPermission, setRequester])

  const heading =
    !guiding && position !== null && compass.reliable && compass.trueHeading !== null
      ? compass.trueHeading
      : null
  useEffect(() => {
    if (guiding) return
    getMapInstance()?.setUserHeading(heading)
  }, [getMapInstance, guiding, heading])

  useEffect(
    () => () => {
      getMapInstance()?.setUserHeading(null)
    },
    [getMapInstance],
  )

  return null
}
